const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 const p=await b.newPage();
 await p.setContent('<label>年月转日期<input id="native" type="date"></label><label>已有具体日<input id="exact" type="date"></label><label>斜杠日期<input id="slash" data-format="YYYY/MM/DD"></label><label>年月控件<input id="month" type="month"></label><label>只有年<input id="year" type="date"></label>');
 await p.evaluate(()=>{
  const values={'年月转日期':'2024-06','已有具体日':'2024-06-23','斜杠日期':'2024-06','年月控件':'2024-06','只有年':'2024'};const jobs=[];
  window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
   if(m.kind==='create-job'){jobs.push(m.payload);return{ok:true,data:{job_id:String(jobs.length-1)}};}
   if(m.kind==='poll-job')return{ok:true,data:{status:'done',result:{decisions:jobs[+m.id].fields.map(f=>({id:f.id,status:'fill',value:values[f.label],date_default_day:1,confidence:1}))}}};
   return{ok:true,data:{}};
  }}};
 });
 await p.addScriptTag({path:path.resolve(__dirname,'../extension/content.js')});
 await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
 const out=await p.evaluate(()=>({values:Object.fromEntries(['native','exact','slash','month','year'].map(id=>[id,document.getElementById(id).value])),report:window.__resumeAutofill.getReport()}));
 assert.deepEqual(out.values,{native:'2024-06-01',exact:'2024-06-23',slash:'2024/06/01',month:'2024-06',year:''});
 assert.equal(out.report.filter(r=>r.filled).length,4);
 assert(out.report.some(r=>r.label==='只有年'&&r.status==='review'));
 console.log('PASS: authorized day 1 on native/text dates; exact days and month controls preserved; missing months not invented');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
