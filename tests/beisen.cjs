// Captured CXMT hierarchy: one ux-standard-form per record, several form-parts.
const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
const field=(n,c)=>`<div class="fields-col"><div class="form-item form-item--phoenix"><div class="form-item__title">${n}</div><div class="form-item__control">${c}</div></div></div>`;
const input=v=>`<input class="phoenix-input__input" value="${v}">`;
const select=v=>`<div class="phoenix-select"><input class="phoenix-select__input">${v?`<span class="phoenix-select__tipWrapper"><span class="phoenix-select__tipEle">${v}</span></span>`:''}</div>`;
const radio=()=>'<div class="phoenix-radio-group">'+['是','否'].map(t=>`<div class="phoenix-radio"><span class="phoenix-radio__radio-text">${t}</span></div>`).join('')+'</div>';
const record=(...parts)=>`<div class="sc-khQegj"><div class="sc-hUpaCq"><div class="ux-standard-form"><div class="form">${parts.map(p=>`<div class="form-part"><div class="form-part-body">${p}</div></div>`).join('')}</div></div></div></div>`;
const section=(n,r)=>`<div class="sc-iAKWXU"><div class="sc-efQSVx">${n}</div><div class="sc-cTAqQK">${r}</div></div>`;
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 const p=await b.newPage();await p.setContent('<meta charset="utf-8"><div class="stylest__STFrom-editor__sc-o97u9x-2">'+
 section('个人信息',record(Array.from({length:6},(_,i)=>'<div class="fields-row">'+field(i?'信息'+i:'* 英文名',input('Applicant'))+field('另一字段'+i,input('Value'))+'</div>').join('')))+
 section('教育经历',[0,1].map(i=>record(field('* 学校名称',input('University '+i))+field('* 学历',select(i?'本科':'硕士研究生')),field('* 开始时间',select('2020-09'))+field('* 结束时间',select('2024-06')))).join(''))+
 section('工作经历',record(field('公司名称',input('Company A'))+field('开始时间',select('')),field('工作职责','<textarea>Work description</textarea>')))+
 section('实习经历',record(field('单位名称',input('Company B'))+field('开始时间',select('2025-06')),field('实习内容','<textarea>Intern description</textarea>')))+
 section('求职意向',record(field('是否服从调剂',radio())+field('学习方式',select(''))))+section('公司及应聘者声明',record(field('本人同意声明',radio())))+'</div>');
 await p.evaluate(()=>{
  for(const group of document.querySelectorAll('.phoenix-radio-group'))for(const button of group.querySelectorAll('.phoenix-radio'))button.onclick=()=>{for(const other of group.querySelectorAll('.phoenix-radio'))other.classList.toggle('phoenix-radio--checked',other===button);};
  const mode=[...document.querySelectorAll('.form-item')].find(e=>e.querySelector('.form-item__title').textContent==='学习方式').querySelector('.phoenix-select');
  mode.querySelector('input').onclick=()=>{if(document.querySelector('.common-unmodeled-layer'))return;const portal=document.createElement('div');portal.className='common-unmodeled-layer';portal.innerHTML='<div class="phoenix-selectList"><ul><li class="phoenix-selectList__listItem">全日制</li><li class="phoenix-selectList__listItem">非全日制</li></ul></div>';document.body.append(portal);for(const li of portal.querySelectorAll('li'))li.onclick=()=>{mode.insertAdjacentHTML('beforeend','<span class="phoenix-select__tipEle">'+li.textContent+'</span>');portal.remove();};};
  window.jobs=[];window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
   if(m.kind==='create-job'){window.jobs.push(m.payload);return{ok:true,data:{job_id:String(window.jobs.length-1)}};}
   if(m.kind==='poll-job'){const job=window.jobs[+m.id];return{ok:true,data:{status:'done',result:job.mode==='options'?{status:'select',option_id:'o1'}:{decisions:job.fields.map(f=>({id:f.id,status:'fill',value:f.label==='学习方式'?'非全日制':'否'}))}}};}
   return{ok:true,data:{}};
  }}};
 });
 await p.addScriptTag({path:path.resolve(__dirname,'../extension/content.js')});
 const fields=await p.evaluate(()=>window.__resumeAutofill.scan(true));
 assert(fields.filter(f=>f.section==='个人信息').every(f=>f.record_index===null));assert.equal(fields.find(f=>f.label==='英文名').section,'个人信息');
 for(const heading of ['工作经历','实习经历']){const fs=fields.filter(f=>f.section===heading);assert(fs.every(f=>f.record_index===0));assert(fs.every(f=>f.record_hint.includes(heading==='工作经历'?'Company A':'Company B')));}
 assert.deepEqual(fields.filter(f=>f.label==='学校名称').map(f=>f.record_index),[0,1]);assert(fields.filter(f=>f.label==='开始时间').every(f=>f.type==='custom'));
 assert.equal(fields.filter(f=>f.label==='是否服从调剂').length,1);assert.equal(fields.find(f=>f.label==='是否服从调剂').type,'custom');
 console.log('PASS: Beisen basic/section/record identities and Phoenix radio/select discovery');
 await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));const report=await p.evaluate(()=>window.__resumeAutofill.getReport());
 assert.equal(await p.locator('.phoenix-radio-group').first().locator('.phoenix-radio--checked').textContent(),'否');assert.equal(await p.locator('.phoenix-radio-group').last().locator('.phoenix-radio--checked').count(),0);
 assert.equal(await p.locator('.phoenix-select__input').evaluateAll(nodes=>nodes.every(n=>n.value==='')),true);
 assert.equal(report.find(f=>f.label==='学习方式').status,'filled');
 assert.equal(report.find(f=>f.section==='教育经历'&&f.label==='开始时间').status,'preserved');assert.equal(report.find(f=>f.section==='工作经历'&&f.label==='开始时间').status,'review',JSON.stringify(report));
 console.log('PASS: Jev radio selection; no declaration; select values preserved; Phoenix dropdown selected; date search input untouched');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
