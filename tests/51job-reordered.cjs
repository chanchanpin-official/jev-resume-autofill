const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict');
const {fixture}=require('./51job.cjs');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const scenario of ['auto-reordered','auto-duplicate-identity']){
  const p=await b.newPage();await fixture(p,scenario);
  await p.evaluate(()=>__resumeAutofill.start({expandRecords:true,autoSaveOpenDrafts:true}));
  const out=await p.evaluate(()=>({data,events,danger,report:__resumeAutofill.getReport()}));assert.equal(out.danger,0);
  if(scenario==='auto-reordered'){
   assert.deepEqual(out.data[2].rows.map(r=>r['公司名称']),['Company 3','Company 2','Company 1','Company 0']);
   assert.equal(out.events.filter(e=>e[0]==='save'&&e[1]==='实习经历').length,4);
   assert(!out.report.some(r=>r.reason.includes('未能确认对应记录保存')));
  }else{
   assert.equal(out.events.filter(e=>e[0]==='save'&&e[1]==='实习经历').length,1);
   assert(out.report.some(r=>r.reason.includes('未能确认对应记录保存')));
  }
  console.log('PASS saved identity verification: '+scenario);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
