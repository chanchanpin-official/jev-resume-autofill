const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict');
const {fixture}=require('./51job.cjs');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const scenario of ['existing','new','draft','manual','tentative']){
  const p=await b.newPage();await fixture(p);
  if(scenario==='draft'){await p.evaluate(()=>openDrafts[1](0));await p.waitForSelector('[data-module="1"] form');}
  await p.evaluate(scenario=>{
   window.testScenario=scenario;const original=chrome.runtime.sendMessage;
   chrome.runtime.sendMessage=async m=>{
    if(m.kind==='poll-job'){
     const j=jobs[+m.id],target=scenario==='new'?'实习经历':'教育经历';
     if(j.mode==='fields'&&j.fields.some(f=>f.section===target)){
      if(['manual','tentative'].includes(scenario)&&!window.testWaiting){window.testWaiting=true;await new Promise(r=>window.releaseTest=r);}
      return{ok:true,data:{status:'done',result:{decisions:j.fields.map(f=>({id:f.id,status:'review',reason:'Optional detail is not in profile'}))}}};
     }
    }
    return original(m);
   };
  },scenario);
  const run=p.evaluate(()=>__resumeAutofill.start({expandRecords:true,autoSaveOpenDrafts:true}));
  if(['manual','tentative'].includes(scenario)){
   await p.waitForFunction(()=>window.testWaiting);
   if(scenario==='manual')await p.fill('[data-module="1"] form input[data-key="学历"]','My manual text');
   else await p.evaluate(()=>document.querySelector('[data-module="1"] form input[data-key="学历"]').value='Uncommitted query');
   await p.evaluate(()=>releaseTest());
  }
  await run;
  const out=await p.evaluate(()=>({events,data,danger,report:__resumeAutofill.getReport(),forms:document.querySelectorAll('form.basic-wrapper').length}));
  assert.equal(out.danger,0);assert(out.report.some(i=>i.status==='review'));
  if(scenario==='existing'){
   assert.equal(out.data[2].rows.length,2);assert.equal(out.forms,0);assert.equal(out.events.filter(e=>e[0]==='cancel'&&e[1]==='教育经历').length,2);
  }else{
   const title=scenario==='new'?'实习经历':'教育经历';
   assert.equal(out.forms,1);assert(!out.events.some(e=>['cancel','save'].includes(e[0])&&e[1]===title));assert.equal(out.data[2].rows.length,0);
   if(['manual','tentative'].includes(scenario))assert.equal(await p.inputValue('[data-module="1"] form input[data-key="学历"]'),scenario==='manual'?'My manual text':'Uncommitted query');
  }
  console.log('PASS optional-review continuation and draft protection: '+scenario);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
