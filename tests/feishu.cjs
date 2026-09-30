// Synthetic data using the class hierarchy captured read-only from Feishu SaaS.
const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
const script=path.resolve(__dirname,'../extension/content.js');
const field=(label,control)=>`<div class="atsx-col"><div class="atsx-form-item"><div class="atsx-form-item-label"><label>${label}</label></div><div class="atsx-form-item-control">${control}</div></div></div>`;
const section=(name,type,inside,repeat=true)=>`<div class="createFormSection-container"><div class="resumeEditForm-${type} createFormSection__newhash ${repeat?'createFormSection-repeatable':''}"><div class="createFormSection-left"><p class="createFormSection-text">${name}</p></div><div class="createFormSection-right"><div class="createFormSection-formList">${inside}</div></div></div></div>`;
const row=(type,inside)=>`<div class="resumeEditForm-item resumeEditForm-${type}">${inside}</div>`;
const date=`<div class="atsx-date-picker atsx-date-picker-period-month">${[0,1].map(()=>'<div class="atsx-date-picker-period-month-label"><span class="atsx-date-picker-period-month-label-year">YYYY</span>-<span class="atsx-date-picker-period-month-label-month">MM</span></div>').join('')}<input class="atsx-date-picker-period-hidden-input" value="WRONG OLD ASSISTANT VALUE"></div>`;
const select=`<div class="atsx-select"><div role="combobox" class="atsx-select-selection"><span class="atsx-select-selection__placeholder">请选择</span><input class="atsx-select-search__field" style="display:none"></div></div>`;
async function init(p,html){await p.setContent('<meta charset="utf-8"><style>input,textarea,[role=combobox],.atsx-date-picker-period-month-label{min-height:24px;display:block}.atsx-date-picker-period-hidden-input{height:0!important;min-height:0!important}</style>'+html);await p.evaluate(()=>{window.jobs=[];window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){if(m.kind==='create-job'){window.jobs.push(m.payload);return{ok:true,data:{job_id:String(window.jobs.length-1)}};}if(m.kind==='poll-job'){const job=window.jobs[+m.id];return{ok:true,data:{status:'done',result:job.mode==='section'?{status:'expand',desired_count:2}:{decisions:job.fields.map(f=>({id:f.id,status:'review',reason:'fixture has no answer'}))}}};}return{ok:true,data:{}};}}};});await p.addScriptTag({path:script});}
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 const p=await b.newPage();
 await init(p,section('基本信息','basic',field('国籍（地区）',select),false)+section('教育经历','education',row('education',field('学校名称','<input value="Example University">')+field('学历',select)+field('起止时间',date)))+section('实习经历','internship',row('internship',field('公司名称','<input value="Example Labs">')+field('描述','<textarea></textarea>')+field('起止时间',date)))+section('获奖','award',row('award',field('获奖名称','<input value="Award A">')+field('获奖时间','<div class="atsx-date-picker"><input placeholder="YYYY"></div>'))+row('award',field('获奖名称','<input value="Award B">')))+section('自我评价','customFieldModule',row('custom',field('自我评价','<textarea></textarea>')),false));
 const scan=await p.evaluate(()=>window.__resumeAutofill.scan(true));
 assert(scan.every(f=>f.section));assert.equal(scan.filter(f=>f.label==='国籍（地区）').length,1);assert.equal(scan.find(f=>f.label==='国籍（地区）').type,'custom');
 assert.equal(scan.filter(f=>f.date_endpoint).length,4);assert(scan.filter(f=>f.date_endpoint).every(f=>f.type==='custom'&&f.format==='YYYY-MM'&&f.record_index===0));
 assert.equal(scan.find(f=>f.label==='自我评价').record_index,null);
 const awards=scan.filter(f=>f.label==='获奖名称');assert.deepEqual(awards.map(f=>f.record_index),[0,1]);assert(awards[0].record_hint.includes('Award A'));assert(awards[1].record_hint.includes('Award B'));
 assert(scan.filter(f=>f.section==='实习经历').every(f=>f.record_hint.includes('Example Labs')));
 console.log('PASS: Feishu sections, single/multiple record identity, award identity, hidden searches, split dates, standalone self-evaluation');
 await init(p,section('申请信息','apply',field('推荐方式','<div class="atsx-radio-group"><label><input type="radio" name="referral" checked>无</label><label><input type="radio" name="referral">内推</label></div>'),false)+section('附件简历','attachment','<div class="uploadResume"><span><div class="atsx-upload"><input type="file" style="display:none"></div><div class="atsx-upload-list-item-done">demo.pdf 更新 删除</div></span></div>',false));
 const report=await p.evaluate(()=>{window.__resumeAutofill.scan();return window.__resumeAutofill.getReport()});
 assert.equal(report.length,2);assert(report.every(r=>r.status==='preserved'));assert.equal(report[0].label,'推荐方式');
 console.log('PASS: Feishu radio group deduplication and completed upload card prevent duplicate upload');
 const uploadPage=await b.newPage();
 await init(uploadPage,section('附件简历','attachment','<div class="uploadResume"><input type="file"><div class="uploadFile-loadedWrapper"><p class="uploadFile-loadedFilename">demo.pdf</p><div>上次上传: today 更新 删除</div></div><div>将简历内容解析到下方表单？ 解析并覆盖</div></div>',false));
 const loaded=await uploadPage.evaluate(()=>{window.__resumeAutofill.scan();return window.__resumeAutofill.getReport()});
 assert.equal(loaded.length,1);assert.equal(loaded[0].status,'preserved');
 console.log('PASS: custom Feishu loaded filename preserves upload without parsing over manual values');
 await uploadPage.close();
 // Recreated div add button must be re-queried after every new row; no remove or submit actions.
 await init(p,section('实习经历','internship','<div class="createFormSection-addBtn">添加</div>')+'<button type="submit" id="submit">提交简历</button>');
 await p.evaluate(()=>{window.submitted=false;document.querySelector('#submit').onclick=()=>window.submitted=true;const root=document.querySelector('.createFormSection-formList');const bind=()=>{const add=root.querySelector('.createFormSection-addBtn,.formOperate-addBtn');if(add)add.onclick=()=>{add.remove();root.insertAdjacentHTML('beforeend','<div class="resumeEditForm-item resumeEditForm-internship"><div class="atsx-form-item"><label>公司名称</label><input></div><div class="formOperate-addBtn">添加</div></div>');bind();};};bind();});
 await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:true}));
 assert.equal(await p.locator('.resumeEditForm-item').count(),2);assert.equal(await p.evaluate(()=>window.submitted),false);
 console.log('PASS: Feishu empty section expansion through refreshed div add controls without submission');
 // Manual attachment policy leaves all upload types untouched and continues text.
 await init(p,section('附件','attachment',field('附件简历','<input type="file" required>')+field('照片','<input type="file">')+field('作品集','<input type="file">'),false)+section('基本信息','basic',field('姓名','<input id="name">'),false));
 await p.evaluate(()=>{
  window.fileRequests=0;window.fileChanges=0;
  for(const input of document.querySelectorAll('input[type=file]'))input.onchange=()=>window.fileChanges++;
  const original=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>{
   if(m.kind==='attachment'){window.fileRequests++;throw Error('must never download');}
   if(m.kind==='poll-job'){
    const j=window.jobs[+m.id];
    if(j.mode==='fields')return{ok:true,data:{status:'done',result:{decisions:j.fields.map(f=>({id:f.id,status:'fill',value:'Applicant'}))}}};
   }
   return original(m);
  };
 });
 await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
 const manual=await p.evaluate(()=>({files:window.fileRequests,changes:window.fileChanges,jobs:window.jobs,report:window.__resumeAutofill.getReport()}));
 assert.equal(manual.files,0);assert.equal(manual.changes,0);
 assert(!manual.jobs.some(j=>j.fields?.some(f=>f.type==='file')));
 assert.equal(await p.inputValue('#name'),'Applicant');
 assert(manual.report.some(r=>r.label==='附件简历'&&r.status==='review'&&r.issue_kind==='manual_attachment'));
 assert(manual.report.some(r=>r.label==='照片'&&r.status==='skip'));
 assert(manual.report.some(r=>r.label==='作品集'&&r.status==='skip'));
 console.log('PASS: all attachments manual, no model/file requests; required handoff, optional skip, other text continues');
 await p.close();
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
