const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const http=require('http');
const ROOT=path.resolve(__dirname,'..');
const content=fs.readFileSync(path.join(ROOT,'extension/content.js'),'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'fixture.html'));
const out=path.join(ROOT,'test-results');fs.mkdirSync(out,{recursive:true});

(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...browserOptions});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.evaluate(()=>{
      window.testJobs={};window.testRequests=[];window.batchProgress=[];
      const values={'姓名':'Demo Applicant','邮箱':'demo@example.invalid','最高学历':'硕士','出生日期':'2000-12-26','毕业月份':'2027-01','性别':'男','技能多选':'访谈、统计','语言多选':'英语、中文','意向城市（自定义下拉）':'上海','家庭住址（级联）':'中国/上海/闵行区','入学日期（日期控件）':'2024-09','自我介绍':'I conduct user research.','补充描述':'Grounded description.','身份证号':'110101199001010011'};
      window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(msg){
        window.testRequests.push(msg);
        if(msg.kind==='create-job'){
          const p=msg.payload,id='j'+Object.keys(window.testJobs).length;
          if(p.mode==='fields'&&p.fields.every(f=>f.type!=='file'))window.batchProgress.push(document.querySelector('#name').value);
          let result;
          if(p.mode==='section')result={status:'expand',desired_count:2,collection:'education'};
          else if(p.mode==='options'){
            if(p.context?.multiple)result={status:'select',option_ids:p.options.filter(o=>p.target.includes(o.text)).map(o=>o.id)};
            else {const o=p.options.find(o=>o.text===p.target||p.target.includes(o.text));result=o?{status:'select',option_id:o.id,confidence:1}:{status:'review',reason:'无匹配'};}
          } else result={decisions:p.fields.map(f=>f.type==='file'?{id:f.id,status:'file',attachment_id:'latest_cn_pdf'}:{id:f.id,status:'fill',value:f.name==='school'?(f.record_index===0?'Example Graduate School':'Example University'):f.name==='major'?(f.record_index===0?'Design':'Psychology'):values[f.label]||'demo',review:f.label==='自我介绍',confidence:1,source:'fixture',date_default_day:1})};
          window.testJobs[id]={status:'done',result};return {ok:true,data:{job_id:id}};
        }
        if(msg.kind==='poll-job')return {ok:true,data:window.testJobs[msg.id]};
        if(msg.kind==='attachment')return {ok:true,data:{filename:'demo.pdf',mime:'application/pdf',base64:btoa('%PDF-1.4\nfixture')}};
        return {ok:true,data:{ok:true}};
      }}};
    });
    await page.addScriptTag({content});
    await page.evaluate(()=>window.__resumeAutofill.start({high:.85,low:.6,expandRecords:true}));
    const result=await page.evaluate(()=>({
      name:document.querySelector('#name').value,email:document.querySelector('#email').value,degree:document.querySelector('#degree').value,
      existing:document.querySelector('#existing').value,dob:document.querySelector('#dob').value,month:document.querySelector('#month').value,
      male:document.querySelector('[name=gender][value=male]').checked,skills:[...document.querySelectorAll('[name=skills]:checked')].map(e=>e.value),
      languages:[...document.querySelector('#multiple').selectedOptions].map(e=>e.value),city:document.querySelector('#city').value,
      location:document.querySelector('#location').value,calendar:document.querySelector('#calendar').value,
      file:document.querySelector('#file').files[0]?.name,schools:[...document.querySelectorAll('[name=school]')].map(e=>e.value),
      fileRequests:window.testRequests.filter(r=>r.kind==='attachment').length,
      fileJobs:window.testRequests.filter(r=>r.kind==='create-job'&&r.payload.fields?.some(f=>f.type==='file')).length,
      password:document.querySelector('#password').value,code:document.querySelector('#code').value,consent:document.querySelector('#consent').checked,
      submits:window.submits,inputs:window.inputs,report:window.__resumeAutofill.getReport(),
      kinds:window.testRequests.filter(r=>r.kind==='create-job').map(r=>r.payload.mode),
      batchSizes:window.testRequests.filter(r=>r.kind==='create-job'&&r.payload.mode==='fields').map(r=>r.payload.fields.length),
      batchProgress:window.batchProgress,
      privateSent:window.testRequests.filter(r=>r.kind==='create-job').some(r=>JSON.stringify(r).includes('110101199001010011'))
    }));
    fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(result,null,2));
    await page.screenshot({path:path.join(out,'fixture-filled.png'),fullPage:true});
    assert.equal(result.name,'Demo Applicant');assert.equal(result.email,'demo@example.invalid');assert.equal(result.degree,'m');
    assert.equal(result.existing,'already entered');assert.equal(result.dob,'2000-12-26');assert.equal(result.month,'2027-01');
    assert.equal(result.male,true);assert.deepEqual(result.skills,['interview','stats']);assert.deepEqual(result.languages,['en','zh']);
    assert.equal(result.city,'上海');assert.equal(result.location,'中国/上海/闵行区');assert.equal(result.calendar,'2024-09-01');
    assert.equal(result.file,undefined);assert.equal(result.fileRequests,0);assert.equal(result.fileJobs,0);
    assert(result.report.some(r=>r.label==='简历附件'&&r.issue_kind==='manual_attachment'));
    assert.deepEqual(result.schools,['Example Graduate School','Example University']);
    assert.equal(result.password,'');assert.equal(result.code,'');assert.equal(result.consent,false);assert.equal(result.submits,0);
    assert.equal(result.privateSent,false);assert(result.inputs>8);assert(result.kinds.includes('options'));assert.deepEqual(errors,[]);
    assert(result.report.some(r=>r.label==='自我介绍'&&r.status==='review'));
    assert(result.batchSizes.every(n=>n<=120));
    assert(result.batchProgress.length>=1);
    await page.evaluate(()=>window.__resumeAutofill.undo());
    assert.equal(await page.evaluate(()=>document.querySelector('#file').files.length),0);
    assert.equal(await page.inputValue('#name'),'');assert.equal(await page.inputValue('#email'),'');
    assert.equal(await page.isChecked('[name=gender][value=male]'),false);
    // Cancellation must prevent writes even if a pending model request completes.
    await page.reload();
    await page.evaluate(()=>{
      window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(msg){
        if(msg.kind==='create-job'){await new Promise(r=>setTimeout(r,200));return{ok:true,data:{job_id:'slow'}};}
        if(msg.kind==='poll-job')return{ok:true,data:{status:'running'}};
        return{ok:true,data:{}};
      }}};
    });
    await page.addScriptTag({content});
    await page.evaluate(()=>{window.__resumeAutofill.start({expandRecords:false});setTimeout(()=>window.__resumeAutofill.stop(),50);});
    await page.waitForFunction(()=>!window.__resumeAutofill.getRunning());
    assert.equal(await page.inputValue('#name'),'');
    console.log('PASS: Chromium DOM fixture, native fields, custom dropdown, cascader, calendar, multi-select, radio, attachment, repeated records, preserved values, protected fields, review, undo, cancellation.');
  } finally {if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
