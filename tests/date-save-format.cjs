const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict');
const {mount}=require('./51job-widgets.cjs');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const inactive of [false,true])for(const initial of [null,'2024-09-01 00:00:00','2023-06-30']){
  const p=await b.newPage();await mount(p,'date');
  await p.evaluate(initial=>{
   const queue=[fixture],all=[];while(queue.length){const c=queue.shift();all.push(c);queue.push(...c.$children);}const picker=all.find(c=>c.$options.name==='ElDatePicker');window.changed=0;fixture.value=initial;
   picker.$on('change',value=>{window.changed++;fixture.value=value?value+' 00:00:00':'';});
   if(initial==='2023-06-30')picker.$el.setAttribute('data-resume-date-needs-commit','');
  },initial);
  if(inactive)await p.evaluate(()=>{
   // An extension popup owns browser focus. HTMLElement.focus can leave the
   // input active without delivering the widget's native focus event.
   document.hasFocus=()=>false;
   document.querySelector('.el-date-editor input').focus=()=>{};
  });
  await p.evaluate(()=>__resumeAutofill.start({expandRecords:false,overwrite:true}));
  const out=await p.evaluate(()=>({value:fixture.value,changed,report:__resumeAutofill.getReport()}));
  assert.equal(out.value,'2023-06-30 00:00:00',JSON.stringify(out));assert.equal(out.changed,initial==='2023-06-30'?2:1);assert(out.report.every(r=>r.filled));
  console.log('PASS site datetime serializer via widget, inactive='+inactive+', initial='+initial);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
