const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict');
const {fixture}=require('./51job.cjs');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const draft of [false,true]){
  const p=await b.newPage();await fixture(p,draft?'draft':'normal');
  await p.evaluate(()=>document.querySelector('[data-module="0"]').classList.add('has-data'));
  if(draft)await p.fill('form input[data-key="姓名"]','My new manual name');
  await p.evaluate(()=>__resumeAutofill.start({expandRecords:true,autoSaveOpenDrafts:true}));
  const out=await p.evaluate(()=>({events,data,danger}));assert.equal(out.danger,0);
  if(draft){assert.equal(out.data[0].rows[0].姓名,'My new manual name');assert(out.events.some(e=>e[0]==='save'&&e[1]==='基本信息'));}
  else assert(!out.events.some(e=>e[0]==='open'&&e[1]==='基本信息'));
  assert.equal(out.data[2].rows.length,2);assert.equal(out.data[1].rows[0].学历,'硕士');
  console.log('PASS complete basic card skips optional blanks but explicit draft still processes: '+draft);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
