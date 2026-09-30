const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const cancel of [false,true]){
  const p=await b.newPage();await p.setContent('<section data-resume-section="实习经历"><label for="company">公司名称</label><input id="company"></section><section data-resume-section="教育背景"><label for="school">学校名称</label><input id="school"></section>');
  await p.evaluate(cancel=>{
   window.polls=0;window.writtenBeforeDone=false;window.learned=[];window.latest=null;
   window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
    if(m.kind==='create-job'){window.fields=m.payload.fields;return {ok:true,data:{job_id:'stream'}};}
    if(m.kind==='poll-job'){
     window.polls++;
     const decisions=window.fields.map((f,i)=>({id:f.id,status:'fill',value:i?'Example University':'Example Internship',confidence:1,...(!i?{_learning:{text:'fixture'}}:{})}));
     if(window.polls===1){if(cancel)setTimeout(()=>window.__resumeAutofill.stop(),250);return {ok:true,data:{status:'running',decisions:decisions.slice(0,1),field_total:2,field_completed:1,tasks:{a:{state:'analyzing',title:'教育背景',detail:'等待补充'}}}};}
     window.writtenBeforeDone=document.querySelector('#company').value==='Example Internship';
     return {ok:true,data:{status:'done',result:{decisions}}};
    }
    if(m.kind==='learn'){window.learned.push(m.decision_id);return {ok:true,data:{saved:true}};}
    if(m.kind==='report')window.latest=m.report;
    return {ok:true,data:{}};
   }}};
  },cancel);
  await p.addScriptTag({path:path.resolve(__dirname,'../extension/content.js')});await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
  const r=await p.evaluate(()=>({early:window.writtenBeforeDone,company:document.querySelector('#company').value,school:document.querySelector('#school').value,learned:window.learned,snapshot:window.__resumeAutofill.getSnapshot()}));
  assert.equal(r.company,'Example Internship');assert.equal(r.school,cancel?'':'Example University');assert.equal(r.learned.length,1);
  if(!cancel)assert(r.early,'first field must be written while later field still analyzes');
  assert.equal(r.snapshot.total,2);assert.equal(r.snapshot.completed,cancel?1:2);assert.equal(r.snapshot.running,false);assert(r.snapshot.finished_at>=r.snapshot.started_at);
  console.log('PASS: streaming partial fill, saved grounded answer, progress, cancellation='+cancel);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
