const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
const source=path.resolve(__dirname,'../extension/content.js');
(async()=>{const browser=await chromium.launch({headless:true,...browserOptions});try{
 for(const scenario of ['budget','grouping','control-stop']){
  const p=await browser.newPage();
  const control=i=>`<div class="atsx-form-item"><label for="f${i}">字段${i}</label><input id="f${i}" ${scenario==='control-stop'?'readonly':''}></div>`;
  await p.setContent('<meta charset="utf-8"><section data-resume-section="教育经历"><div data-resume-record>'+Array.from({length:scenario==='control-stop'?4:3},(_,i)=>control(i)).join('')+'</div></section>');
  await p.evaluate(scenario=>{
   document.querySelector('input').required=true;
   window.jobs=[];window.cancelledJobs=[];window.optionCalls=0;
   const now=Date.now;let offset=0;Date.now=()=>now()+offset;
   window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
    if(m.kind==='create-job'){jobs.push(m.payload);if(m.payload.mode==='options')optionCalls++;return {ok:true,data:{job_id:String(jobs.length-1)}};}
    if(m.kind==='poll-job'){
     if(scenario==='budget'){offset=61000;return {ok:true,data:{status:'running',decisions:[]}};}
     const job=jobs[+m.id];return {ok:true,data:{status:'done',result:{decisions:job.fields.map(f=>scenario==='grouping'?{id:f.id,status:'review',issue_kind:'record_identity',reason:'record identity needs confirmation'}:{id:f.id,status:'fill',value:'Fixture'})}}};
    }
    if(m.kind==='cancel-job')cancelledJobs.push(m.id);
    return {ok:true,data:{}};
   }}};
  },scenario);
  await p.addScriptTag({path:source});
  await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false,maxRunSeconds:60}));
  let snapshot=await p.evaluate(()=>window.__resumeAutofill.getSnapshot());
  assert.equal(snapshot.running,false);
  if(scenario==='budget'){
   assert(snapshot.progress.includes('时间预算'),snapshot.progress);
   assert.equal(await p.locator('input').evaluateAll(ns=>ns.some(n=>n.value)),false);
   assert((await p.evaluate(()=>cancelledJobs)).length>0);
   assert(!snapshot.items.some(x=>x.status==='error'));
  }else if(scenario==='grouping'){
   assert.equal(snapshot.handoff.groups.length,1);assert.equal(snapshot.handoff.required_groups,1);
   assert.equal(snapshot.handoff.groups[0].labels.length,3);
   await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false},true));
   snapshot=await p.evaluate(()=>window.__resumeAutofill.getSnapshot());
   assert(snapshot.handoff.recommendation.includes('连续两轮'));
  }else{
   assert.equal(snapshot.items.filter(x=>x.status==='error').length,3);
   assert(snapshot.progress.includes('连续3个控件'),snapshot.progress);
   assert.equal(await p.evaluate(()=>optionCalls),0);
  }
  console.log('PASS: handoff '+scenario);await p.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
