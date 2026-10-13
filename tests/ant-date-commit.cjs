// Reproduce a typed Ant date draft that is rejected on blur, plus an ongoing end.
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...browserOptions});
 try {
  for(const present of [false,true]){
   const p=await browser.newPage();
   await p.setContent('<form><div class="editCVContainer"><div class="moduleBlock"><div class="titles">项目经验</div><div class="ant-col"><div>* 结束时间</div><div class="ant-form-item"><div class="ant-picker"><input placeholder="请选择结束日期"></div></div></div></div></div><button type="submit">提交</button></form>');
   await p.evaluate(present=>{
    window.jobs={};window.requests=[];window.submits=0;
    document.querySelector('form').onsubmit=e=>{e.preventDefault();submits++;};
    const input=document.querySelector('input');
    input.onclick=()=>{if(document.querySelector('.ant-picker-dropdown'))return;const panel=document.createElement('div');panel.className='ant-picker-dropdown';panel.innerHTML='<div class="ant-picker-date-panel"><table><tbody><tr><td title="2026-10-08">8</td></tr></tbody></table></div>';document.body.append(panel);};
    // The date is rejected by a field constraint; Enter must NOT be treated as success.
    input.onkeydown=e=>{if(e.key==='Enter')e.preventDefault();if(e.key==='Escape')document.querySelector('.ant-picker-dropdown')?.remove();};
    input.onblur=()=>{input.value='';};
    window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
     requests.push(m);if(m.kind==='create-job'){const id='j'+requests.length;const result=m.payload.mode==='fields'?{decisions:m.payload.fields.map(f=>({id:f.id,status:'fill',value:present?'Present':'2025-05-13'}))}:{status:'review',reason:'No matching enabled date'};jobs[id]={status:'done',result};return{ok:true,data:{job_id:id}};}if(m.kind==='poll-job')return{ok:true,data:jobs[m.id]};return{ok:true,data:{}};
    }}};
   },present);
   await p.addScriptTag({path:path.join(__dirname,'../extension/content.js')});
   const fields=await p.evaluate(()=>__resumeAutofill.scan(true));
   assert.equal(fields[0].format,'YYYY-MM-DD');assert.equal(fields[0].date_endpoint,'end');
   await p.evaluate(()=>__resumeAutofill.start({expandRecords:false,overwrite:false}));
   const result=await p.evaluate(()=>({value:document.querySelector('input').value,report:__resumeAutofill.getReport(),submits,requests}));
   assert.equal(result.value,'');assert.equal(result.submits,0);assert(!result.report.some(r=>r.filled||r.status==='filled'));
   if(present){assert(result.report.some(r=>r.issue_kind==='present_date_required'));assert(!result.requests.some(r=>r.payload?.mode==='options'));}
   await p.close();
  }
  console.log('PASS: rejected Ant drafts are not reported filled; ongoing projects never become today; no submit.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
