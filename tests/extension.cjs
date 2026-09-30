const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'resume-extension-'));
 const extension=path.join(temp,'extension');fs.cpSync(path.join(ROOT,'extension'),extension,{recursive:true});
 const testManifestPath=path.join(extension,'manifest.json'),testManifest=JSON.parse(fs.readFileSync(testManifestPath));testManifest.host_permissions.push('https://xyz.51job.com/*');fs.writeFileSync(testManifestPath,JSON.stringify(testManifest));
 const jobs={};let serial=0,received=0,failHealth=false;
 const fixture='<!doctype html><meta charset="utf-8"><title>Extension integration fixture</title><form><label for="name">姓名</label><input id="name"><label for="degree">学历</label><select id="degree"><option value="">请选择</option><option value="m">硕士</option><option value="b">本科</option></select><label><input id="consent" type="checkbox">同意隐私政策</label><button type="submit">提交</button></form><script>window.submits=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submits++}</script>';
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);return;}
  if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.end();return;}
  if(req.headers.authorization!=='Bearer test-local-token'){res.statusCode=401;res.end('{}');return;}
  received++;let body='';for await(const chunk of req)body+=chunk;
  assert(!body.includes('LOCAL_DRAFT_SENTINEL'),'Draft backup must not reach the model bridge');
  const data=body?JSON.parse(body):{};let result;
  if(req.url==='/health'){
   if(failHealth){res.statusCode=503;result={error:'fixture bridge offline'};}
   else result={ok:true,profile:true,jev_configured:true,generator_configured:true};
  }
  else if(req.url==='/jobs'){
    const id='j'+serial++;
    const output=data.mode==='options'?{status:'select',option_id:data.options.find(o=>o.text==='硕士').id,confidence:1}:{decisions:data.fields.map(f=>({id:f.id,status:'fill',value:f.label==='姓名'?'Demo Applicant':'硕士',confidence:1}))};
    jobs[id]={status:'done',result:output};result={job_id:id};
  }else if(req.url.startsWith('/jobs/'))result=jobs[req.url.split('/').pop()];
  else result={ok:true};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync(path.join(extension,'local-config.js'),'globalThis.LOCAL_CONFIG='+JSON.stringify({baseUrl:base,token:'test-local-token'})+';');
 let context;
 try{
  context=await chromium.launchPersistentContext(path.join(temp,'profile'),{headless:true,...browserOptions,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:20000});
  const page=await context.newPage();await page.goto(base+'/fixture');
  // Optional permission stands in for the toolbar's activeTab user gesture in this test.
  // Local host is already in host_permissions, so no broad website access is granted.
  await worker.evaluate(async url=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);await startTab(tab);},base+'/fixture');
  await page.waitForFunction(()=>document.querySelector('#name').value==='Demo Applicant',{timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#degree').value==='m',{timeout:15000});
  assert.equal(await page.isChecked('#consent'),false);assert.equal(await page.evaluate(()=>window.submits),0);
  assert(received>=5);
  await worker.evaluate(async url=>{
    const tab=(await chrome.tabs.query({})).find(t=>t.url===url);
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{globalThis.__resumeAutofill.dispose();globalThis.__resumeAutofill.stale=true;}});
    await startTab(tab,true);
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({stale:!!globalThis.__resumeAutofill.stale,panels:document.querySelectorAll('#resume-autofill-panel').length})});
    if(result.stale||result.panels!==1)throw Error('Dead same-version listener was not replaced');
  },base+'/fixture');
  const backupPage=await context.newPage();await backupPage.route('https://xyz.51job.com/**',r=>r.fulfill({contentType:'text/html',body:'<title>Local-only draft backup fixture</title>'}));await backupPage.goto('https://xyz.51job.com/consumer/pc/resume/index?fixture=backup');
  const draftTransfer=async(message)=>{
    for(let attempt=0;attempt<4;attempt++){
      try{return await worker.evaluate(async ({url,message})=>{
        const tab=(await chrome.tabs.query({})).find(t=>t.url===url);
        const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:message=>chrome.runtime.sendMessage(message),args:[message]});return result;
      },{url:backupPage.url(),message});}
      catch(error){
        if(!error.message.includes('No SW')||attempt===3)throw error;
        const prior=worker,url=worker.url();
        worker=context.serviceWorkers().filter(w=>w!==prior&&w.url()===url).at(-1)||await context.waitForEvent('serviceworker',{predicate:w=>w!==prior&&w.url()===url,timeout:10000});
      }
    }
  };
  const localBackup={schema:1,url:backupPage.url(),phase:'ready',records:[{section:'实习经历',record_index:0,fields:[{label:'职位',type:'text',value:'LOCAL_DRAFT_SENTINEL'}]}]};
  const deniedAttachment=await draftTransfer({kind:'attachment',id:'latest_cn_pdf'});
  assert.equal(deniedAttachment.ok,false);assert(deniedAttachment.error.includes('手动上传'));
  assert.equal((await draftTransfer({kind:'draft-backup',action:'write',backup:localBackup})).data.saved,true);
  assert.deepEqual((await draftTransfer({kind:'draft-backup',action:'read'})).data.backup,localBackup);
  assert.equal((await draftTransfer({kind:'draft-backup',action:'write',backup:{...localBackup,url:'https://wrong.invalid/'}})).ok,false);
  const workerUrl=worker.url();
  let reloadError='';
  try{await worker.evaluate(()=>{globalThis.__fixtureBeforeReload=true;chrome.runtime.reload();});}catch(error){reloadError=error.message;}
  // Chromium may reuse its Playwright worker handle and does not always emit a
  // second serviceworker event on reload. Wake the new extension through its
  // actual options page, then verify a fresh execution context and saved data.
  const wakeup=await context.newPage();let workerReady=false,lastReloadError=reloadError;
  for(let attempt=0;attempt<40&&!workerReady;attempt++){
    try{await wakeup.goto(workerUrl.replace(/background\.js$/, 'options.html'),{timeout:3000});}catch(error){lastReloadError=error.message;}
    for(const candidate of context.serviceWorkers().filter(w=>w.url()===workerUrl)){
      try{if(await candidate.evaluate(()=>typeof startTab==='function'&&!globalThis.__fixtureBeforeReload)){worker=candidate;workerReady=true;break;}}catch(error){lastReloadError=error.message;}
    }
    if(!workerReady)await page.waitForTimeout(100);
  }
  if(!workerReady)console.error('Reload diagnostic:',{workers:context.serviceWorkers().map(w=>w.url()),lastReloadError});
  await wakeup.close();assert(workerReady,'Reload must start a fresh service worker execution context');
  assert.deepEqual((await draftTransfer({kind:'draft-backup',action:'read'})).data.backup,localBackup);
  await backupPage.goto('https://xyz.51job.com/consumer/pc/resume/index?fixture=other');assert.equal((await draftTransfer({kind:'draft-backup',action:'read'})).data.backup,null);
  await backupPage.goto(localBackup.url);assert.equal((await draftTransfer({kind:'draft-backup',action:'clear'})).data.saved,true);assert.equal((await draftTransfer({kind:'draft-backup',action:'read'})).data.backup,null);await backupPage.close();
  console.log('PASS: local-only draft backup survives extension reload, is page-scoped, and clears after recovery.');
  await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);const result=await startTab(tab,true);if(!result.started)throw Error('Reloaded worker did not reconnect');},base+'/fixture');
  console.log('PASS: same-version dead listener and actual extension reload recover without refreshing the form.');
  await worker.evaluate(async url=>{
    const tab=(await chrome.tabs.query({})).find(t=>t.url===url);
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>chrome.runtime.onMessage.addListener(m=>{if(m.kind.startsWith('start-'))globalThis.__draftModeSettings=m.settings;})});
    await startTab(tab,true,true);
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.__draftModeSettings});
    if(result.draftsOnly!==true||'token' in result||'baseUrl' in result)throw Error('Draft mode settings must cross the worker/content boundary without bridge credentials');
  },base+'/fixture');
  console.log('PASS: draft-only mode reaches the content script without credentials.');

  failHealth=true;
  const startupError=await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);try{await startTab(tab);return '';}catch(e){return e.message;}},base+'/fixture');
  assert.equal(startupError,'fixture bridge offline');failHealth=false;
  console.log('PASS: start failure is returned, not silently acknowledged.');
  const extensionId=new URL(worker.url()).host;
  const options=await context.newPage();await options.goto('chrome-extension://'+extensionId+'/options.html');
  await options.waitForFunction(()=>document.querySelector('#connection').textContent==='已连接');
  fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true});
  await options.screenshot({path:path.join(ROOT,'test-results/options.png'),fullPage:true});
  const popup=await context.newPage();await popup.goto('chrome-extension://'+extensionId+'/status.html');
  await worker.evaluate(async url=>{
    const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);
    await chrome.storage.session.set({['report-'+tab.id]:{running:false,version:'0.2.0',total:20,completed:8,ready:0,started_at:Date.now()-12000,finished_at:Date.now(),progress:'本轮已停止，可重试待处理',current_field:'',items:[],analysis:{tasks:{}}}});
  },'chrome-extension://'+extensionId+'/status.html');
  await popup.waitForFunction(()=>document.querySelector('#fraction').textContent.includes('8 / 20'));
  assert.equal(await popup.locator('#progress').getAttribute('value'),'8');
  assert.equal(await popup.locator('#stop').isDisabled(),true);
  assert.equal(await popup.locator('#retry').isDisabled(),false);
  await popup.screenshot({path:path.join(ROOT,'test-results/status-popup.png')});
  console.log('PASS: unpacked MV3 extension loads in real Edge; service worker, injection, authenticated HTTP bridge, jobs, dropdown selection, options page, no submit/consent.');
 }finally{if(context)await context.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
