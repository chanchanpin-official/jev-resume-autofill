/* Model keys stay in the bridge. Temporary form drafts are local-only recovery data. */
try { importScripts('local-config.js'); } catch { /* configure in options */ }
const DEFAULTS = {high: 0.85, low: 0.60, overwrite: false, expandRecords: true, autoSaveOpenDrafts: true, maxRunSeconds:180};
const VERSION = '0.2.0';
function stableJson(value){
  if(Array.isArray(value))return value.map(stableJson);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableJson(value[k])]));
  return value;
}
async function pageMessage(tabId,message,options) {
  let timer;
  try{return await Promise.race([chrome.tabs.sendMessage(tabId,message,options),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('页面脚本未响应，请重试连接')),5000);})]);}
  finally{clearTimeout(timer);}
}
async function actionTab(message,sender) {
  if(!sender.tab&&Number.isInteger(message.tabId))return chrome.tabs.get(message.tabId);
  return (await chrome.tabs.query({active:true,currentWindow:true}))[0];
}
async function settings() {
  const {settings: saved = {}} = await chrome.storage.local.get('settings');
  return {...DEFAULTS, ...(globalThis.LOCAL_CONFIG || {}), ...saved};
}
async function bridge(path, body) {
  const config = await settings();
  if (!config.token) throw new Error('尚未配对本机服务。请先运行 start.command，再刷新插件。');
  // Credentials may only be sent to the local bridge, even if settings are edited.
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.baseUrl)) throw new Error('本机服务地址必须为 http://127.0.0.1:端口');
  const response = await fetch(config.baseUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {'Authorization': 'Bearer ' + config.token, 'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '本机服务 HTTP ' + response.status);
  return data;
}
async function ensurePageContent(tab) {
  let live;
  try{live=await pageMessage(tab.id,{kind:'autofill-ping'},{frameId:0});}catch{}
  if(!live?.ok){
    // Extension reload can leave an old isolated-world object with a dead listener.
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{globalThis.__resumeAutofillReconnect=true;}});
  }
  await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'MAIN',files:['control-metadata.js']}).catch(()=>{});
  try {
    await chrome.scripting.executeScript({target: {tabId: tab.id, allFrames: true}, files: ['content.js']});
  } catch {
    // An inaccessible cross-origin frame must not block the main application form.
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['content.js']});
  }
}
async function startTab(tab,retry=false,draftsOnly=false) {
  if (!tab.id || !/^https?:/.test(tab.url || '')) {
    throw new Error('请先打开申请网页，再点击插件');
  }
  try {
    await bridge('/health');
    const config = await settings();
    await ensurePageContent(tab);
    const ack=await pageMessage(tab.id, {kind: 'start-'+VERSION, retry, settings: {high: config.high, low: config.low, overwrite: config.overwrite, expandRecords: config.expandRecords, autoSaveOpenDrafts:config.autoSaveOpenDrafts,maxRunSeconds:config.maxRunSeconds,draftsOnly}},{frameId:0});
    if(!ack?.ok||ack.version!==VERSION)throw new Error(ack?.error||'页面没有确认启动，请重新加载插件后重试');
    // Start accessible frames only after the main page acknowledges the request.
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>true}).catch(()=>[]);
    await Promise.allSettled(frames.filter(f=>f.frameId!==0).map(f=>pageMessage(tab.id,{kind:'start-'+VERSION,retry,settings:{high:config.high,low:config.low,overwrite:config.overwrite,expandRecords:config.expandRecords,autoSaveOpenDrafts:config.autoSaveOpenDrafts,maxRunSeconds:config.maxRunSeconds,draftsOnly}},{frameId:f.frameId})));
    await chrome.action.setBadgeBackgroundColor({tabId: tab.id, color: '#2c6958'});
    await chrome.action.setBadgeText({tabId: tab.id, text: '…'});
    return {started:true,version:ack.version};
  } catch (error) {
    await chrome.storage.session.set({lastError: error.message});
    await chrome.action.setBadgeText({tabId: tab.id, text: '!'});
    const failure={running:false,version:VERSION,progress:'启动失败：'+error.message,items:[{label:'插件启动',status:'error',reason:error.message}],total:0,completed:0};
    await chrome.storage.session.set({['report-'+tab.id]:failure});
    await bridge('/reports',{tab_id:tab.id,frame_id:0,report:failure}).catch(()=>{});
    throw error;
  }
}
chrome.action.onClicked.addListener(tab=>startTab(tab).catch(()=>{}));
async function diagnoseTab(tab){
  if(!tab?.id||!/^https?:/.test(tab.url||''))throw new Error('请先打开申请网页');
  await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['control-metadata.js']});
  const captures=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['diagnostics.js']});
  return bridge('/diagnostics',captures[0].result);
}
chrome.commands?.onCommand?.addListener(async command=>{
  if(command!=='capture-resume-structure')return;
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  try{await diagnoseTab(tab);await chrome.action.setTitle({tabId:tab.id,title:'页面结构已记录；未启动填写'});}
  catch(error){await chrome.storage.session.set({lastError:error.message});}
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    switch (message.kind) {
      case 'page-state': {
        const tab=await actionTab(message,sender);
        if(!tab?.id)return {connected:false};
        try{const state=await pageMessage(tab.id,{kind:'autofill-ping'},{frameId:0});return {...state,connected:state?.ok===true};}
        catch{return {connected:false};}
      }
      case 'diagnose-active': {
        const tab=await actionTab(message,sender);
        return diagnoseTab(tab);
      }
      case 'start-active': {
        const tab=await actionTab(message,sender);
        if(!tab)throw new Error('没有当前网页');
        return startTab(tab,message.retry===true,message.draftsOnly===true);
      }
      case 'recover-drafts-active': {
        const tab=await actionTab(message,sender);
        if(!tab?.id||!/^https:\/\/xyz\.51job\.com\/consumer\/pc\/resume\/index/.test(tab.url||''))throw new Error('请在51job申请页恢复草稿');
        const live=await pageMessage(tab.id,{kind:'autofill-ping'},{frameId:0}).catch(()=>null);
        if(live?.running)throw new Error('请先停止当前填写，再恢复草稿');
        await ensurePageContent(tab);
        const config=await settings();
        const ack=await pageMessage(tab.id,{kind:'recover-drafts-'+VERSION,settings:{high:config.high,low:config.low}},{frameId:0});
        if(!ack?.ok)throw new Error('页面未确认恢复，请重试');
        return {started:true};
      }
      case 'stop-active': {
        const tab=await actionTab(message,sender);
        if(tab?.id){
          const ack=await pageMessage(tab.id,{kind:'stop-'+VERSION},{frameId:0});
          if(!ack?.ok)throw new Error('页面没有确认停止，请重新加载插件');
          const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>true}).catch(()=>[]);
          await Promise.allSettled(frames.filter(f=>f.frameId!==0).map(f=>pageMessage(tab.id,{kind:'stop-'+VERSION},{frameId:f.frameId})));
        }
        return {ok:true};
      }
      case 'health': return bridge('/health');
      case 'form-support': return bridge('/form-support');
      case 'correction-complete': return bridge('/correction-complete',{id:message.id});
      case 'models': return bridge('/models', {});
      case 'create-job': return bridge('/jobs', message.payload);
      case 'control-metadata': {
        if(!sender.tab?.id)return {};
        await chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[sender.frameId||0]},world:'MAIN',files:['control-metadata.js']});
        return {};
      }
      case 'poll-job': return bridge('/jobs/' + encodeURIComponent(message.id));
      case 'cancel-job': return bridge('/cancel', {job_id: message.id});
      case 'attachment': throw new Error('所有附件由你手动上传；自动上传与重新上传已关闭');
      case 'learn': return bridge('/learn', {job_id:message.id,decision_id:message.decision_id});
      case 'project-backup': {
        if(!sender.tab?.id||sender.frameId||!/^https:\/\/[^/]+\.jobs\.feishu\.cn\/(?:campus|social)\/resume\/\d+\/apply\/?$/.test(sender.url||''))throw new Error('项目备份仅用于飞书申请页');
        const data=message.backup;
        if(!data||data.url!==sender.url||!Array.isArray(data.records)||data.records.length>30||JSON.stringify(data).length>1000000)throw new Error('项目备份格式不正确');
        // Keep every pre-cleanup snapshot; never overwrite a previous backup with fewer rows.
        const key='project-backup-'+sender.tab.id+'-'+Date.now();
        const expected=JSON.parse(JSON.stringify(data));
        await chrome.storage.local.set({[key]:expected});
        const stored=(await chrome.storage.local.get(key))[key];
        if(JSON.stringify(stableJson(stored))!==JSON.stringify(stableJson(expected)))throw new Error('项目备份尚未确认，停止清理');
        return {saved:true,key};
      }
      case 'draft-backup': {
        if(!sender.tab?.id||sender.frameId||!/^https:\/\/xyz\.51job\.com\//.test(sender.url||''))throw new Error('草稿备份仅用于当前已适配的申请页');
        const key='draft-backup-'+sender.tab.id;
        if(message.action==='read'){
          const data=(await chrome.storage.local.get(key))[key];
          return {backup:data?.url===sender.url?data:null};
        }
        if(message.action==='clear'){await chrome.storage.local.remove(key);return {saved:true};}
        const data=message.backup;
        if(!data||data.url!==sender.url||!Array.isArray(data.records)||data.records.length>12||JSON.stringify(data).length>500000)throw new Error('草稿备份格式不正确或内容过大');
        const expected=JSON.parse(JSON.stringify(data));
        await chrome.storage.local.set({[key]:expected});
        const stored=(await chrome.storage.local.get(key))[key];
        if(JSON.stringify(stableJson(stored))!==JSON.stringify(stableJson(expected)))throw new Error('尚未确认草稿已备份，停止保存');
        return {saved:true};
      }
      case 'report': {
        if (!sender.tab) return {};
        const key = 'report-' + sender.tab.id;
        // Reports contain labels and reasons, never actual answers or private values.
        if(!sender.frameId){
          await chrome.storage.session.set({[key]: message.report});
          const pct=message.report.total?Math.floor(100*(message.report.completed||0)/message.report.total):0;
          await chrome.action.setBadgeText({tabId: sender.tab.id, text: message.report.running ? pct+'%' : String(message.report.filled || 0)});
          await chrome.action.setTitle({tabId:sender.tab.id,title:message.report.progress||'查看填写进度'});
        }
        await bridge('/reports', {tab_id: sender.tab.id, frame_id: sender.frameId||0, report:message.report});
        return {ok: true};
      }
      case 'open-options': await chrome.runtime.openOptionsPage(); return {};
      default: throw new Error('未知插件消息');
    }
  })().then(data => respond({ok: true, data}), error => respond({ok: false, error: error.message}));
  return true;
});
