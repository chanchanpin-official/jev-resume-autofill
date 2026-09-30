const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const scenario of ['remount','reorder','changed-options','closed-menu','typeahead','service-options','service-fields','field-remount','upgrade']){
 const p=await b.newPage();await p.setContent('<div data-resume-section="Education"><div class="form-item string_info-demo"><label data-label>School</label><div class="sd-Dropdown-container-demo"><label class="sd-Select-container-demo"><span class="sd-Input-display-value-demo"></span><input id="school" placeholder="Enter school"></label></div></div><div class="form-item"><label for="department">Department</label><input id="department"></div></div>');
 await p.evaluate(s=>{
  window.optionCalls=0;window.fieldCalls=0;window.jobs={};window.clicks=[];window.listeners=[];
  const options=()=>{const popup=document.createElement('div');popup.setAttribute('data-resume-popup','');popup.innerHTML=['Example University','Another School'].map(x=>`<div role="option">${x}</div>`).join('');popup.onclick=e=>{if(e.target.getAttribute('role')!=='option')return;window.clicks.push(e.target.textContent);document.querySelector('.sd-Input-display-value-demo').textContent=e.target.textContent;document.querySelector('#school').value='';popup.remove();};return popup;};
  const container=()=>document.querySelector('.sd-Dropdown-container-demo');
  document.querySelector('#school').onclick=()=>{if(s!=='typeahead'&&!document.querySelector('[data-resume-popup]'))container().append(options());};
  document.querySelector('#school').oninput=()=>{if(s==='typeahead')setTimeout(()=>container().append(options()),700);};
  window.chrome={runtime:{onMessage:{addListener(fn){window.listeners.push(fn);}},async sendMessage(msg){
   if(msg.kind==='create-job'){
    const payload=msg.payload,id='j'+Object.keys(window.jobs).length;let result,status='done',error;
    if(payload.mode==='fields'){
     window.fieldCalls++;
     const decisions=payload.fields.map(f=>({id:f.id,status:'fill',value:f.label==='School'?'Example University':'Design',confidence:1}));
     if(s==='field-remount')document.querySelector('#department').replaceWith(document.querySelector('#department').cloneNode());
     result=s==='service-fields'?{decisions:[],paused:true,error:'fixture network outage'}:{decisions};
    }else{
     window.optionCalls++;result={status:'select',option_id:payload.options.find(o=>o.text==='Example University')?.id,confidence:1};
     if(s==='service-options'){status='error';error='fixture model service outage';}
     if(window.optionCalls===1){
      const old=document.querySelector('[data-resume-popup]');
      if(['remount','reorder','changed-options'].includes(s)){
       const fresh=options();if(s==='reorder')fresh.prepend(fresh.lastChild);
       if(s==='changed-options'){const extra=document.createElement('div');extra.setAttribute('role','option');extra.textContent='New School';fresh.append(extra);}
       old.replaceWith(fresh);
      }
      if(s==='closed-menu')old.remove();
     }
    }
    window.jobs[id]={status,result,error};return {ok:true,data:{job_id:id}};
   }
   if(msg.kind==='poll-job')return {ok:true,data:window.jobs[msg.id]};
   return {ok:true,data:{}};
  }}};
  if(s==='upgrade'){window.oldStarts=0;window.__resumeAutofill={getRunning(){return false;}};window.listeners.push(m=>{if(m.kind==='start')window.oldStarts++;});const panel=document.createElement('div');panel.id='resume-autofill-panel';document.body.append(panel);}
 },scenario);
 await p.addScriptTag({path:path.resolve(__dirname,'../extension/content.js')});
 if(scenario==='upgrade'){await p.evaluate(()=>window.listeners.forEach(fn=>fn({kind:'start-0.2.0',settings:{expandRecords:false}})));await p.waitForFunction(()=>!window.__resumeAutofill.getRunning());assert.equal(await p.evaluate(()=>window.oldStarts),0);assert.equal(await p.locator('#resume-autofill-panel').count(),1);}
 else await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
 const r=await p.evaluate(()=>({report:window.__resumeAutofill.getReport(),clicks:window.clicks,optionCalls:window.optionCalls,fieldCalls:window.fieldCalls,department:document.querySelector('#department').value}));
 if(scenario.startsWith('service')){assert.equal(r.report.filter(x=>x.status==='review').length,0);assert.equal(r.report.filter(x=>x.status==='error').length,1);assert.equal(r.fieldCalls,1);assert.equal(r.department,scenario==='service-options'?'Design':'');}
 else {assert.deepEqual(r.clicks,['Example University'],scenario);assert.equal(r.department,'Design',scenario);assert.equal(r.report.filter(x=>x.status==='error'||x.status==='review').length,0,JSON.stringify(r));if(scenario==='changed-options')assert.equal(r.optionCalls,2);if(['remount','reorder'].includes(scenario))assert.equal(r.optionCalls,1);}
 console.log('PASS:',scenario);await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
