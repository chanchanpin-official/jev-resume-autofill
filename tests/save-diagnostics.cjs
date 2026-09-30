const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict'),path=require('path');
(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 const p=await b.newPage();await p.route('**/*',r=>r.fulfill({contentType:r.request().method()==='POST'?'application/json':'text/html',body:r.request().method()==='POST'?JSON.stringify({code:'Q0005',message:'请求保存失败 https://example.test/private 13812345678 test@example.test',privateData:'DO_NOT_CAPTURE'}):'<form class="basic-wrapper"><input value="PRIVATE_VALUE"></form>'}));
 await p.goto('https://xyz.51job.com/consumer/pc/resume/index');
 await p.evaluate(()=>{const form=document.querySelector('form');const date=document.createElement('div');date.className='el-date-editor';form.append(date);const picker={$options:{name:'ElDatePicker'},$el:date};form.__vue__={$options:{name:'EditBasicInfo'},$el:form,handleSave(){},fields:{date:{colName:'date',cname:'入学时间',inputType:4}},formData:{date:'2020-09-01'},$refs:{date:[picker]},data:{resumeSubID:'PRIVATE_ID'},resumeId:'PRIVATE_ID',module:{cname:'教育经历',modId:'PRIVATE_ID'}};});
 const script=path.resolve(__dirname,'../extension/control-metadata.js');await p.addScriptTag({path:script});
 await p.evaluate(async()=>{for(const endpoint of ['/unrelated','/talent-domain/consumer/updateSingleResumeSubInfo'])await new Promise(resolve=>{const x=new XMLHttpRequest();x.open('POST',endpoint+'?secret=NEVER_CAPTURE');x.onload=resolve;x.send('PRIVATE_REQUEST');});});
 await p.addScriptTag({path:script});
 const output=await p.evaluate(()=>JSON.parse(document.querySelector('form').getAttribute('data-resume-save-diagnostics')));
 assert.equal(output.owner.module_label,'教育经历');assert.equal(output.owner.has_sub_id,true);assert.equal(output.owner.fields[0].date_shape,'DDDD-DD-DD');assert(await p.locator('.el-date-editor').evaluate(el=>el.hasAttribute('data-resume-date-needs-commit')));assert.equal(output.saveResponses.length,1);assert.equal(output.saveResponses[0].code,'Q0005');assert.equal(output.saveResponses[0].status,200);assert(output.saveResponses[0].message.includes('[redacted]'));
 const data=JSON.stringify(output);for(const secret of ['PRIVATE_VALUE','DO_NOT_CAPTURE','PRIVATE_REQUEST','PRIVATE_ID','2020-09-01','NEVER_CAPTURE','13812345678','test@example.test'])assert(!data.includes(secret));
 console.log('PASS save diagnostics observe response code and redact identifiers; no payloads or unrelated requests');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
