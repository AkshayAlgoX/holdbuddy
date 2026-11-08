import {webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const address=process.env.DEMO_URL;if(!address)throw Error('Set DEMO_URL');
const out=process.env.EVIDENCE_DIR??'verification/webkit';await mkdir(out,{recursive:true});
const local=['localhost','127.0.0.1'].includes(new URL(address).hostname);
const browser=await webkit.launch({headless:true,...(process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
const context=await browser.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:local});
await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(address).origin?route.continue():route.abort());
let id;let result={engine:'WebKit',device:'iPhone 13 emulation',addressClass:local?'local HTTPS container':'deployed HTTPS',errors:[]};
try{
 await context.addInitScript(()=>{window.__media={playing:0,advanced:0,ended:0};const real=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!this.dataset.observed){this.dataset.observed='1';this.addEventListener('playing',()=>window.__media.playing++);this.addEventListener('ended',()=>{if(this.duration>.2)window.__media.ended++;});this.addEventListener('timeupdate',()=>{if(this.currentTime>0.15)window.__media.advanced++;});}return real.call(this);};});
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().endsWith('/api/v1/sessions')&&r.status()===201)id=(await r.json()).sessionId;});
 await page.goto(address);await page.getByRole('link',{name:'Start the demo call',exact:true}).first().click();const start=page.getByRole('button',{name:'Start call: Complain about my broadband bill'});await start.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')?.startsWith('Start call:')&&!b.disabled));await start.click();
 await page.getByText('On hold.',{exact:true}).first().waitFor({timeout:100000});await page.screenshot({path:`${out}/hold.png`,fullPage:true});
 await page.getByRole('heading',{name:'Is it a person?',exact:true}).waitFor({timeout:30000});await page.waitForFunction(()=>window.__media.ended===6,undefined,{timeout:15000});await page.getByRole('button',{name:"It's a person: hand me the call",exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Handed over to you'));
 const closure=await page.evaluate(async sessionId=>{const token=sessionStorage.getItem('holdbuddy_public_capability');for(let n=0;n<30;n++){const v=await(await fetch(`/api/v1/sessions/${sessionId}`,{headers:{Authorization:`Bearer ${token}`}})).json();if(v.closed&&v.simulatorStop==='confirmed')return{closed:v.closed,simulatorStop:v.simulatorStop,outcome:v.closure?.outcome};await new Promise(r=>setTimeout(r,100));}throw Error('Closure unconfirmed');},id);
 result={...result,closure,media:await page.evaluate(()=>window.__media),digits:await page.locator('.hb-key-chip').allTextContents(),horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};assert.deepEqual(result.digits,['5','8','1']);assert.ok(result.media.playing>=6);assert.ok(result.media.advanced>=6);assert.equal(result.media.ended,6);assert.equal(result.horizontalOverflow,false);assert.deepEqual(result.errors,[]);await page.screenshot({path:`${out}/closed.png`,fullPage:true});
 console.log(JSON.stringify(result,null,2));
}finally{await writeFile(`${out}/results.json`,JSON.stringify(result,null,2)+'\n');await context.close();await browser.close();}
