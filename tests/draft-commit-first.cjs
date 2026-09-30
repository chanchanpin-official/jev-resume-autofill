const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict');
const {fixture}=require('./51job.cjs');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const mode of ['success','lost-file','two-opaque','budget-during-save']){
  const p=await b.newPage();await fixture(p,'auto-multi');
  await p.evaluate(mode=>{
   const form=document.querySelector('[data-module="2"] form');
   const opaque='<div class="el-form-item"><label class="el-form-item__label">附件简历</label><input type="file" data-key="附件简历"><div class="show-file"><div class="file-data">uploaded.pdf</div></div></div>';
   form.insertAdjacentHTML('beforeend',opaque+'<div class="el-form-item"><label>请确认本简历信息真实有效</label><input data-key="请确认本简历信息真实有效" value="是"></div>');
   if(mode==='two-opaque')document.querySelector('[data-module="1"] form').insertAdjacentHTML('beforeend',opaque);
   const save=form.querySelector('.btn-save'),original=save.onclick;
   save.onclick=()=>{original();data[2].rows[0]['附件简历']=mode==='lost-file'?'':'uploaded.pdf';if(mode==='budget-during-save'){const now=Date.now;Date.now=()=>now()+181000;}};
  },mode);
  await p.evaluate(()=>__resumeAutofill.start({expandRecords:false,autoSaveOpenDrafts:true}));
  const out=await p.evaluate(()=>({data,events,danger,backup:window.draftBackup,report:__resumeAutofill.getReport()}));
  assert.equal(out.danger,0);
  const saves=out.events.filter(e=>e[0]==='save');
  if(mode==='two-opaque'){assert.equal(saves.length,0);assert(out.report.some(r=>r.reason.includes('多个栏目')));}
  else {
   assert.equal(saves[0][1],'实习经历');
   if(mode==='budget-during-save'){
    assert.equal(saves.length,1,'budget must stop the next save, not the in-flight save');
    assert.equal(out.data[2].rows[0]['请确认本简历信息真实有效'],'是');
    assert(out.backup?.records.length,'remaining draft must remain backed up');
    assert.equal(await p.inputValue('[data-module="1"] form input[data-key="学历"]'),'硕士','other draft must be restored before handing off');
    assert(out.report.some(r=>r.reason.includes('时间预算')));
   }else if(mode==='lost-file'){
    assert.equal(saves.length,1);assert.equal(out.backup.phase,'saving');assert(out.report.some(r=>r.reason.includes('未确认附件')));
    await p.evaluate(()=>__resumeAutofill.recoverDrafts());
    assert.equal(await p.inputValue('[data-module="1"] form input[data-key="学历"]'),'硕士');
    assert.equal(await p.evaluate(()=>draftBackup.phase),'uncertain');
   }else {assert(!out.backup);assert.equal(out.data[1].rows[0]['学历'],'硕士');assert.equal(out.data[2].rows[0]['请确认本简历信息真实有效'],'是');}
  }
  console.log('PASS non-replayable draft saved first: '+mode);await p.close();
 }
 for(const date of ['2020-09-01','2021-09-01']){
  const p=await b.newPage();await fixture(p,'approved-date');
  await p.evaluate(()=>openDrafts[1](1));await p.waitForSelector('form');await p.fill('input[data-key="开始时间"]',date);
  await p.evaluate(()=>__resumeAutofill.start({draftsOnly:true}));
  const out=await p.evaluate(()=>({events,report:__resumeAutofill.getReport()}));
  assert.equal(await p.inputValue('input[data-key="开始时间"]'),date);assert.equal(out.events.filter(e=>e[0]==='open'&&e[1]==='教育经历').length,1);assert(!out.report.some(r=>r.status==='error'));
  if(date==='2020-09-01'){
   await p.evaluate(()=>__resumeAutofill.start({expandRecords:false,autoSaveOpenDrafts:true}));
   assert.equal(await p.evaluate(()=>data[1].rows[1]['开始时间']),date);assert.equal(await p.evaluate(()=>completedCorrection),'one');
  }
  console.log('PASS existing corrected/manual draft not reopened: '+date);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
