// Synthetic Ant resume layout: no account data, network, or paid model calls.
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const path=require('node:path'),assert=require('node:assert/strict');
const control=(id,value='',extra='')=>`<input id="${id}" placeholder="请输入" value="${value}" ${extra}>`;
const item=inner=>`<div class="ant-form-item"><div class="ant-row ant-form-item-row"><div class="ant-col ant-form-item-control"><div class="ant-form-item-control-input"><div class="ant-form-item-control-input-content">${inner}</div></div></div></div></div>`;
const field=(caption,inner)=>`<div class="ant-col ant-col-12"><div>${caption}</div>${item(inner)}</div>`;
const row=(...items)=>`<div class="ant-row">${items.join('')}</div>`;
const select=(id,value='',search='',readonly=false)=>`<div class="ant-select"><div class="ant-select-selector"><span class="ant-select-selection-search"><input id="${id}" role="combobox" aria-controls="${id}_list" type="search" value="${search}" ${readonly?'readonly':''}></span>${value?`<span class="ant-select-selection-item">${value}</span>`:'<span class="ant-select-selection-placeholder">请选择</span>'}</div></div>`;
const empty=process.argv.includes('--empty')||process.env.ANT_EMPTY==='1';
const date=id=>`<div class="ant-picker"><div class="ant-picker-input"><input id="${id}" ${id==='start1'?'':'readonly'} placeholder="请选择开始日期"><span class="ant-picker-suffix">calendar</span></div></div>`;
const education=i=>`<div class="blockContainer">${row(field('* 学校',select('school'+i,i?'Example College':'Example Graduate School')),field('* 学院名称',control('faculty'+i)))}${row(field('* 学历',select('degree'+i,i?'本科':'硕士','STALE SEARCH',true)),field('* 成绩排名',select('rank'+i,i?'前10%':'其他','',true)))}${row(field('领域方向',control('focus'+i)))}</div>`;
const experience=i=>`<div class="blockContainer">${row(field('* 公司',control('company'+i,i===0?'Example Existing Employer':'')),field('* 职位',control('role'+i)))}${row(field('* 开始日期',date('start'+i)),field('工作职责',`<textarea id="description${i}" placeholder="请输入"></textarea>`))}</div>`;
const moduleBlock=(heading,records,button='')=>`<div class="moduleBlock"><div class="titles">${heading}</div><div class="reSubBlock">${records}</div>${button?`<div class="eduBtns"><button type="button" id="add">${button}</button></div>`:''}</div>`;
const markup=`<style>input,textarea{min-width:100px;min-height:20px}.ant-select{min-height:24px}.ant-select-selector{display:flex}.ant-col-12{display:inline-block}.ant-select-dropdown{position:fixed;top:0;left:0;background:white}</style><div class="editCVContainer"><div class="uploadArea"><input type="file"></div><div class="moduleBlock"><div class="title">基本信息</div></div><form class="ant-form">${row(field('* 姓名',control('name','KEEP NAME')),field('* 证件',`<span class="ant-input-group ant-input-group-compact">${item(select('idType','身份证','',true))}${item(control('idNumber','LOCAL PRIVATE VALUE'))}</span>`))}${moduleBlock('教育背景',education(0)+education(1))}${moduleBlock('实习经历',empty?'':experience(0)+experience(1),'+ 添加实习经历')}${moduleBlock('论文','<div class="blockContainer">'+row(field('* 论文名称',control('paper','Example Paper')))+ '</div>')}${moduleBlock('英语能力',row(field('* 考试类型（最优成绩）',select('language','雅思（IELTS）','',true)),field('* 成绩',select('score','5.5~6.5','',true))))}${moduleBlock('其他信息',row(field('* 所在城市',select('city','','STALE SEARCH',true)),field('同意隐私条款',control('consent','','type="checkbox"'))))}<button type="submit">提交</button></form></div>`;

(async()=>{
 const browser=await chromium.launch({headless:true,...browserOptions});
 try{
  const p=await browser.newPage();await p.setContent(markup);
  await p.evaluate(({experiences})=>{
   window.requests=[];window.jobs={};window.submits=0;window.mousedowns=0;
   document.querySelector('form').onsubmit=e=>{e.preventDefault();submits++;};
   document.querySelector('#add').onclick=()=>{
    const list=document.querySelector('#add').closest('.moduleBlock').querySelector('.reSubBlock');
    list.insertAdjacentHTML('beforeend',experiences[list.children.length]);
   };
   const selector=document.querySelector('#city').closest('.ant-select-selector');
   selector.onmousedown=()=>{
    mousedowns++;
    if(document.querySelector('.ant-select-dropdown'))return;
    const popup=document.createElement('div');popup.className='ant-select-dropdown';
    // rc-select's ARIA owner is an invisible accessibility list. The actual
    // options are visible siblings in the owning dropdown.
    popup.innerHTML='<div id="city_list" role="listbox" style="display:none"></div><div class="ant-select-item-option">上海</div><div class="ant-select-item-option">杭州</div>';
    document.body.append(popup);
    for(const option of popup.querySelectorAll('.ant-select-item-option'))option.onclick=()=>{
     selector.querySelector('.ant-select-selection-placeholder')?.remove();
     const selected=document.createElement('span');selected.className='ant-select-selection-item';selected.textContent=option.textContent;selector.append(selected);
     document.querySelector('#city').value='';popup.remove();
    };
   };
   document.addEventListener('click',e=>{
    const input=e.target.closest('.ant-picker')?.querySelector('input');if(!input)return;
    if(document.querySelector('.ant-picker-dropdown'))return;
    const popup=document.createElement('div');popup.className='ant-picker-dropdown';
    popup.innerHTML='<div class="ant-picker-date-panel"><table><tbody><tr><td title="2025-11-01"><div class="ant-picker-cell-inner">1</div></td><td class="ant-picker-cell-disabled" title="2025-11-02"><div class="ant-picker-cell-inner">2</div></td></tr></tbody></table></div>';
    document.body.append(popup);popup.querySelector('td').onclick=()=>{input.value='2025-11-01';popup.remove();};
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.dataset.committed=input.value;popup.remove();}else if(e.key==='Escape')popup.remove();};
    input.onblur=()=>{if(!input.readOnly)input.value=input.dataset.committed||'';};
   });
   window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(msg){
    requests.push(msg);
    if(msg.kind==='create-job'){
     const payload=msg.payload,id='j'+requests.length;let result;
     if(payload.mode==='section')result={status:'expand',desired_count:3};
     else if(payload.mode==='options'){
      const option=payload.options.find(o=>o.text===payload.target);
      result=option?{status:'select',option_id:option.id,confidence:1}:{status:'review',reason:'Unknown synthetic option'};
     }else result={decisions:payload.fields.map(f=>{
      const value=f.label==='公司'?'Example New Employer '+f.record_index:f.label==='职位'?'Example Role '+f.record_index:f.label==='开始日期'?'2025-11-01':f.label==='所在城市'?'上海':f.label==='学院名称'?'Example Faculty '+f.record_index:f.label==='工作职责'?'Example Duties '+f.record_index:'Example Focus '+f.record_index;
      return {id:f.id,status:'fill',value,confidence:1};
     })};
     jobs[id]={status:'done',result};return{ok:true,data:{job_id:id}};
    }
    if(msg.kind==='poll-job')return{ok:true,data:jobs[msg.id]};
    return{ok:true,data:{}};
   }}};
  },{experiences:[0,1,2].map(i=>experience(i).replace('value="Example Existing Employer"','value=""'))});
  await p.addScriptTag({path:path.join(__dirname,'../extension/content.js')});
  const fields=await p.evaluate(()=>__resumeAutofill.scan(true));
  assert.equal(fields.find(f=>f.label==='姓名').record_index,null);
  assert.equal(fields.find(f=>f.label==='姓名').section,'基本信息');
  assert(fields.some(f=>f.label==='证件类型'));
  assert(fields.some(f=>f.label==='证件号码'));
  assert(fields.every(f=>f.label!=='请输入'&&!/^rc_select_|^basicInfo_/.test(f.label)));
  const schools=fields.filter(f=>f.label==='学校');
  assert.deepEqual(schools.map(f=>[f.section,f.record_index]),[['教育背景',0],['教育背景',1]]);
  assert(schools[0].record_hint.includes('Example Graduate School'));
  assert(fields.find(f=>f.label==='论文名称').record_hint.includes('Example Paper'));
  assert(!JSON.stringify(fields).includes('LOCAL PRIVATE VALUE'));
  assert.deepEqual(fields.filter(f=>f.section==='教育背景'&&f.record_index===1).map(f=>f.label),['学校','学院名称','学历','成绩排名','领域方向']);
  assert(fields.filter(f=>f.label==='学历').every(f=>f.required===true));
  assert(fields.filter(f=>f.label==='领域方向').every(f=>f.required===false));
  await p.evaluate(()=>__resumeAutofill.start({expandRecords:true,overwrite:false}));
  const state=await p.evaluate(()=>({report:__resumeAutofill.getReport(),requests,submits,mousedowns,
   values:Object.fromEntries([...document.querySelectorAll('input[id],textarea[id]')].map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])),city:document.querySelector('#city').closest('.ant-select').textContent}));
  assert.equal(state.submits,0);assert.equal(state.values.consent,false);
  assert.equal(state.values.name,'KEEP NAME');assert.equal(state.values.idNumber,'LOCAL PRIVATE VALUE');
  assert.equal(state.values.company0,empty?'Example New Employer 0':'Example Existing Employer');
  assert.equal(state.values.company1,'Example New Employer 1');assert.equal(state.values.company2,'Example New Employer 2');
  assert.equal(state.values.role0,'Example Role 0');assert.equal(state.values.role1,'Example Role 1');
  assert.equal(state.values.faculty0,'Example Faculty 0');assert.equal(state.values.faculty1,'Example Faculty 1');
  assert.equal(state.values.start1,'2025-11-01');assert.equal(await p.locator('#start1').getAttribute('data-committed'),'2025-11-01');assert.equal(state.values.start2,'2025-11-01');
  assert.equal(state.city,'上海');assert.equal(state.mousedowns,1);
  assert(!state.report.some(r=>r.status==='error'),JSON.stringify(state.report));
  assert.equal(state.report.filter(r=>r.status==='preserved'&&['学校','学历','成绩排名','证件类型','考试类型（最优成绩）','成绩'].includes(r.label)).length,9);
  const jobs=state.requests.filter(r=>r.kind==='create-job').map(r=>r.payload);
  const sectionJob=jobs.find(j=>j.mode==='section');assert.equal(sectionJob.control.visible_records,empty?0:2);assert.equal(sectionJob.control.section,'实习经历');
  assert(sectionJob.page.sections.includes('教育背景'));
  assert(!JSON.stringify(jobs).includes('LOCAL PRIVATE VALUE'));assert(!JSON.stringify(jobs).includes('STALE SEARCH'));
  assert(!jobs.some(j=>j.fields?.some(f=>['学历','学校','成绩排名','证件类型','考试类型（最优成绩）','成绩'].includes(f.label))));
  console.log('PASS: external Ant captions, per-record scope, preserved selections, search isolation, mousedown dropdowns, readonly dates, safe expansion and no submit.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
