import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import scenarios from '../scenarios.json' with { type: 'json' };
import {IvrSession,attestOfflineFixture} from '../packages/ivr-core/src/index.ts';
const current=scenarios;
const rows=(value:any)=>Array.isArray(value)?value:Object.values(value);
const fallback=rows(current).find((s:any)=>s.id==='multilevel-hi-seed-3') as any;
const shared=rows(current).find((s:any)=>s.id==='hi-broadband-shared-objectives') as any;
test('sanitized shared topology changes only the offered payment destination; original complaint fallback is byte-equivalent',()=>{
 assert.equal(createHash('sha256').update(JSON.stringify(fallback)).digest('hex'),'363cd8e680801f66a37690fe63340dd65412a043408ff24141d7456ebe43e24d','preserve the accepted public complaint scenario');
 const before=fallback;
 const expected=structuredClone(before.steps);
 const option=expected.level_2.options.find((o:any)=>o.label==='बिल के भुगतान');
 assert.equal(option.nextStepId,'wrong_route');option.nextStepId='hold';
 assert.deepEqual(shared.steps,expected);assert.equal(shared.initialStepId,before.initialStepId);
});
test('goal reasoning follows permuted digits and reordered offers without any simulator or sequence hint',()=>{
 const text=shared.steps.level_2.prompt.text.replace('कृपया 1 दबाएँ','कृपया 6 दबाएँ').replace('भुगतान के लिए दो दबाएँ','भुगतान के लिए नौ दबाएँ');
 for(const menu of [text,text.split('।').filter(Boolean).reverse().join('।')+'।']){
  for(const [goal,key]of [['मेरे ब्रॉडबैंड बिल की शिकायत','6'],['मेरे ब्रॉडबैंड बिल का भुगतान','9'],['I want to pay my broadband bill','9'],['मेरे ब्रॉडबैंड बिल का रिफंड',undefined]]){
   const s=new IvrSession({sessionId:'isolated-goal',goal:goal!});
   const r=s.dispatch({type:'observation',observation:{sessionId:s.state.sessionId,observationId:1,promptId:'no-scenario-hint',fragmentIndex:0,fragmentKind:'delta',promptComplete:true,observedAtMs:1,transcript:menu,status:'transcribed',attestation:attestOfflineFixture(menu,'transcribed')}});
   assert.equal(r.ok,true);assert.deepEqual(r.actions.flatMap(a=>a.type==='send_dtmf'?[a.digit]:[]),key?[key]:[]);
   if(!key)assert.equal(r.decision?.kind,'abstain');
  }
 }
});
