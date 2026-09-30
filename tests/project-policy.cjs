const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
const source=path.resolve(__dirname,'../extension/content.js');
const html='<meta charset="utf-8"><div class="createFormSection-repeatable resumeEditForm-project"><p class="createFormSection-text">项目经历</p><div class="createFormSection-formList">'+Array.from({length:6},(_,i)=>`<div class="resumeEditForm-item resumeEditForm-project"><div class="atsx-form-item"><label>项目名称</label><input value="Project ${i}"></div><div class="atsx-form-item"><label>描述</label><textarea>Description ${i}</textarea></div><span class="formOperate-remove">×</span>${i===5?'<div class="formOperate-addBtn">添加</div>':''}</div>`).join('')+'</div></div><button id="submit">提交</button>';
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const scenario of ['cleanup','backup-failure','edited-during-decision','wrong-jd']){
  const p=await b.newPage();await p.route('https://fixture.jobs.feishu.cn/**',r=>r.fulfill({body:html,contentType:'text/html'}));
  await p.goto('https://fixture.jobs.feishu.cn/campus/resume/123456/apply');
  await p.evaluate(scenario=>{
   window.scenario=scenario;window.jobs=[];window.backups=[];window.deleted=[];window.submitted=false;
   document.querySelector('#submit').onclick=()=>window.submitted=true;
   for(const row of document.querySelectorAll('.resumeEditForm-item'))row.querySelector('.formOperate-remove').onclick=()=>{window.deleted.push(row.querySelector('input').value);row.remove();};
   window.fetch=async (url,options)=>{window.jdRequest={url,options};return{ok:true,json:async()=>({code:0,data:{job_post_detail:{id:scenario==='wrong-jd'?'654321':'123456',title:'Fixture product role',description:'Design camera software and cross-device user experiences.\nConduct substantive user research and evaluate prototypes.',requirement:'Experience designing interactive tools and collaborating with engineers.'}}})};};
   window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
    if(m.kind==='create-job'){
     window.jobs.push(m.payload);
     if(m.payload.mode==='section'&&scenario==='edited-during-decision')document.querySelector('input').value='Manual correction';
     return{ok:true,data:{job_id:String(window.jobs.length-1)}};
    }
    if(m.kind==='poll-job')return{ok:true,data:{status:'done',result:window.jobs[+m.id].mode==='section'?{status:'expand',desired_count:4,cleanup_authorized:true,remove_project_indices:[4,5]}:{decisions:[]}}};
    if(m.kind==='project-backup'){window.backups.push(m.backup);return{ok:true,data:{saved:scenario!=='backup-failure'}};}
    return{ok:true,data:{}};
   }}};
  },scenario);
  await p.addScriptTag({path:source});await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:true}));
  const state=await p.evaluate(()=>({jobs,backups,deleted,submitted,jdRequest,snapshot:window.__resumeAutofill.getSnapshot(),report:window.__resumeAutofill.getReport(),rows:[...document.querySelectorAll('.resumeEditForm-item input')].map(e=>e.value)}));
  assert.equal(state.submitted,false);assert(state.jobs.find(j=>j.mode==='section').control.project_records[4].hint.includes('Description 4'));assert.equal(state.jdRequest.options.credentials,'omit');
  assert.equal(state.jobs.find(j=>j.mode==='section').page.path,'/campus/resume/123456/apply');
  if(scenario==='wrong-jd')assert.equal(state.jobs.find(j=>j.mode==='section').page.job_context,'');
  else assert(state.jobs.find(j=>j.mode==='section').page.job_context.includes('camera software'));
  if(['cleanup','wrong-jd'].includes(scenario)){
   assert.deepEqual(state.deleted,['Project 5','Project 4'],JSON.stringify(state));assert.deepEqual(state.rows,['Project 0','Project 1','Project 2','Project 3']);assert.equal(state.backups[0].records.length,6);assert.equal(state.backups[0].records[4].fields[1].value,'Description 4');
   assert.equal(state.snapshot.total,8,'removed project fields must leave the progress total');
   assert.equal(state.snapshot.completed,8,'removed preserved fields must leave the completed count');
   assert(!state.report.some(r=>r.record_index>=4),'removed project fields must leave the current-page report');
  }else{assert.equal(state.deleted.length,0);assert.equal(state.rows.length,6);}
  console.log('PASS:',scenario);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
