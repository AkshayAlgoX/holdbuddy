import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CallRuntime, TooManySessionsError } from '../packages/call-runtime/src/runtime.js';
import { SessionCommandFailure } from '../packages/call-runtime/src/call-session.js';
import { createOfflineMockBinding } from '../packages/call-runtime/src/stt.js';
import { PROTOCOL_VERSION, type RuntimeEvent, type SessionView } from '../packages/call-runtime/src/protocol.js';
import { SimulatorEngine } from '../packages/simulator/src/simulator/simulator-core.js';
import { FixtureCatalog } from '../packages/simulator/src/audio/fixture-loader.js';
import { computeSha256, parseWav } from '../packages/simulator/src/audio/wav.js';
import type { AudioSegmentSink } from '../packages/simulator/src/audio/audio-client.js';
import {
  NativeSessionCoordinator,
  getNativeReadiness,
  isLocalLoopbackRequest,
  NativeAdapterError,
} from './native-adapter.js';
import scenarios from '../scenarios.json';

const TOKEN = /^[a-f0-9]{64}$/;
const ID = '[A-Za-z0-9_.:-]{1,128}';
const API_ROUTE = new RegExp(`^/api/v1/sessions/(${ID})(?:/(events|stop|takeover|human-decision|clarification))?$`);
const NATIVE_SESSION_ROUTE = new RegExp(`^/api/v1/native/session/(${ID})(?:/(events|stop))?$`);
const AUDIO_ROUTE = new RegExp(`^/judge-audio/v1/sessions/(${ID})/prompts/(${ID})/fragments/(0)$`);
const MAX_VISITORS = 128, MAX_CALLS = 8, MAX_REQUEST_BYTES = 2048;
const MAX_STREAMS = 2, VISITOR_MS = 30 * 60_000, IDLE_MS = 5 * 60_000;
const TYPES: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};

class PublicFailure extends Error { constructor(readonly status:number, readonly code:string) {super(code);} }
interface Clip { bytes:Buffer; script:string; durationMs:number; }
interface Call { runtime:CallRuntime; engine:SimulatorEngine; mirror:Mirror; sessionId?:string; streams:Set<ServerResponse>; audioReads:Map<string,number>; audioBytes:number; timer?:NodeJS.Timeout; }
interface Visitor { created:number; touched:number; starts:number; starting:boolean; call?:Call; }
interface Options { origin:string; host?:string; port?:number; distDir?:string; timingScale?:number; maxCallMs?:number; idleMs?:number; }

// Public wire projection. Only fields needed to draw the approved call experience leave this process.
const EVENT_FIELDS: Record<string,string[]> = {
 'session.started':['sttMode','protocolVersion'], 'session.status_changed':['from','to'], 'session.closed':['outcome','failure','dtmfInFlight'],
 'source.started':['segmentId','promptId','sourceSequence'], 'audio.segment_received':['segmentId','promptId','fragmentIndex','bytes'],
 'audio.segment_accepted':['segmentId','promptId','durationMs','promptComplete'], 'audio.segment_rejected':['segmentId','promptId','reasons'],
 'stt.started':['segmentId','providerId'], 'stt.failed':['segmentId','code','fatal'],
 'transcript.observed':['segmentId','promptId','observationId','status','transcript','promptComplete','provenance'],
 'decision.made':['observationId','decision','provenance'], 'decision.abstained':['reason'],
 'dtmf.requested':['actionId','digit','ackDeadlineMs','provenance'], 'dtmf.acknowledged':['actionId','digit','outcome'],
 'dtmf.unknown':['actionId','digit'], 'dtmf.refused':['actionId','digit','refusal'], 'dtmf.withdrawn':['actionId','digit','reason'],
 'clarification.requested':['requestId','reason','candidates','answerDeadlineMs'], 'clarification.answered':['requestId'],
 'hold.started':[], 'hold.ended':['to'], 'handoff.possible_human':['requestId','evidence','confirmDeadlineMs'],
 'handoff.assessed':['requestId','assessment','by'], 'handoff.confirmed':['requestId','by'], 'handoff.rejected':['requestId','by'], 'handoff.expired':['requestId'],
};
function eventForVisitor(event:RuntimeEvent) {
 const source = event as unknown as Record<string,unknown>;
 const out:Record<string,unknown> = {};
 for(const k of ['eventId','sessionId','seq','at','atMs','dataSource','type',...(EVENT_FIELDS[event.type]??[])]) if(source[k]!==undefined) out[k]=source[k];
 if(!EVENT_FIELDS[event.type]) { out.type='public.notice'; }
 return out;
}
function viewForVisitor(view:SessionView) {
 const {protocolVersion,sessionId,status,closed,sttMode,goal,lastSeq,pendingPress,pendingRequest,closure,simulatorStop}=view;
 return {protocolVersion,sessionId,status,closed,sttMode,goal,lastSeq,pendingPress,pendingRequest,closure,simulatorStop};
}

// Paces the existing simulator's trusted sink. No client can upload audio or inject transcripts.
class Mirror {
 clips=new Map<string,Clip>(); closed=false;
 #first?:Promise<void>; #waiters=new Set<()=>void>();
 constructor(readonly scale:number,readonly scripts:Map<string,string>) {}
 sleep(ms:number) {return new Promise<void>(done=>{if(this.closed)return done(); const finish=()=>{clearTimeout(timer);this.#waiters.delete(finish);done();};const timer=setTimeout(finish,ms*this.scale);this.#waiters.add(finish);});}
 wrap(sink:AudioSegmentSink):AudioSegmentSink {return {
  sourceStarted:async(id,n)=>{await this.#first; if(!this.closed)await sink.sourceStarted?.(id,n);},
  uploadSegment:async(id,meta,wav)=>{
   if(this.closed)return;
   const script=this.scripts.get(computeSha256(wav)); if(!script)throw new Error('Unapproved public audio');
   const bytes=Buffer.from(wav); const durationMs=parseWav(bytes)!.durationMs;
   if(this.clips.size>=16)throw new Error('Clip limit');
   this.clips.set(`${meta.promptId}/${meta.fragmentIndex}`,{bytes,script,durationMs});
   const deliver=async()=>{await this.sleep(durationMs+300); if(!this.closed)await sink.uploadSegment(id,meta,wav);};
   if(!this.#first){this.#first=deliver().catch(()=>{});return;}
   await this.#first; await deliver();
  }
 };}
 close(){this.closed=true;for(const wake of [...this.#waiters])wake();}
}

async function readJson(req:IncomingMessage, keys:string[]) {
 if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new PublicFailure(415,'unsupported_media_type');
 if(Number(req.headers['content-length']??0)>MAX_REQUEST_BYTES)throw new PublicFailure(413,'body_too_large');
 let size=0;const chunks:Buffer[]=[];
 for await(const raw of req){const b=Buffer.from(raw);size+=b.length;if(size>MAX_REQUEST_BYTES)throw new PublicFailure(413,'body_too_large');chunks.push(b);}
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new PublicFailure(400,'invalid_json');}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new PublicFailure(400,'invalid_request');
 return value as Record<string,unknown>;
}
function json(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}

export async function createApplication(options:Options) {
 const dist=options.distDir??dirname(fileURLToPath(import.meta.url));
 const publicOrigin=new URL(options.origin); if(!['http:','https:'].includes(publicOrigin.protocol)||publicOrigin.origin!==options.origin)throw new Error('Invalid public origin');
 const scale=options.timingScale??1;
 const maxCallMs=options.maxCallMs??180_000;
 const fixtures=new FixtureCatalog();const scripts=new Map<string,string>();
 const entries=JSON.parse(await readFile(join(dist,'audio/scripts.json'),'utf8')) as {file:string;language:string;script:string}[];
 const assetNames=new Set(entries.map(e=>e.file));
 for(const scenario of scenarios)for(const step of Object.values(scenario.steps)){
  const p=step.prompt;const entry=entries.find(e=>e.language===p.language&&e.script===p.text);if(!entry||!/^prompt-\d{2}\.wav$/.test(entry.file))throw new Error('Missing public speech');
  const bytes=await readFile(join(dist,'audio',entry.file));const meta=parseWav(bytes);if(!meta||meta.durationMs>40_000||bytes.length>1_300_000)throw new Error('Invalid public speech');
  const hash=computeSha256(bytes);scripts.set(hash,p.text);
  fixtures.registerFixture({id:p.id,transcript:p.text,language:p.language,status:'NOT_VERIFIED_FOR_SPEECH',sha256:hash,durationMs:meta.durationMs,sampleRate:meta.sampleRate},bytes);
 }
 if(assetNames.size!==entries.length)throw new Error('Duplicate public asset');
 // Strict static allowlist, loaded once. There is no path-to-filesystem mapping at request time.
 const staticFiles=new Map<string,{bytes:Buffer;type:string}>();
 async function loadPublic(dir:string,prefix='') {for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.isDirectory())await loadPublic(join(dir,e.name),`${prefix}/${e.name}`);
  else if(e.isFile()){const suffix=e.name.slice(e.name.lastIndexOf('.'));if(!TYPES[suffix])throw new Error('Unexpected public file');staticFiles.set(`${prefix}/${e.name}`,{bytes:await readFile(join(dir,e.name)),type:TYPES[suffix]!});}
  else throw new Error('Links cannot be served');
 }}
 await loadPublic(join(dist,'public'));
 const traffic={hour:{start:Date.now(),bytes:0},day:{start:Date.now(),bytes:0}};
 function spendBytes(bytes:number){const now=Date.now();for(const [key,ms,limit] of [['hour',3600000,512*1024*1024],['day',86400000,2*1024*1024*1024]] as const){const bucket=traffic[key];if(now-bucket.start>=ms){bucket.start=now;bucket.bytes=0;}if(bucket.bytes+bytes>limit)throw new PublicFailure(429,'egress_limited');}traffic.hour.bytes+=bytes;traffic.day.bytes+=bytes;}
 const visitors=new Map<string,Visitor>();const rates=new Map<string,{at:number,n:number}>();
 let closing=false;
 function limit(key:string,max:number,ms=60_000){const now=Date.now();let b=rates.get(key);if(!b||now-b.at>=ms){b={at:now,n:0};rates.set(key,b);}if(++b.n>max)throw new PublicFailure(429,'rate_limited');}
 function auth(req:IncomingMessage){const t=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization??'')?.[1];const owner=t?visitors.get(t):undefined;if(!owner||Date.now()-owner.created>VISITOR_MS)throw new PublicFailure(401,'unauthorized');owner.touched=Date.now();limit(`visitor:${t}`,180);return owner;}
 function activeSlots(){return [...visitors.values()].filter(v=>v.starting||(v.call&&(!v.call.runtime.get(v.call.sessionId??'')?.closed||v.call.runtime.get(v.call.sessionId??'')?.view().simulatorStop!=='confirmed'))).length;}
 async function retire(v:Visitor){const call=v.call;if(!call)return;clearTimeout(call.timer);call.mirror.close();for(const s of call.streams)s.end();await call.runtime.shutdown();await call.engine.shutdown();v.call=undefined;}
 const sweep=setInterval(()=>{
  const now=Date.now();for(const [token,v]of visitors){if(!v.starting&&(now-v.created>VISITOR_MS||now-v.touched>(options.idleMs??IDLE_MS))){void retire(v).then(()=>visitors.delete(token)).catch(()=>{});}}
  for(const [key,r]of rates)if(now-r.at>60_000)rates.delete(key);
 },1000);sweep.unref();

 async function route(req:IncomingMessage,res:ServerResponse){
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('permissions-policy','microphone=(), camera=(), geolocation=(), payment=()');
  if(publicOrigin.protocol==='https:')res.setHeader('strict-transport-security','max-age=31536000');
  if(closing)throw new PublicFailure(503,'unavailable');
  if(req.headers.host!==publicOrigin.host)throw new PublicFailure(403,'forbidden_host');
  if(req.headers.origin!==undefined&&req.headers.origin!==publicOrigin.origin)throw new PublicFailure(403,'forbidden_origin');
  // Public documents may be opened from another site; API routes never receive this exception.
  const publicDocumentNavigation=(req.method==='GET'||req.method==='HEAD')&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document'&&/^(?:\/|\/index\.html|\/healthz)(?:\?|$)/u.test(req.url??'');
  if(req.headers['sec-fetch-site']==='cross-site'&&!publicDocumentNavigation)throw new PublicFailure(403,'forbidden_origin');
  const raw=req.url??'';const rawPath=raw.split('?',1)[0]!;
  const publicRead=(req.method==='GET'||req.method==='HEAD')&&['/','/index.html','/healthz'].includes(rawPath);
  if(raw.length>800||!raw.startsWith('/')||raw.startsWith('//')||/[\\%]/.test(rawPath)||raw.includes('\\')||(!publicRead&&raw.includes('%')))throw new PublicFailure(404,'not_found');
  const url=new URL(raw,publicOrigin);const path=url.pathname;const method=req.method;
  // Health exposes no session inventory, lifecycle identity, paths or diagnostic configuration.
  if((method==='GET'||method==='HEAD')&&path==='/healthz'){
   const body=JSON.stringify({ok:true});
   res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body)});
   return res.end(method==='HEAD'?undefined:body);
  }
  limit('requests',2000);
  if((method==='GET'||method==='HEAD')&&(path==='/'||staticFiles.has(path))){
   const file=staticFiles.get(path==='/'?'/index.html':path)!;
   if(method!=='HEAD')spendBytes(file.bytes.length);
   res.writeHead(200,{'content-type':file.type,'content-length':file.bytes.length,'cache-control':path.startsWith('/assets/')?'public, max-age=86400':'no-store'});
   return res.end(method==='HEAD'?undefined:file.bytes);
  }
  if(path==='/api/bootstrap'&&method==='POST'){
   limit('bootstrap',30);await readJson(req,[]);if(visitors.size>=MAX_VISITORS)throw new PublicFailure(429,'too_many_sessions');
   const token=randomBytes(32).toString('hex');visitors.set(token,{created:Date.now(),touched:Date.now(),starts:0,starting:false});return json(res,201,{token,expiresInSeconds:VISITOR_MS/1000});
  }
  if(path==='/api/v1/native/status'&&method==='GET'){
   limit('native-status',60);
   const readiness=getNativeReadiness(publicOrigin,req);
   return json(res,200,readiness);
  }
  if(path==='/api/v1/native/transactions'&&method==='GET'){
   if(!isLocalLoopbackRequest(req,publicOrigin))throw new PublicFailure(403,'forbidden_origin');
   limit('native-transactions',60);
   const txns=NativeSessionCoordinator.instance.getLiveTransactions();
   return json(res,200,{ok:true,count:txns.length,transactions:txns});
  }
  if(path==='/api/v1/native/session'&&method==='POST'){
   limit('native-session-starts',10);
   const body=await readJson(req,['mode','goal','authorizationPhrase']);
   const result=await NativeSessionCoordinator.instance.startSession(req,body,publicOrigin);
   return json(res,201,result);
  }
  const nativeMatch=NATIVE_SESSION_ROUTE.exec(path);
  if(nativeMatch){
   const id=nativeMatch[1]!;
   const action=nativeMatch[2];
   if(!isLocalLoopbackRequest(req,publicOrigin))throw new PublicFailure(403,'forbidden_origin');
   const session=NativeSessionCoordinator.instance.getActiveSession(id);
   if(!session)throw new PublicFailure(404,'not_found');
   if(method==='GET'&&action==='events'){
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','x-accel-buffering':'no'});
    res.flushHeaders();
    session.streams.add(res);
    let done=false;
    const finish=()=>{if(done)return;done=true;session.streams.delete(res);};
    res.once('close',finish);
    for(const e of session.events){
     if(done)break;
     res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    }
    if(session.closed){finish();res.end();return;}
    return;
   }
   if(method==='POST'&&action==='stop'){
    await readJson(req,[]);
    session.stop();
    return json(res,200,{ok:true,sessionId:id,status:'stopped'});
   }
   throw new PublicFailure(404,'not_found');
  }
  const matched=API_ROUTE.exec(path);const audio=AUDIO_ROUTE.exec(path);
  if(!matched&&!audio&&!['/api/v1/health','/api/connection','/api/v1/sessions'].includes(path))throw new PublicFailure(404,'not_found');
  if(url.search&&(!audio||[...url.searchParams.keys()].some(k=>k!=='waitMs')))throw new PublicFailure(400,'invalid_request');
  const v=auth(req);
  if(method==='GET'&&path==='/api/connection')return json(res,200,{ok:true});
  if(method==='GET'&&path==='/api/v1/health')return json(res,200,{ok:true,protocolVersion:PROTOCOL_VERSION,sttMode:'offline_mock'});
  if(method==='POST'&&path==='/api/v1/sessions'){
   const body=await readJson(req,['goal','preferredLanguage','simulatorScenarioId']);
   const choice=scenarios.find(s=>s.id===body.simulatorScenarioId);
   if(!choice||typeof body.goal!=='string'||body.goal.length>300||!body.goal.trim()||!['hi','en'].includes(String(body.preferredLanguage)))throw new PublicFailure(400,'invalid_request');
   if(v.starting||(v.call&&(!v.call.runtime.get(v.call.sessionId??'')?.closed||v.call.runtime.get(v.call.sessionId??'')?.view().simulatorStop!=='confirmed')))throw new PublicFailure(409,'session_active');
   if(activeSlots()>=MAX_CALLS||v.starts>=12)throw new PublicFailure(429,'too_many_sessions');
   limit('call-starts',30);v.starting=true;v.starts++;
   try {
    await retire(v);
    let runtime:CallRuntime;
    const mirror=new Mirror(scale,scripts);
    const sink:AudioSegmentSink={sourceStarted:async(id,n)=>{runtime.get(id)?.sourceStarted(n);},uploadSegment:async(id,meta,wav)=>{const s=runtime.get(id);if(s&&!s.closed)s.submitAudioSegment({...meta,audioSha256:computeSha256(wav)},wav);}};
    const engine=new SimulatorEngine({sink:mirror.wrap(sink),fixtures,mode:'offline_mock',holdMs:Math.max(750,4000*scale)});
    runtime=new CallRuntime({simulator:engine,stt:createOfflineMockBinding(fixtures.toMockFixturesMap()),maxActiveSessions:1,maxRetainedClosedSessions:1,session:{maxCallMs,maxSilenceMs:45_000,maxBufferedEvents:256,maxQueuedSegments:2,sttTimeoutMs:5000}});
    const call:Call={runtime,engine,mirror,streams:new Set(),audioReads:new Map(),audioBytes:0};v.call=call;
    const {session,view}=await runtime.create({goal:body.goal,preferredLanguage:body.preferredLanguage as 'hi'|'en',simulatorScenarioId:choice.id});call.sessionId=session.sessionId;
    if(session.closed)throw new PublicFailure(503,'simulator_unavailable');
    call.timer=setTimeout(()=>session.stop(),maxCallMs+1000);call.timer.unref();session.subscribe(e=>{if(e.type==='session.closed'){clearTimeout(call.timer);mirror.close();}});
    return json(res,201,viewForVisitor(view));
   }catch(error){await retire(v).catch(()=>{});throw error;}finally{v.starting=false;}
  }
  const call=v.call;const id=matched?.[1]??audio?.[1];const session=call?.runtime.get(id??'');
  if(!call||!session||call.sessionId!==id)throw new PublicFailure(404,'not_found');
  if(audio&&method==='GET'){
   const key=`${audio[2]}/${audio[3]}`;
   const wait=Number(url.searchParams.get('waitMs')??0);if(!Number.isFinite(wait)||wait<0||wait>5000)throw new PublicFailure(400,'invalid_request');
   const until=Date.now()+Math.min(wait,3000);while(!call.mirror.clips.has(key)&&Date.now()<until&&!call.mirror.closed&&!res.destroyed)await new Promise(r=>setTimeout(r,50));
   const clip=call.mirror.clips.get(key);if(!clip)throw new PublicFailure(404,'not_found');
   if((call.audioReads.get(key)??0)>=4||call.audioBytes+clip.bytes.length>12*1024*1024)throw new PublicFailure(429,'egress_limited');spendBytes(clip.bytes.length);call.audioReads.set(key,(call.audioReads.get(key)??0)+1);call.audioBytes+=clip.bytes.length;
   res.writeHead(200,{'content-type':'audio/wav','content-length':clip.bytes.length,'x-holdbuddy-audio-origin':'public_synthetic','x-holdbuddy-audio-duration-ms':String(clip.durationMs),'x-holdbuddy-audio-paced':'true','x-holdbuddy-audio-final':'true','x-holdbuddy-audio-script':encodeURIComponent(clip.script)});return res.end(clip.bytes);
  }
  if(method==='GET'&&!matched?.[2])return json(res,200,viewForVisitor(session.view()));
  const action=matched?.[2];
  if(method==='GET'&&action==='events'){
   if(call.streams.size>=MAX_STREAMS)throw new PublicFailure(429,'too_many_sessions');
   const after=String(req.headers['last-event-id']??'0');if(!/^\d{1,12}$/.test(after))throw new PublicFailure(400,'invalid_request');
   const history=session.eventsAfter(Number(after));
   res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','x-accel-buffering':'no'});res.flushHeaders();call.streams.add(res);
   let unsub=()=>{};let done=false;let heartbeat:NodeJS.Timeout|undefined;
   const finish=()=>{if(done)return;done=true;clearInterval(heartbeat);unsub();call.streams.delete(res);};res.once('close',finish);
   const write=(data:string)=>{if(done)return false;if(res.write(data))return true;finish();res.destroy();return false;};
   const send=(e:RuntimeEvent)=>write(`id: ${e.seq}\nevent: ${eventForVisitor(e).type}\ndata: ${JSON.stringify(eventForVisitor(e))}\n\n`);
   if(history.firstAvailableSeq>Number(after)+1)write(`event: stream.gap\ndata: ${JSON.stringify({firstAvailableSeq:history.firstAvailableSeq})}\n\n`);
   for(const e of history.events)if(!send(e))return;
   if(session.closed){finish();res.end();return;}
   heartbeat=setInterval(()=>write(': heartbeat\n\n'),10_000);heartbeat.unref();
   unsub=session.subscribe(e=>{if(send(e)&&e.type==='session.closed'){finish();res.end();}});return;
  }
  if(method==='POST'&&(action==='stop'||action==='takeover')){await readJson(req,[]);if(action==='stop')session.stop();else session.takeOver();return json(res,200,viewForVisitor(session.view()));}
  if(method==='POST'&&action==='human-decision'){const b=await readJson(req,['requestId','decision']);if(typeof b.requestId!=='string'||b.requestId.length>128||!['confirmed','rejected'].includes(String(b.decision)))throw new PublicFailure(400,'invalid_request');session.decideHuman(b.requestId,b.decision as 'confirmed'|'rejected');return json(res,200,viewForVisitor(session.view()));}
  if(method==='POST'&&action==='clarification'){const b=await readJson(req,['requestId','text']);if(typeof b.requestId!=='string'||b.requestId.length>128||typeof b.text!=='string'||!b.text.trim()||b.text.length>300)throw new PublicFailure(400,'invalid_request');session.answerClarification(b.requestId,b.text);return json(res,202,{queued:true});}
  throw new PublicFailure(404,'not_found');
 }
 const server=createServer({maxHeaderSize:8192},(req,res)=>{void route(req,res).catch(error=>{if(res.headersSent){res.destroy();return;}const status=error instanceof PublicFailure?error.status:error instanceof NativeAdapterError?error.status:error instanceof TooManySessionsError?429:error instanceof SessionCommandFailure?409:503;const code=error instanceof PublicFailure?error.code:error instanceof NativeAdapterError?error.code:error instanceof SessionCommandFailure?error.code:'unavailable';const message=error instanceof NativeAdapterError?error.message:'The demo request could not be completed. Please check the call and try reconnecting.';if(status===429)res.setHeader('retry-after','60');json(res,status,{error:{code,message}});});});
 server.maxConnections=128;server.headersTimeout=10_000;server.requestTimeout=15_000;server.keepAliveTimeout=5000;
 await new Promise<void>((done,fail)=>{server.once('error',fail);server.listen(options.port??10000,options.host??'0.0.0.0',()=>done());});
 return {server,async close(){closing=true;clearInterval(sweep);await Promise.allSettled([...visitors.values()].map(retire));server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const origin=process.env.PUBLIC_ORIGIN??process.env.RENDER_EXTERNAL_URL;
 if(!origin||(!origin.startsWith('https://')&&!origin.startsWith('http://127.0.0.1')&&!origin.startsWith('http://localhost'))){process.stderr.write('PUBLIC_ORIGIN must be an HTTPS demo origin or http://127.0.0.1 / localhost for local testing.\n');process.exitCode=1;}
 else createApplication({origin,port:Number(process.env.PORT??10000)}).then(app=>{
  process.stdout.write('HoldBuddy public demonstration service ready.\n');
  let closing=false;const stop=()=>{if(closing)return;closing=true;void app.close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),10_000).unref();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 }).catch(()=>{process.stderr.write('Public demonstration startup failed.\n');process.exitCode=1;});
}
