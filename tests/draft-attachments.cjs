const {chromium,browserOptions}=require('./browser-runtime.cjs'),assert=require('node:assert/strict');
const {fixture}=require('./51job.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...browserOptions});
 try{
  for(const mode of ['save-first','legacy-recovery','changed-file']){
   const p=await browser.newPage();await fixture(p,'auto-multi');
   await p.evaluate(mode=>{
    window.downloadCount=0;
    const message=chrome.runtime.sendMessage;
    chrome.runtime.sendMessage=async m=>{
     if(m.kind==='attachment'){window.downloadCount++;throw Error('manual uploads only');}
     return message(m);
    };
    const addFile=()=>{const form=document.querySelector('[data-module="2"] form');if(form&&!form.querySelector('input[type=file]'))form.insertAdjacentHTML('beforeend','<div class="el-form-item"><label>附件简历</label><input type="file" data-key="附件简历"></div>');};
    addFile();new MutationObserver(addFile).observe(document.body,{subtree:true,childList:true});
    if(mode!=='save-first')window.draftBackup={schema:1,url:location.href,phase:'editing',records:[{section:'实习经历',record_index:0,existing:false,fields:[
     {label:'公司名称',type:'text',value:'Company 0'},
     {label:'职位名称',type:'text',value:'Intern 0'},
     {label:'附件简历',type:'file',value:'C:\\fakepath\\fixture.pdf',attachment_id:'latest_cn_pdf',sha256:'old-file-hash'}
    ]}]};
   },mode);
   if(mode==='save-first')await p.setInputFiles('input[type=file]',{name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
   if(mode==='changed-file')await p.setInputFiles('input[type=file]',{name:'manual.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-manual')});
   await p.evaluate(mode=>mode==='save-first'?__resumeAutofill.start({expandRecords:false,autoSaveOpenDrafts:true}):__resumeAutofill.recoverDrafts(),mode);
   const out=await p.evaluate(()=>({data,events,backup:window.draftBackup,downloads:window.downloadCount,report:__resumeAutofill.getReport(),danger}));
   assert.equal(out.danger,0);assert.equal(out.downloads,0);
   if(mode==='save-first'){
    assert.equal(out.events.find(e=>e[0]==='save')[1],'实习经历');
    assert.equal(out.data[2].rows.length,1);assert(!out.backup);
    assert(out.data[2].rows[0]['附件简历'].endsWith('fixture.pdf'));
   }else{
    assert(out.backup);assert(out.backup.partialRecovery);
    assert(out.report.some(x=>x.issue_kind==='manual_attachment'));
    assert.equal(await p.inputValue('[data-module="2"] input[data-key="职位名称"]'),'Intern 0');
    assert.equal(await p.evaluate(()=>document.querySelector('input[type=file]').files[0]?.name||''),mode==='changed-file'?'manual.pdf':'');
   }
   console.log('PASS manual attachments and text recovery: '+mode);await p.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
