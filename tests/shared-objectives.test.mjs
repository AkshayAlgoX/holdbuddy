import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../dist/server.mjs';

const line='hi-broadband-shared-objectives';
const cases=[
 {key:'complaint',goal:'मेरे ब्रॉडबैंड बिल की शिकायत',digits:['5','8','1'],clips:['04','05','06','07','02','03'],outcome:'handoff'},
 {key:'payment-help',goal:'मेरे ब्रॉडबैंड बिल का भुगतान',digits:['5','8','2'],clips:['04','05','06','07','02','03'],outcome:'handoff'},
 {key:'refund',goal:'मेरे ब्रॉडबैंड बिल का रिफंड',digits:['5','8'],clips:['04','05','06','07'],outcome:'manual_takeover'},
];
const body=c=>({goal:c.goal,preferredLanguage:'hi',simulatorScenarioId:line});
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await pause(25);}throw Error('Timed out waiting for actual gateway state');}
async function fixture(options={}){
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(done=>probe.close(done));
 const origin=`http://127.0.0.1:${port}`;const app=await createApplication({origin,port,host:'127.0.0.1',timingScale:.002,maxCallMs:12000,...options});
 const req=(path,token,data,extra={})=>fetch(origin+path,{headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(data===undefined?{}:{'content-type':'application/json'}),...(extra.headers??{})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)}),...(extra.signal?{signal:extra.signal}:{})});
 const visitor=async()=>{const r=await req('/api/bootstrap',undefined,{});assert.equal(r.status,201);return(await r.json()).token;};
 const create=async(token,c)=>{const r=await req('/api/v1/sessions',token,body(c));assert.equal(r.status,201);return r.json();};
 const closed=(token,id)=>until(async()=>{const r=await req(`/api/v1/sessions/${id}`,token);assert.equal(r.status,200);const v=await r.json();return v.closed&&v.simulatorStop==='confirmed'?v:false;});
 return{app,req,visitor,create,closed};
}
async function stream(f,token,id,events,after=0){
 const abort=new AbortController();
 const done=(async()=>{const r=await f.req(`/api/v1/sessions/${id}/events`,token,undefined,{signal:abort.signal,headers:{'last-event-id':String(after)}});assert.equal(r.status,200);let pending='';const decoder=new TextDecoder();
  for await(const chunk of r.body){pending+=decoder.decode(chunk,{stream:true});let at;while((at=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,at);pending=pending.slice(at+2);const data=frame.split('\n').find(l=>l.startsWith('data: '));if(data)events.push(JSON.parse(data.slice(6)));}}
 })().catch(e=>{if(e.name!=='AbortError')throw e;});return{abort,done};
}
const requested=events=>events.flatMap(e=>e.type==='dtmf.requested'?[e.digit]:[]);
const delivered=events=>events.flatMap(e=>e.type==='dtmf.acknowledged'&&e.outcome==='delivered'?[e.digit]:[]);
const human=events=>events.find(e=>e.type==='handoff.possible_human');
const refusal=events=>events.find(e=>e.type==='decision.made'&&e.decision.kind==='abstain'&&e.decision.reason==='action_mismatch');
async function finish(f,token,id,events,c){
 const action=c.outcome==='handoff'?'human-decision':'takeover';const data=action==='human-decision'?{requestId:human(events).requestId,decision:'confirmed'}:{};
 const r=await f.req(`/api/v1/sessions/${id}/${action}`,token,data);assert.equal(r.status,200);
 const v=await f.closed(token,id);assert.equal(v.closure.outcome,c.outcome);assert.equal(v.goal,c.goal);return v;
}
for(const c of cases)test(`sanitized shared line: ${c.key} uses its goal, exact Kokoro WAVs and confirmed closure`,async()=>{
 const f=await fixture();try{
  const token=await f.visitor();const view=await f.create(token,c);const events=[];const s=await stream(f,token,view.sessionId,events);
  await until(()=>c.outcome==='handoff'?human(events):refusal(events));
  assert.deepEqual(requested(events),c.digits);assert.deepEqual(delivered(events),c.digits);
  assert.equal(events.some(e=>e.type==='hold.started'),c.outcome==='handoff');assert.equal(Boolean(human(events)),c.outcome==='handoff');
  const sources=events.filter(e=>e.type==='source.started');assert.equal(sources.length,c.clips.length);
  for(const [i,source]of sources.entries()){
   const audio=await f.req(`/judge-audio/v1/sessions/${view.sessionId}/prompts/${source.promptId}/fragments/0`,token);assert.equal(audio.status,200);assert.equal(audio.headers.get('x-holdbuddy-audio-origin'),'public_synthetic');
   assert.equal(audio.headers.get('x-holdbuddy-audio-sha256'),null,'private hash header remains redacted');
   assert.deepEqual(Buffer.from(await audio.arrayBuffer()),await readFile(new URL(`../dist/audio/prompt-${c.clips[i]}.wav`,import.meta.url)));
  }
  assert.ok(events.filter(e=>e.type==='transcript.observed').every(e=>e.dataSource==='MOCK'&&e.provenance==='offline_fixture'));
  assert.ok(events.every(e=>e.dataSource!=='REAL_API'));await finish(f,token,view.sessionId,events,c);await s.done;
  const count=events.length;await pause(100);assert.equal(events.length,count,'no late event after confirmed closure');
 }finally{await f.app.close();}
});

test('a rejected objective change cannot mutate a live call; a new goal owns a fresh session only after closure',async()=>{
 const f=await fixture();try{
  const token=await f.visitor(),first=await f.create(token,cases[1]);const conflict=await f.req('/api/v1/sessions',token,body(cases[2]));assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'session_active');
  assert.equal((await(await f.req(`/api/v1/sessions/${first.sessionId}`,token)).json()).goal,cases[1].goal);
  assert.equal((await f.req(`/api/v1/sessions/${first.sessionId}/stop`,token,{})).status,200);await f.closed(token,first.sessionId);
  const second=await f.create(token,cases[2]);assert.notEqual(second.sessionId,first.sessionId);assert.equal(second.goal,cases[2].goal);assert.equal((await f.req(`/api/v1/sessions/${first.sessionId}`,token)).status,404);
  const events=[],s=await stream(f,token,second.sessionId,events);await until(()=>refusal(events));assert.ok(events.every(e=>e.sessionId===second.sessionId));assert.deepEqual(delivered(events),['5','8']);await finish(f,token,second.sessionId,events,cases[2]);await s.done;
 }finally{await f.app.close();}
});

test('SSE replay resumes an objective without creating another call or duplicating a key',async()=>{
 const f=await fixture();try{
  const token=await f.visitor(),view=await f.create(token,cases[1]);const first=[],s=await stream(f,token,view.sessionId,first);await until(()=>first.length>=2);s.abort.abort();await s.done;
  const last=first.at(-1).seq,rest=[],next=await stream(f,token,view.sessionId,rest,last);await until(()=>human([...first,...rest]));assert.ok(rest.every(e=>e.seq>last));const all=[...first,...rest];assert.equal(new Set(all.map(e=>e.eventId)).size,all.length);assert.deepEqual(requested(all),['5','8','2']);assert.deepEqual(delivered(all),['5','8','2']);
  await finish(f,token,view.sessionId,all,cases[1]);await next.done;
 }finally{await f.app.close();}
});

test('eight real-paced isolated visitors reach complaint/payment help; ninth is bounded and one closure cannot close another', {timeout:125000},async()=>{
 const f=await fixture({timingScale:1,maxCallMs:180000});const started=Date.now();try{
  const tokens=await Promise.all(Array.from({length:9},()=>f.visitor()));const goals=Array.from({length:8},(_,i)=>cases[i%2]);const views=await Promise.all(goals.map((c,i)=>f.create(tokens[i],c)));assert.equal(new Set(views.map(v=>v.sessionId)).size,8);
  const ninth=await f.req('/api/v1/sessions',tokens[8],body(cases[0]));assert.equal(ninth.status,429);assert.equal((await ninth.json()).error.code,'too_many_sessions');
  const records=Array.from({length:8},()=>[]),streams=await Promise.all(views.map((v,i)=>stream(f,tokens[i],v.sessionId,records[i])));
  for(let i=0;i<8;i++)assert.equal((await f.req(`/api/v1/sessions/${views[(i+1)%8].sessionId}`,tokens[i])).status,404);
  await until(()=>records.every(e=>human(e)),110000);assert.ok(Date.now()-started>=50000,'production speaking pace was retained');
  for(let i=0;i<8;i++){
   assert.deepEqual(requested(records[i]),goals[i].digits);assert.deepEqual(delivered(records[i]),goals[i].digits);assert.equal(records[i].filter(e=>e.type==='source.started').length,6);assert.ok(records[i].some(e=>e.type==='hold.started'));assert.ok(records[i].every(e=>e.sessionId===views[i].sessionId&&e.dataSource!=='REAL_API'));
   await finish(f,tokens[i],views[i].sessionId,records[i],goals[i]);await streams[i].done;
   if(i===0)assert.equal((await(await f.req(`/api/v1/sessions/${views[1].sessionId}`,tokens[1])).json()).closed,false);
  }
  console.log(JSON.stringify({check:'eight-concurrent-production-pace',calls:8,complaint:4,paymentHelp:4,closed:8,simulatorStop:'confirmed',seconds:(Date.now()-started)/1000,realApiEvents:0}));
 }finally{await f.app.close();}
});
