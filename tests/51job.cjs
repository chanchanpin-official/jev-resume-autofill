// Virtual applicant on a local fixture with the DOM contract read from 51job's public bundle.
// All network is intercepted; no real account, applicant data or application is used.
const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
const script=path.resolve(__dirname,'../extension/content.js');
async function fixture(p,scenario='normal') {
  await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh"><head><meta charset="utf-8"></head><body></body></html>'}));
  await p.goto('https://xyz.51job.com/consumer/pc/resume/index');
  await p.evaluate(scenario=>{
    window.scenario=scenario;window.jobs=[];window.events=[];window.danger=0;
    const data=window.data=[
      {title:'基本信息',rows:[{姓名:'Example Applicant'}]},
      {title:'教育经历',multi:true,rows:[{学校名称:'School B',学历:''},{学校名称:'School A',学历:''}]},
      {title:'实习经历',multi:true,rows:[]},
      {title:'个人介绍',rows:[{个人介绍:'','请确认本简历所填写的信息真实有效，无虚假陈述':''}]}
    ];
    if(scenario.startsWith('approved-date'))data[1].rows[1]={'学校名称':'School A','开始时间':'2024-09-01','学历':'本科'};
    if(scenario==='draft'||scenario==='manual-many')data[0].rows[0].姓名='Existing draft';
    if(scenario==='leadership-sequence'||['auto-campus','auto-limit'].includes(scenario))data[2].title='在校职务';
    if(scenario==='auto-interns')data.push({title:'在校职务',multi:true,rows:[]});
    if(scenario==='auto-prefilled')data[2].rows=[{'公司名称':'Company 0','职位名称':'My manual title'}];
    window.openDrafts={};
    const fields=obj=>Object.entries(obj).map(([k,v])=>`<div class="el-form-item"><label class="el-form-item__label">${k}</label><input ${k==='开始时间'?'type="date"':''} data-key="${k}" value="${v}"></div>`).join('');
    const render=()=>{
      document.querySelector('.resume-content')?.remove();
      const container=document.createElement('div');container.className='resume-content';
      container.innerHTML='<div class="resume-module jobs-wrapper"><div class="resume-module-header"><div class="title">应聘岗位</div><div class="custom-button">编辑</div></div></div><div class="resume-module privacy-module"><div class="resume-module-header"><span class="title">隐私声明确认</span><span class="custom-button">编辑</span></div><div>内容缺失，待补充</div></div>'+data.map((mod,mi)=>`<div class="resume-module ${mod.multi?'common':'basic-mod'}" data-module="${mi}"><div class="resume-module-header"><div class="title">${mod.title}</div><div class="custom-button">${mod.multi?'添加':'编辑'}</div></div>${mod.rows.map((obj,ri)=>`<div class="common-item"><div class="field-list-box" data-row="${ri}">${Object.entries(obj).map(([k,v])=>`<div class="field-item"><span class="field-item-label">${k}</span><span>${v}</span></div>`).join('')}${mod.multi?'<div class="buttons-box"><div class="custom-button">编辑</div><div class="custom-button">删除</div></div>':''}</div></div>`).join('')}</div>`).join('')+'<button id="submit" type="submit">提交简历</button><label><input id="consent" type="checkbox">同意声明</label>';
      document.body.prepend(container);
      container.querySelector('.jobs-wrapper .custom-button').onclick=()=>window.danger++;
      container.querySelector('.privacy-module .custom-button').onclick=()=>window.danger++;
      container.querySelector('#submit').onclick=()=>window.danger++;
      container.querySelector('#consent').onchange=()=>window.danger++;
      for(const mod of container.querySelectorAll('[data-module]')){
        const mi=+mod.dataset.module,m=data[mi];
        if(scenario==='auto-limit'&&mi===2&&m.rows.length>=3)mod.querySelector('.resume-module-header .custom-button').classList.add('is-disabled');
        const open=(index)=>{
          window.events.push(['open',m.title,index]);
          if(scenario==='drafts-navigation'&&mi===3){document.querySelector('.resume-content').remove();return;}
          setTimeout(()=>{
            const preview=mod.querySelector(`[data-row="${index}"]`);if(preview)preview.style.display='none';
            const wrap=document.createElement('div');
            if(!preview)wrap.className='common-item';
            const obj=m.rows[index]||(m.title==='在校职务'?{'部门/社团名称':'','职务':'','主要工作内容':''}:{'公司名称':'','职位名称':''});
            wrap.innerHTML=`<form class="el-form basic-wrapper">${fields(obj)}<div class="btn-wrapper"><button type="button" class="btn-cancel">取消</button><button type="button" class="btn-save">保存</button></div></form>`;
            if(preview)preview.after(wrap);else mod.append(wrap);
            const form=wrap.querySelector('form');
            if(scenario==='disabled'&&mi===1)form.querySelector('.btn-save').disabled=true;
            form.querySelector('.btn-cancel').onclick=()=>{window.events.push(['cancel',m.title,index]);wrap.remove();if(preview)preview.style.display='';};
            form.querySelector('.btn-save').onclick=()=>{
              window.events.push(['save',m.title,index]);
              if(scenario==='invalid'&&mi===1||scenario==='auto-save-fail'&&mi===2){form.insertAdjacentHTML('beforeend','<div class="el-form-item__error">请补齐必填资料</div>');return;}
              const value=Object.fromEntries([...form.querySelectorAll('input')].map(el=>[el.dataset.key,el.value]));
              if(scenario!=='auto-save-lost'&&!(scenario==='auto-multi-lost-education'&&mi===1))m.rows[index]=value;
              if(scenario==='auto-reordered'&&mi===2)m.rows.sort((a,b)=>(b['公司名称']||'').localeCompare(a['公司名称']||''));
              if(scenario==='auto-duplicate-identity'&&mi===2)m.rows.push({...value});
              setTimeout(render,100); // Whole resume re-renders after every section save.
            };
          },100);
        };
        window.openDrafts[mi]=open;
        mod.querySelector('.resume-module-header .custom-button').onclick=()=>open(m.multi?m.rows.length:0);
        for(const row of mod.querySelectorAll('.field-list-box')){
          const buttons=row.querySelectorAll('.buttons-box .custom-button');
          if(buttons[0])buttons[0].onclick=()=>open(+row.dataset.row);
          if(scenario==='approved-date-hover'&&buttons[0]){row.querySelector('.buttons-box').style.visibility='hidden';row.onclick=()=>open(+row.dataset.row);}
          if(buttons[1])buttons[1].onclick=()=>window.danger++;
        }
      }
    };
    render();
    window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
      if(m.kind==='form-support')return{ok:true,data:{corrections:scenario.startsWith('approved-date')?[{id:'one',host:'xyz.51job.com',section:'教育经历',identity:'School A',endpoint:'start',from:'2024-09-01',to:'2020-09-01',source:'education[1].start',field:'本科入学日期'}]:[],attachments:[]}};
      if(m.kind==='correction-complete'){window.completedCorrection=m.id;return{ok:true,data:{saved:true}};}
      if(m.kind==='draft-backup'){if(m.action==='read')return{ok:true,data:{backup:window.draftBackup||null}};if(['auto-multi-backup-fail','drafts-backup-fail'].includes(scenario)&&m.action==='write')return{ok:false,error:'fixture backup unavailable'};if(m.action==='clear')window.draftBackup=null;else window.draftBackup=JSON.parse(JSON.stringify(m.backup));return{ok:true,data:{saved:true}};}
      if(m.kind==='create-job'){window.jobs.push(m.payload);return {ok:true,data:{job_id:String(window.jobs.length-1)}};}
      if(m.kind==='poll-job'){
        const j=window.jobs[+m.id];let result;
        if(scenario==='dynamic-draft'&&j.mode==='fields'&&!window.dynamicOpened){window.dynamicOpened=true;window.openDrafts[2](0);await new Promise(r=>setTimeout(r,180));}
        if(j.mode==='editor')result={status:'operate',confidence:1};
        else if(j.mode==='section')result={status:'expand',desired_count:scenario.startsWith('auto-')&&/实习|在校职务/.test(j.control.section)?4:2};
        else result={decisions:j.fields.map(f=>({id:f.id,status:'fill',confidence:1,value:f.label==='学历'?(f.record_hint.includes('School B')?'硕士':'本科'):f.label==='公司名称'?'Company '+f.record_index:f.label==='职位名称'?'Intern '+f.record_index:'A grounded personal introduction'}))};
        if(j.mode==='fields'&&j.fields.some(f=>f.label==='本科入学日期')){
          if(scenario==='approved-date-mid-edit'){window.waited=true;await new Promise(r=>window.releaseDate=r);}
          result={decisions:j.fields.map(f=>({id:f.id,status:'fill',value:'2020-09',date_default_day:1,confidence:1,source:scenario==='approved-date-wrong-source'?'education[0].start':'education[1].start'}))};
        }
        if(j.mode==='editor'){
          if(scenario==='service-error')return{ok:true,data:{status:'error',error:'fixture model unavailable'}};
          const reject=scenario==='drafts-review'&&j.control.kind==='open'&&j.control.section==='个人介绍'||scenario==='auto-multi-restore-fail'&&!window.allowRecovery&&j.control.kind==='open'&&j.control.section==='实习经历'||scenario==='open-review'&&j.control.kind==='open'&&j.control.section==='基本信息'||scenario==='row-review'&&j.control.kind==='open'&&j.control.label==='编辑'&&j.control.section==='教育经历'||scenario==='add-review'&&j.control.label==='添加'&&j.control.section==='实习经历'||scenario==='save-review'&&j.control.kind==='save';
          if(reject)result={status:'review',confidence:.65,reason:'Jev 未确认此栏目操作'};
        }
        if((scenario==='leadership-sequence'||scenario.startsWith('auto-'))&&j.mode==='fields'&&j.fields.some(f=>f.section==='在校职务'))result={decisions:j.fields.map(f=>({id:f.id,status:'fill',value:(f.label==='部门/社团名称'?'Organization ':f.label==='职务'?'Position ':'Responsibilities ')+f.record_index,confidence:1}))};
        if(scenario==='auto-field-review'&&j.mode==='fields')result.decisions=result.decisions.map((d,i)=>j.fields[i].label==='职位名称'?{id:d.id,status:'review',reason:'Missing factual detail'}:d);
        if(['auto-mid-edit','auto-multi-mid-edit'].includes(scenario)&&j.mode==='fields'&&!window.waited){window.waited=true;await new Promise(resolve=>{window.releaseModel=resolve;});}
        return{ok:true,data:{status:'done',result}};
      }
      return{ok:true,data:{}};
    }}};
    if(scenario==='draft')document.querySelector('[data-module="0"] .custom-button').click();
    if(scenario==='manual-many'){window.openDrafts[0](0);window.openDrafts[1](0);window.openDrafts[1](1);window.openDrafts[2](0);}
    if(scenario==='leadership-sequence'||scenario.startsWith('auto-'))window.openDrafts[2](0);
    if(scenario.startsWith('auto-multi')){if(scenario==='auto-multi-same-section')window.openDrafts[2](1);else window.openDrafts[1](0);}
  },scenario);
  if(scenario==='draft')await p.waitForSelector('form.basic-wrapper');
  if(scenario==='manual-many')await p.waitForFunction(()=>document.querySelectorAll('form.basic-wrapper').length===4);
  if(scenario==='leadership-sequence'||scenario.startsWith('auto-'))await p.waitForSelector('form.basic-wrapper');
  if(scenario.startsWith('auto-multi'))await p.waitForFunction(()=>document.querySelectorAll('form.basic-wrapper').length===2);
  await p.addScriptTag({path:script});
}
module.exports={fixture};
if(require.main===module)(async()=>{
 const browser=await chromium.launch({headless:true,...browserOptions});
 try {
  for(const scenario of ['normal','disabled','invalid','draft','open-review','row-review','add-review','save-review','service-error','manual-many','dynamic-draft']){
    const p=await browser.newPage();await fixture(p,scenario);
    if(scenario==='normal')assert.equal((await p.evaluate(()=>window.__resumeAutofill.scan(true))).length,1); // consent only, excluded by editor scope
    await p.evaluate(overwrite=>window.__resumeAutofill.start({expandRecords:true,overwrite,autoSaveOpenDrafts:false}),scenario==='manual-many');
    const out=await p.evaluate(()=>({data:window.data,events:window.events,jobs:window.jobs,danger:window.danger,snapshot:window.__resumeAutofill.getSnapshot(),drafts:document.querySelectorAll('form.basic-wrapper').length,draftValues:[...document.querySelectorAll('form.basic-wrapper input')].map(e=>e.value)}));
    assert.equal(out.danger,0);
    if(!['draft','manual-many'].includes(scenario))assert(out.snapshot.items.some(i=>i.label==='隐私声明确认'&&i.status==='skip'));
    assert(!out.jobs.some(j=>j.control?.section==='隐私声明确认'));
    assert(!out.jobs.some(j=>j.fields?.some(f=>f.label.includes('真实有效'))));
    assert.equal(out.data[3].rows[0]['请确认本简历所填写的信息真实有效，无虚假陈述'],'');
    assert.equal(out.snapshot.items.filter(i=>i.status==='error').length,scenario==='service-error'?1:0,JSON.stringify(out.snapshot));
    if(scenario==='normal'){
      assert.deepEqual(out.data[1].rows,[{学校名称:'School B',学历:'硕士'},{学校名称:'School A',学历:'本科'}]);
      assert.deepEqual(out.data[2].rows,[{公司名称:'Company 0',职位名称:'Intern 0'},{公司名称:'Company 1',职位名称:'Intern 1'}]);
      assert.equal(out.data[3].rows[0].个人介绍,'A grounded personal introduction');
      assert.equal(out.drafts,0);assert(out.snapshot.progress.includes('已保存'));
      assert.equal(out.events.filter(e=>e[0]==='save').length,5);assert(out.events.some(e=>e[0]==='cancel'&&e[1]==='基本信息'));
      const secondIntern=out.jobs.find(j=>j.mode==='fields'&&j.fields.some(f=>f.section==='实习经历'&&f.record_index===1));
      assert(secondIntern.records.some(r=>r.record_index===0&&r.record_hint.includes('Company 0')));
      const actions=out.jobs.filter(j=>j.mode==='editor').map(j=>j.control.label);
      assert.equal(actions.filter(l=>l==='保存').length,5);assert.equal(actions.filter(l=>l==='添加').length,2);
    }else if(['open-review','row-review','add-review'].includes(scenario)){
      assert.equal(out.drafts,0);assert(out.snapshot.progress.includes('已保存'));
      assert.equal(out.data[3].rows[0].个人介绍,'A grounded personal introduction');
      const title=scenario==='open-review'?'基本信息':scenario==='row-review'?'教育经历':'实习经历';
      const rejected=out.snapshot.items.filter(i=>i.status==='review'&&i.section===title);
      assert(rejected.length>0);assert(rejected.every(i=>i.confidence===.65));
      assert(!out.events.some(e=>e[0]==='open'&&e[1]===title));
    }else if(['manual-many','dynamic-draft'].includes(scenario)){
      assert.equal(out.drafts,scenario==='manual-many'?4:2);
      assert(out.snapshot.progress.includes('草稿未保存'));
      assert(!out.events.some(e=>e[0]==='save'));
      assert(out.draftValues.includes('Company 0'));assert(out.draftValues.includes('Intern 0'));
      assert(out.draftValues.includes('硕士'));
      if(scenario==='manual-many'){
        assert(out.draftValues.includes('本科'));assert(out.draftValues.includes('Existing draft'));
        assert(!out.events.some(e=>e[0]==='cancel'));
        assert(!out.jobs.some(j=>j.fields?.some(f=>f.label==='姓名')));
      }
    }else if(scenario==='service-error'){
      assert.equal(out.events.length,0);assert(out.snapshot.progress.includes('故障暂停'));
    }else{
      assert.equal(out.drafts,1);assert(out.snapshot.progress.includes('未保存'));assert.equal(out.data[2].rows.length,0);
      assert(out.draftValues.includes(scenario==='draft'?'Existing draft':'硕士'));
      assert(!out.events.some(e=>e[0]==='cancel'&&e[1]===(scenario==='draft'?'基本信息':'教育经历')));
    }
    console.log('PASS: 51job editor flow '+scenario+'; Jev-gated actions, drafts retained, no submission');await p.close();
  }
  const sequence=await browser.newPage();await fixture(sequence,'leadership-sequence');
  for(let index=0;index<3;index++){
    if(index){await sequence.click('[data-module="2"] .resume-module-header .custom-button');await sequence.waitForSelector('form.basic-wrapper');}
    await sequence.evaluate(()=>window.__resumeAutofill.start({expandRecords:true,autoSaveOpenDrafts:false},true));
    assert.equal(await sequence.inputValue('form input[data-key="职务"]'),'Position '+index);
    assert.equal(await sequence.inputValue('form input[data-key="部门/社团名称"]'),'Organization '+index);
    const last=await sequence.evaluate(()=>window.jobs.filter(j=>j.mode==='fields').at(-1));
    assert.equal(last.fields[0].record_index,index);
    for(let saved=0;saved<index;saved++)assert(last.records.some(r=>r.record_index===saved&&r.record_hint.includes('Organization '+saved)&&r.record_hint.includes('Position '+saved)));
    await sequence.click('form .btn-save');await sequence.waitForFunction(count=>window.data[2].rows.length===count&&!document.querySelector('form.basic-wrapper'),index+1);
  }
  assert.equal(await sequence.evaluate(()=>window.danger),0);await sequence.close();
  console.log('PASS: save first campus position, add and retry second and third with distinct identities');
  for(const scenario of ['auto-campus','auto-interns','auto-prefilled','auto-limit','auto-save-fail','auto-field-review','auto-mid-edit','auto-save-lost']){
    const p=await browser.newPage();await fixture(p,scenario);
    const running=p.evaluate(()=>window.__resumeAutofill.start({expandRecords:true,autoSaveOpenDrafts:true}));
    if(scenario==='auto-mid-edit'){
      await p.waitForFunction(()=>!!window.releaseModel);await p.fill('form input[data-key="职位名称"]','My live edit');await p.evaluate(()=>window.releaseModel());
    }
    await running;
    const out=await p.evaluate(()=>({data:window.data,events:window.events,danger:window.danger,snapshot:window.__resumeAutofill.getSnapshot(),drafts:document.querySelectorAll('form.basic-wrapper').length,draftValues:[...document.querySelectorAll('form.basic-wrapper input')].map(e=>e.value)}));
    assert.equal(out.danger,0);
    if(['auto-campus','auto-interns','auto-prefilled','auto-limit'].includes(scenario)){
      assert.equal(out.data[2].rows.length,scenario==='auto-limit'?3:4,JSON.stringify(out));
      assert.equal(new Set(out.data[2].rows.map(r=>r['公司名称']||r['部门/社团名称'])).size,out.data[2].rows.length);
      assert.equal(out.events.filter(e=>e[0]==='save'&&e[1]===out.data[2].title).length,out.data[2].rows.length);
      if(scenario==='auto-interns')assert.equal(out.data[4].rows.length,4);
      if(scenario==='auto-prefilled')assert.equal(out.data[2].rows[0]['职位名称'],'My manual title');
      if(scenario==='auto-limit')assert(out.snapshot.items.some(r=>r.reason.includes('剩余 1 条未添加')));
      assert.equal(out.drafts,0);
    }else{
      assert.equal(out.data[2].rows.length,0);
      assert.equal(out.events.filter(e=>e[0]==='open'&&e[1]==='实习经历').length,1);
      if(['auto-field-review','auto-mid-edit'].includes(scenario))assert(!out.events.some(e=>e[0]==='save'));
      if(scenario==='auto-mid-edit')assert(out.draftValues.includes('My live edit'));
      assert(out.snapshot.items.some(r=>r.status==='review'));
    }
    console.log('PASS: automatic resume sequence '+scenario+'; no final submission');await p.close();
  }
  for(const scenario of ['auto-multi','auto-multi-same-section','auto-multi-existing-edit','auto-multi-mid-edit','auto-multi-backup-fail','auto-multi-restore-fail','auto-multi-lost-education']){
    const p=await browser.newPage();await fixture(p,scenario);
    if(scenario==='auto-multi-existing-edit')await p.fill('form input[data-key="职位名称"]','My original wording');
    const multiRun=p.evaluate(()=>__resumeAutofill.start({expandRecords:true,autoSaveOpenDrafts:true}));
    if(scenario==='auto-multi-mid-edit'){await p.waitForFunction(()=>!!window.releaseModel);await p.fill('form input[data-key="职位名称"]','My live draft edit');await p.evaluate(()=>window.releaseModel());}
    await multiRun;
    let out=await p.evaluate(()=>({data,events,danger,backup:window.draftBackup,drafts:document.querySelectorAll('form.basic-wrapper').length,snapshot:__resumeAutofill.getSnapshot()}));
    assert.equal(out.danger,0);
    if(['auto-multi','auto-multi-same-section','auto-multi-existing-edit'].includes(scenario)){
      assert.equal(out.drafts,0,JSON.stringify(out.snapshot));assert.equal(out.data[2].rows.length,4,JSON.stringify(out));assert.equal(out.data[1].rows[0].学历,'硕士');assert(!out.backup);if(scenario==='auto-multi-existing-edit')assert.equal(out.data[2].rows[0].职位名称,'My original wording');
    }else if(scenario==='auto-multi-lost-education'){
      assert.equal(out.data[1].rows[0].学历,'');assert.equal(out.data[2].rows.length,0);assert.equal(out.backup.phase,'saving');assert.equal(out.backup.records.length,2);
      await p.evaluate(()=>__resumeAutofill.recoverDrafts());assert.equal(await p.inputValue('form input[data-key="公司名称"]'),'Company 0');assert.equal(await p.evaluate(()=>window.draftBackup.phase),'uncertain');assert.equal(await p.evaluate(()=>window.danger),0);
    }else if(scenario==='auto-multi-mid-edit'){
      assert(!out.events.some(e=>e[0]==='save'));assert.equal(out.drafts,2);assert.equal(await p.inputValue('form input[data-key="职位名称"]'),'My live draft edit');
    }else if(scenario==='auto-multi-backup-fail'){
      assert(!out.events.some(e=>e[0]==='save'));assert.equal(out.drafts,2);assert(!out.snapshot.progress.includes('已在本机备份'));
    }else{
      assert.equal(out.data[1].rows[0].学历,'硕士');assert.equal(out.data[2].rows.length,0);assert(out.backup?.records.some(r=>r.section==='实习经历'));
      await p.evaluate(()=>{window.allowRecovery=true;});await p.evaluate(()=>__resumeAutofill.recoverDrafts());
      assert.equal(await p.inputValue('form input[data-key="公司名称"]'),'Company 0');assert.equal(await p.inputValue('form input[data-key="职位名称"]'),'Intern 0');
      assert(!await p.evaluate(()=>window.draftBackup));
      await p.evaluate(()=>__resumeAutofill.start({expandRecords:true,autoSaveOpenDrafts:true}));
      assert.equal(await p.evaluate(()=>data[2].rows.length),4);
    }
    console.log('PASS multi-draft backup and serial save: '+scenario);await p.close();
  }
  for(const scenario of ['drafts-only','drafts-review','drafts-backup-fail','drafts-navigation']){
    const p=await browser.newPage();await fixture(p,scenario);
    await p.evaluate(()=>{
      window.openDrafts[2](0);
      document.querySelector('[data-module="3"]').insertAdjacentHTML('beforeend','<p>内容缺失，待补充</p>');
    });
    await p.waitForSelector('form input[data-key="职位名称"]');
    await p.fill('form input[data-key="职位名称"]','Keep my draft title');
    await p.evaluate(()=>__resumeAutofill.start({draftsOnly:true,overwrite:true,autoSaveOpenDrafts:true}));
    const out=await p.evaluate(()=>({events,danger,backup:window.draftBackup,snapshot:__resumeAutofill.getSnapshot()}));
    assert.equal(out.danger,0);assert(!out.events.some(e=>['save','cancel'].includes(e[0])));
    if(scenario==='drafts-navigation'){
      assert.equal(out.backup.phase,'editing');assert.equal(out.backup.records[0].fields.find(f=>f.label==='职位名称').value,'Keep my draft title');assert(out.snapshot.items.some(i=>i.status==='error'));
      console.log('PASS original draft survives navigation in local backup');await p.close();continue;
    }
    assert.equal(await p.inputValue('form input[data-key="职位名称"]'),'Keep my draft title');
    assert.equal(await p.inputValue('form input[data-key="公司名称"]'),'Company 0');
    assert(!out.events.some(e=>e[0]==='open'&&['教育经历','基本信息','隐私声明确认'].includes(e[1])));
    if(scenario==='drafts-only'){
      assert.equal(await p.inputValue('form input[data-key="个人介绍"]'),'A grounded personal introduction');
      assert.equal(await p.inputValue('form input[data-key="请确认本简历所填写的信息真实有效，无虚假陈述"]'),'');
    }else assert(!out.events.some(e=>e[0]==='open'&&e[1]==='个人介绍'));
    console.log('PASS independent incomplete sections without saving: '+scenario);await p.close();
  }
  for(const scenario of ['approved-date','approved-date-wrong-source','approved-date-mid-edit','approved-date-file','approved-date-hover']){
    const p=await browser.newPage();await fixture(p,scenario);
    if(scenario==='approved-date-file'){await p.evaluate(()=>openDrafts[2](0));await p.waitForSelector('[data-module="2"] form');await p.evaluate(()=>document.querySelector('[data-module="2"] form').insertAdjacentHTML('beforeend','<div class="el-form-item"><label>附件简历</label><input type="file"><span>server-upload.pdf</span></div>'));}
    const task=p.evaluate(()=>__resumeAutofill.start({draftsOnly:true}));
    if(scenario==='approved-date-mid-edit'){
      await p.waitForFunction(()=>!!window.releaseDate);await p.fill('form input[data-key="开始时间"]','2021-09-01');await p.evaluate(()=>window.releaseDate());
    }
    await task;
    assert.equal(await p.inputValue('form input[data-key="开始时间"]'),['approved-date','approved-date-file','approved-date-hover'].includes(scenario)?'2020-09-01':scenario==='approved-date-mid-edit'?'2021-09-01':'2024-09-01');
    assert.equal(await p.evaluate(()=>data[1].rows[1]['开始时间']),'2024-09-01'); // draft only, not yet committed
    assert(!await p.evaluate(()=>events.some(e=>e[0]==='save')));
    assert(!await p.evaluate(()=>window.completedCorrection));
    if(scenario==='approved-date-file')assert.equal(await p.locator('input[type=file]').count(),1);
    console.log('PASS scoped authorized correction: '+scenario);await p.close();
  }
  const p=await browser.newPage();await p.setContent('<h1>Resume display</h1>');
  await p.evaluate(()=>{window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(){return{ok:true,data:{}}}}};});
  await p.addScriptTag({path:script});await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
  const zero=await p.evaluate(()=>window.__resumeAutofill.getSnapshot());
  assert.equal(zero.total,0);assert(zero.progress.includes('未完成填写'));assert(zero.items.some(i=>i.label==='页面字段识别'&&i.status==='review'));
  console.log('PASS: zero fields never reports successful completion');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
