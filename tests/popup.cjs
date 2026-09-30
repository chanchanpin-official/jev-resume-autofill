const {chromium,browserOptions}=require('./browser-runtime.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...browserOptions});
 try{
  for(const scenario of ['startup-error','stale-running','storage-error','live-running','draft-mode','reloaded-panel','first-run']){
   const page=await browser.newPage();
   await page.setContent(fs.readFileSync(path.join(root,'extension/status.html'),'utf8').replace('<script src="status.js"></script>',''));
   await page.evaluate(s=>{
    window.calls=[];window.mode=s;
    window.saved={running:s.endsWith('running'),progress:'旧的完成记录',items:[],total:1,completed:1};
    if(['reloaded-panel','first-run'].includes(s))window.saved=null;
    window.chrome={tabs:{async query(){return [{id:42,url:s==='draft-mode'?'https://xyz.51job.com/consumer/pc/resume/index':'https://fixture.invalid/apply'}];}},storage:{session:{async get(){if(window.mode==='storage-error')throw Error('fixture storage unavailable');return {'report-42':window.saved};}}},runtime:{async sendMessage(m){
     window.calls.push(m);
     if(m.kind==='page-state')return {ok:true,data:{connected:window.mode==='live-running',running:window.mode==='live-running'}};
     if(m.kind==='stop-active'){window.saved.running=false;window.saved.progress='fixture stopped';return {ok:true,data:{ok:true}};}
     if(m.kind==='start-active'){
      if(window.mode==='startup-error')return {ok:false,error:'fixture bridge unavailable'};
      window.saved={running:false,progress:'fixture retry completed',items:[],total:1,completed:1};
      return {ok:true,data:{started:true}};
     }
     return {ok:true,data:{}};
    }}};
    window.chrome.scripting={async executeScript(){return [{result:s==='reloaded-panel'}];}};
   },scenario);
   await page.addScriptTag({path:path.join(root,'extension/status.js')});
   if(scenario==='reloaded-panel'){
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('上轮填写页面'));
    assert(!await page.evaluate(()=>window.calls.some(m=>m.kind==='start-active')));
    await page.locator('#diagnose').click();
    assert.equal(await page.evaluate(()=>window.calls.at(-1).kind),'diagnose-active');
   }else if(scenario==='first-run'){
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('准备就绪'));
    await page.waitForTimeout(1000);
    assert(!await page.evaluate(()=>window.calls.some(m=>m.kind==='start-active')));
    await page.locator('#start').click();
    await page.waitForFunction(()=>window.calls.some(m=>m.kind==='start-active'));
   }else if(scenario==='draft-mode'){
    await page.locator('#drafts').click();
    await page.waitForFunction(()=>window.calls.some(m=>m.kind==='start-active'));
    assert.equal(await page.evaluate(()=>window.calls.find(m=>m.kind==='start-active').draftsOnly),true);
   }else if(scenario==='startup-error'){
    await page.getByRole('button',{name:'开始填写',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='fixture bridge unavailable');
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#status').textContent(),'fixture bridge unavailable','Polling must not hide the action error');
    assert.equal(await page.locator('#retry').isDisabled(),false);
    await page.evaluate(()=>window.mode='working');await page.locator('#retry').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='fixture retry completed');
    assert.equal(await page.evaluate(()=>window.calls.at(-1).tabId),42);
   }else if(scenario==='stale-running'){
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('连接已断开'));
    assert.equal(await page.locator('#retry').isDisabled(),false);
    await page.locator('#retry').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='fixture retry completed');
   }else if(scenario==='storage-error'){
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='fixture storage unavailable');
    await page.locator('#settings').click();
    assert.equal(await page.evaluate(()=>window.calls.at(-1).kind),'open-options');
    assert.equal(await page.locator('#retry').isDisabled(),false);
   }else{
    await page.waitForFunction(()=>window.calls.some(m=>m.kind==='page-state'));
    assert.equal(await page.locator('#stop').isDisabled(),false);
    await page.locator('#stop').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='fixture stopped');
    assert.equal(await page.locator('#retry').isDisabled(),false);
   }
   console.log('PASS popup:',scenario);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
