import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createApplication } from '../dist/server.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const hindi={goal:'मेरे ब्रॉडबैंड बिल की शिकायत',preferredLanguage:'hi',simulatorScenarioId:'multilevel-hi-seed-3'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await sleep(20);}throw Error('Timed out waiting for actual call state');}
async function fixture(options={}){const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;const app=await createApplication({origin,host:'127.0.0.1',port,timingScale:0.002,maxCallMs:12000,...options});const req=async(path,{token,body,method='GET',headers={},...rest}={})=>fetch(origin+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{}),...rest});const visitor=async()=>{const r=await req('/api/bootstrap',{method:'POST',body:{}});assert.equal(r.status,201);return(await r.json()).token;};return{app,req,visitor,origin};}
async function stream(f,token,id,events){const abort=new AbortController();const done=(async()=>{const r=await f.req(`/api/v1/sessions/${id}/events`,{token,signal:abort.signal});assert.equal(r.status,200);const reader=r.body.getReader();let carry='';for(;;){const {done,value}=await reader.read();if(done)return;carry+=new TextDecoder().decode(value);for(;;){const at=carry.indexOf('\n\n');if(at<0)break;const frame=carry.slice(0,at);carry=carry.slice(at+2);const data=frame.split('\n').find(l=>l.startsWith('data: '));if(data)events.push(JSON.parse(data.slice(6)));}}})().catch(e=>{if(e.name!=='AbortError')throw e;});return{abort,done};}
async function closed(f,token,id){return until(async()=>{const v=await(await f.req(`/api/v1/sessions/${id}`,{token})).json();return v.closed&&v.simulatorStop==='confirmed'?v:false;});}

test('actual Hindi engine: 5 → 8 → 1, hold, greeting, human confirmation, confirmed simulator stop',async()=>{
 const f=await fixture();try{const token=await f.visitor();const res=await f.req('/api/v1/sessions',{method:'POST',token,body:hindi});assert.equal(res.status,201);const created=await res.json();const events=[];const s=await stream(f,token,created.sessionId,events);
 const human=await until(()=>events.find(e=>e.type==='handoff.possible_human'));assert.deepEqual(events.filter(e=>e.type==='dtmf.acknowledged').map(e=>e.digit),['5','8','1']);assert.ok(events.some(e=>e.type==='hold.started'));
 assert.ok(events.filter(e=>e.type==='transcript.observed').every(e=>e.dataSource==='MOCK'&&e.provenance==='offline_fixture'));
 const sources=events.filter(e=>e.type==='source.started');assert.equal(sources.length,6);
 const audio=await f.req(`/judge-audio/v1/sessions/${created.sessionId}/prompts/${sources[0].promptId}/fragments/0`,{token});assert.equal(audio.status,200);assert.equal(audio.headers.get('x-holdbuddy-audio-origin'),'public_synthetic');assert.equal(audio.headers.get('x-holdbuddy-audio-sha256'),null);assert.equal(Buffer.from(await audio.arrayBuffer()).subarray(0,4).toString(),'RIFF');
 for(let n=0;n<3;n++){const replay=await f.req(`/judge-audio/v1/sessions/${created.sessionId}/prompts/${sources[0].promptId}/fragments/0`,{token});assert.equal(replay.status,200);await replay.arrayBuffer();}
 assert.equal((await f.req(`/judge-audio/v1/sessions/${created.sessionId}/prompts/${sources[0].promptId}/fragments/0`,{token})).status,429);
 const decision=await f.req(`/api/v1/sessions/${created.sessionId}/human-decision`,{method:'POST',token,body:{requestId:human.requestId,decision:'confirmed'}});assert.equal(decision.status,200);
 const view=await closed(f,token,created.sessionId);assert.equal(view.closure.outcome,'handoff');await s.done;
 const atEnd=events.length;await sleep(100);assert.equal(events.length,atEnd);
 const eventDump=JSON.stringify(events);for(const term of ['sha256','audioPath','sourceToken','instanceId','revision','requestBudget','apiKey','stackTrace'])assert.ok(!eventDump.includes(term),term);
 }finally{await f.app.close();}
});

test('isolation covers reads, controls, event streams, audio and two concurrent visitors',async()=>{
 const f=await fixture();try{const [a,b]=await Promise.all([f.visitor(),f.visitor()]);const results=await Promise.all([a,b].map(token=>f.req('/api/v1/sessions',{method:'POST',token,body:hindi})));assert.deepEqual(results.map(r=>r.status),[201,201]);const [av,bv]=await Promise.all(results.map(r=>r.json()));assert.notEqual(av.sessionId,bv.sessionId);
 for(const path of [`/api/v1/sessions/${av.sessionId}`,`/api/v1/sessions/${av.sessionId}/events`,`/judge-audio/v1/sessions/${av.sessionId}/prompts/arbitrary/fragments/0`])assert.equal((await f.req(path,{token:b})).status,404);
 for(const action of ['stop','takeover','human-decision','clarification'])assert.equal((await f.req(`/api/v1/sessions/${av.sessionId}/${action}`,{method:'POST',token:b,body:{}})).status,404);
 await f.req(`/api/v1/sessions/${av.sessionId}/stop`,{method:'POST',token:a,body:{}});await closed(f,a,av.sessionId);
 const live=await(await f.req(`/api/v1/sessions/${bv.sessionId}`,{token:b})).json();assert.equal(live.closed,false);
 await f.req(`/api/v1/sessions/${bv.sessionId}/takeover`,{method:'POST',token:b,body:{}});assert.equal((await closed(f,b,bv.sessionId)).closure.outcome,'manual_takeover');
 }finally{await f.app.close();}
});

test('private routes, paid input, traversal, hostile origins and oversized bodies are rejected',async()=>{
 const f=await fixture();try{const token=await f.visitor();for(const path of ['/developer','/developer.html','/src/main.tsx','/@vite/client','/@fs/etc/passwd','/.env','/.git/config','/packages/call-runtime/src/server.ts','/docs','/dist/server.mjs','/audio/scripts.json','/api/v1/simulator/reconcile','/v1/health','/debug','/metrics','/api/v1/sessions/x/audio-segments','/api/v1/sessions/x/source-starts','/%2e%2e/.env'])assert.equal((await f.req(path,{token})).status,404,path);
 assert.equal((await f.req('/api/bootstrap',{method:'POST',body:{},headers:{Origin:'https://attacker.example'}})).status,403);
 assert.equal((await f.req('/api/bootstrap',{method:'POST',body:{},headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 const hostStatus=await new Promise((done,fail)=>{const r=httpRequest(f.origin+'/healthz',{headers:{Host:'attacker.example'}},res=>{res.resume();done(res.statusCode);});r.on('error',fail);r.end();});assert.equal(hostStatus,403);
 assert.equal((await f.req('/api/v1/sessions',{method:'POST',token,body:{...hindi,apiKey:'visitor-input',mode:'live_prisma'}})).status,400);
 assert.equal((await f.req('/api/v1/sessions',{method:'POST',token,body:{...hindi,simulatorScenarioId:'private-scenario'}})).status,400);
 assert.equal((await f.req('/api/v1/sessions',{method:'POST',body:hindi})).status,401);
 assert.equal((await f.req('/api/v1/sessions',{method:'POST',token,body:{...hindi,goal:'x'.repeat(5000)}})).status,413);
 const home=await f.req('/');assert.equal(home.headers.get('access-control-allow-origin'),null);assert.ok(home.headers.get('content-security-policy').includes("connect-src 'self'"));
 assert.ok(home.headers.get('content-security-policy').includes("font-src 'self' data:"));
 const headHome=await f.req('/',{method:'HEAD'});assert.equal(headHome.status,200);assert.equal(await headHome.text(),'');
 const headHealth=await f.req('/healthz',{method:'HEAD'});assert.equal(headHealth.status,200);assert.equal(await headHealth.text(),'');
 }finally{await f.app.close();}
});

test('refusal and a failed key recover through explicit stop and a fresh call',async()=>{
 const f=await fixture();try{const token=await f.visitor();for(const scenario of ['multilevel-hi-seed-3-fault-unfamiliar-wording','multilevel-hi-seed-3-fault-dtmf-failure']){
  const response=await f.req('/api/v1/sessions',{method:'POST',token,body:{...hindi,simulatorScenarioId:scenario}});assert.equal(response.status,201);const v=await response.json();const events=[];const s=await stream(f,token,v.sessionId,events);
  if(scenario.includes('unfamiliar'))await until(()=>events.find(e=>e.type==='decision.abstained'||e.type==='decision.made'&&e.decision.kind==='abstain'));
  else await until(()=>events.find(e=>e.type==='dtmf.acknowledged'&&e.outcome==='not_delivered'));
  await f.req(`/api/v1/sessions/${v.sessionId}/stop`,{method:'POST',token,body:{}});await closed(f,token,v.sessionId);await s.done;
 }
 const result=await f.req('/api/v1/sessions',{method:'POST',token,body:hindi});assert.equal(result.status,201);
 }finally{await f.app.close();}
});

test('session reservation, hard capacity, SSE cap, replay, timeout and bootstrap rate limit are bounded',async()=>{
 const f=await fixture({timingScale:1,maxCallMs:1200});try{const tokens=[];for(let n=0;n<9;n++)tokens.push(await f.visitor());
 const responses=await Promise.all(tokens.map(token=>f.req('/api/v1/sessions',{method:'POST',token,body:hindi})));assert.equal(responses.filter(r=>r.status===201).length,8);assert.equal(responses.filter(r=>r.status===429).length,1);
 const v=await responses[0].json();assert.equal((await f.req('/api/v1/sessions',{method:'POST',token:tokens[0],body:hindi})).status,409);
 const events=[],events2=[];const one=await stream(f,tokens[0],v.sessionId,events);const two=await stream(f,tokens[0],v.sessionId,events2);await until(()=>events.length&&events2.length);
 assert.equal((await f.req(`/api/v1/sessions/${v.sessionId}/events`,{token:tokens[0]})).status,429);
 const end=await closed(f,tokens[0],v.sessionId);assert.ok(end.closed);await Promise.all([one.done,two.done]);assert.equal(events.filter(e=>e.type==='dtmf.acknowledged').length,0);
 for(let n=9;n<30;n++)await f.visitor();assert.equal((await f.req('/api/bootstrap',{method:'POST',body:{}})).status,429);
 }finally{await f.app.close();}
});

test('all shipped WAVs independently meet PCM, duration, energy and silence constraints',async()=>{
 const entries=JSON.parse(await readFile(new URL('../dist/audio/scripts.json',import.meta.url),'utf8'));assert.equal(entries.length,14);
 for(const e of entries){const b=await readFile(new URL(`../dist/audio/${e.file}`,import.meta.url));assert.equal(b.subarray(0,4).toString(),'RIFF');assert.equal(b.subarray(8,12).toString(),'WAVE');const data=b.indexOf(Buffer.from('data'));assert.ok(data>0);const pcm=b.subarray(data+8);const tail=pcm.subarray(-12800);assert.ok([...tail].every(x=>x===0));let energy=0,peak=0;for(let i=0;i<pcm.length-12800;i+=2){const v=pcm.readInt16LE(i);energy+=v*v;peak=Math.max(peak,Math.abs(v));}assert.ok(peak>1000);assert.ok(Math.sqrt(energy/(pcm.length/2))>100);}
});
