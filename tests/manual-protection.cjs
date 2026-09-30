const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
const script=path.resolve(__dirname,'../extension/content.js');
(async()=>{
 const b=await chromium.launch({headless:true,...browserOptions});
 try{
  for(const scenario of ['text-fields','clear-fields','radio-fields','radio-options','select-options','custom-options','clear-retry']){
   const p=await b.newPage();
   const control=scenario.startsWith('radio')?'<fieldset><legend>关系</legend><label><input type="radio" name="relationship" id="model">选项一</label><label><input type="radio" name="relationship" id="manual">选项二</label></fieldset>':scenario.startsWith('select')?'<label for="field">类型</label><select id="field"><option value="">请选择</option><option value="model">模型值</option><option value="manual">手动值</option></select>':scenario.startsWith('custom')?'<div class="el-form-item"><label>类型</label><div data-resume-control><input id="field" readonly></div></div>':'<label for="field">电话</label><input id="field">';
   await p.setContent(control);
   await p.evaluate(scenario=>{
    window.jobs=[];window.pending=false;window.pausedOnce=false;
    if(scenario==='clear-fields')document.querySelector('#field').value='Old value';
    if(scenario==='custom-options')document.querySelector('#field').onclick=()=>{
      if(document.querySelector('[role=listbox]'))return;
      const panel=document.createElement('div');panel.setAttribute('role','listbox');panel.innerHTML='<div role="option" id="modelOption">模型值</div><div role="option" id="manualOption">手动值</div>';document.body.append(panel);
      panel.onclick=e=>{document.querySelector('#field').value=e.target.textContent;panel.remove();};
    };
    window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
     if(m.kind==='create-job'){window.jobs.push(m.payload);return{ok:true,data:{job_id:String(window.jobs.length-1)}};}
     if(m.kind==='poll-job'){
      const j=window.jobs[+m.id];
      if(scenario!=='clear-retry'&&!window.pausedOnce&&j.mode===(scenario.endsWith('options')?'options':'fields')){
        window.pausedOnce=true;window.pending=true;await new Promise(r=>window.release=r);
      }
      return{ok:true,data:{status:'done',result:j.mode==='options'?{status:'select',option_id:'o0',confidence:1}:{decisions:j.fields.map(f=>({id:f.id,status:'fill',value:'Model value',confidence:1}))}}};
     }
     return{ok:true,data:{}};
    }}};
   },scenario);
   await p.addScriptTag({path:script});
   await p.evaluate(overwrite=>{window.run=window.__resumeAutofill.start({expandRecords:false,overwrite});},scenario==='clear-fields');
   if(scenario==='clear-retry'){
    await p.evaluate(()=>window.run);await p.fill('#field','');
    await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
    await p.evaluate(()=>window.__resumeAutofill.undo());
    assert.equal(await p.inputValue('#field'),'');assert.equal(await p.evaluate(()=>window.jobs.filter(j=>j.mode==='fields').length),1);
    await p.evaluate(()=>window.__resumeAutofillReconnect=true);await p.addScriptTag({path:script});
    await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
    assert.equal(await p.inputValue('#field'),'');assert.equal(await p.evaluate(()=>window.jobs.filter(j=>j.mode==='fields').length),1);
   }else{
    await p.waitForFunction(()=>window.pending);
    if(scenario.startsWith('radio'))await p.check('#manual');
    else if(scenario.startsWith('select'))await p.selectOption('#field','manual');
    else if(scenario.startsWith('custom'))await p.click('#manualOption');
    else await p.fill('#field',scenario==='clear-fields'?'':'Manual value');
    await p.evaluate(()=>window.release());await p.evaluate(()=>window.run);
    if(scenario.startsWith('radio'))assert(await p.isChecked('#manual'));
    else assert.equal(await p.inputValue('#field'),scenario==='select-options'?'manual':scenario==='custom-options'?'手动值':scenario==='clear-fields'?'':'Manual value');
    const report=await p.evaluate(()=>window.__resumeAutofill.getReport());
    assert(report.some(r=>r.status==='preserved'),JSON.stringify(report));assert(!report.some(r=>r.status==='error'||r.filled),JSON.stringify(report));
   }
   console.log('PASS: manual edits/clears beat pending model and retry: '+scenario);await p.close();
  }
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
