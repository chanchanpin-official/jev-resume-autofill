const $=id=>document.getElementById(id);
let tabId=null,current=null,busy=false,stickyError='',disconnected=false,refreshing=false;
async function bounded(promise,ms,label){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'超时，请重试；若仍无响应，请在扩展管理页重新加载插件')),ms);})]);}
 finally{clearTimeout(timer);}
}
async function send(kind,extra={}){
 const r=await bounded(chrome.runtime.sendMessage({kind,tabId,...extra}),35000,'插件响应');
 if(!r?.ok)throw Error(r?.error||'插件连接已断开，请关闭弹窗后重新打开');
 return r.data;
}
function buttons(){
 const running=!!current?.running&&!disconnected;
 $('start').disabled=busy||running;$('retry').disabled=busy||running;$('stop').disabled=busy||!running;$('recover').disabled=busy||running;$('drafts').disabled=busy||running;
}
function showError(error){stickyError=error?.message||String(error);$('status').textContent=stickyError;buttons();}
async function target(){
 if(tabId!==null)return;
 const [tab]=await bounded(chrome.tabs.query({active:true,currentWindow:true}),6000,'读取当前网页');
 if(!tab?.id)throw Error('未找到当前网页，请回到申请页面重新打开插件');
 tabId=tab.id;$('recover').hidden=!/^https:\/\/xyz\.51job\.com\/consumer\/pc\/resume\/index/.test(tab.url||'');$('drafts').hidden=$('recover').hidden;return tab;
}
async function refresh(){
 if(tabId===null||refreshing)return;
 refreshing=true;
 try{
  const stored=await bounded(chrome.storage.session.get('report-'+tabId),6000,'读取填写记录');
  current=stored['report-'+tabId]||null;
  if(!current){buttons();return;}
  if(!busy)$('status').textContent=stickyError||(disconnected?'上轮页面连接已断开，点击“重试待处理”重新连接。':current.progress||'等待填写');
  const total=current.total||0,done=current.completed||0;
  $('fraction').textContent=`${done} / ${total} 项已处理`;$('progress').max=Math.max(total,1);$('progress').value=done;
  const seconds=current.started_at?Math.max(0,Math.floor(((current.running&&!disconnected?Date.now():current.finished_at||Date.now())-current.started_at)/1000)):0;
  $('elapsed').textContent=`${Math.floor(seconds/60)}分${seconds%60}秒`;
  const count=kind=>(current.items||[]).filter(x=>x.status===kind||(kind==='filled'&&x.filled)).length;
  $('counts').textContent=`已填 ${count('filled')} · 需审阅 ${count('review')} · 故障 ${count('error')}\n已有值 ${count('preserved')} · 跳过 ${count('skip')} · 待写入 ${current.ready||0}`;
  const active=disconnected?[]:Object.values(current.analysis?.tasks||{}).filter(x=>x.state==='analyzing');
  $('activity').textContent=`分析并发 ${active.length}/3`+(active.length?'\n'+active.map(x=>x.title+'：'+x.detail).join('\n'):'');
  $('current').textContent=!disconnected&&current.current_field?'正在操作控件：'+current.current_field:'';
  $('issues').replaceChildren();
  const handoff=current.handoff;
  if(handoff){const summary=document.createElement('p');summary.textContent=`人工接手：必填 ${handoff.required_groups} 组 · 必填性待确认 ${handoff.unknown_required_groups} 组 · 可选 ${handoff.optional_groups} 组 · 文字审阅 ${handoff.text_review_groups} 组。\n${handoff.recommendation}`;$('issues').append(summary);}
  const issues=handoff?.groups?.map(g=>({...g,label:g.labels.join('、'),reason:g.action}))||(current.items||[]).filter(x=>['review','error'].includes(x.status));
  for(const item of issues){
   const row=document.createElement('p');row.textContent=(item.filled?'已填，待审阅 · ':'')+(item.section?item.section+(Number.isInteger(item.record_index)?' '+(item.record_index+1):'')+' · ':'')+item.label+'：'+item.reason;$('issues').append(row);
  }
  buttons();
 }finally{refreshing=false;}
}
async function act(kind,extra){
 if(busy)return;
 busy=true;stickyError='';buttons();$('status').textContent=kind==='stop-active'?'正在请求停止…':'正在连接本机服务与页面…';
 try{
  await target();const result=await send(kind,extra);
  if(kind==='start-active'&&!result?.started)throw Error('页面未确认启动，请重试');
  disconnected=false;await refresh();
 }catch(error){if(kind==='stop-active')disconnected=true;showError(error);}
 finally{busy=false;buttons();if(!stickyError)await refresh().catch(showError);}
}
$('start').onclick=()=>act('start-active');$('retry').onclick=()=>act('start-active',{retry:true});$('stop').onclick=()=>act('stop-active');
$('drafts').onclick=()=>act('start-active',{retry:true,draftsOnly:true});
$('recover').onclick=()=>act('recover-drafts-active');
$('settings').onclick=()=>send('open-options').catch(showError);
$('diagnose').onclick=async()=>{try{await target();await send('diagnose-active');$('diagnose').textContent='页面结构已记录';}catch(error){showError(error);}};
window.addEventListener('unhandledrejection',event=>showError(event.reason));
buttons();
(async()=>{
 try{
  const tab=await target();await refresh();
  if(current?.running){const state=await send('page-state');disconnected=!state?.connected||!state.running;await refresh();}
  if(!current&&/^https?:/.test(tab?.url||'')){
   const found=await bounded(chrome.scripting.executeScript({target:{tabId},func:()=>!!document.getElementById('resume-autofill-panel')}),6000,'检查上轮填写状态');
   if(found.some(frame=>frame.result))$('status').textContent='检测到上轮填写页面。可记录页面结构，或点击“重试待处理”继续。';
   else $('status').textContent='准备就绪。点击“开始填写”后运行；所有附件由你手动上传。';
  }
  else if(!current)$('status').textContent='请先打开申请网页，再点击插件。';
 }catch(error){showError(error);}
})();
setInterval(()=>refresh().catch(showError),800);
