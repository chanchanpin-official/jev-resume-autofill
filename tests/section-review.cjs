const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict');
const {fixture}=require('./51job.cjs');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 const p=await b.newPage();await fixture(p);await p.evaluate(()=>{
  const original=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>{
   const j=m.kind==='poll-job'?jobs[+m.id]:null;
   if(j?.mode==='section'&&j.control.section==='实习经历')return{ok:true,data:{status:'done',result:{status:'review',confidence:.72,reason:'Uncertain section collection'}}};
   return original(m);
  };
 });
 await p.evaluate(()=>__resumeAutofill.start({expandRecords:true}));
 const out=await p.evaluate(()=>({data,report:__resumeAutofill.getReport(),danger}));
 assert.equal(out.data[2].rows.length,0);assert.equal(out.danger,0);
 assert(out.report.some(i=>i.section==='实习经历'&&i.status==='review'&&i.confidence===.72&&i.reason==='Uncertain section collection'));
 assert.equal(out.data[3].rows[0].个人介绍,'A grounded personal introduction');
 console.log('PASS uncertain collection is visible in report while other sections continue');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
