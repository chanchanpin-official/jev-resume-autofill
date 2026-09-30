// Read only, on explicit request. No input values, cookies, page HTML or model calls.
(() => {
  const controls='input,textarea,select,[role="combobox"],[contenteditable="true"]';
  const allowedText=/^(申请信息|附件简历|上传简历|个人信息|基本信息|教育经历|教育背景|工作经历|工作经历（含实习）|实习经历|项目经历|项目经验|校园经历|在校情况|作品|获奖|获奖经历|语言能力|自我评价|个人介绍|求职意向|其他信息|社交账号|添加|新增|更新|编辑|修改|保存|取消|删除|开始时间|结束时间|至今|YYYY|MM)$/;
  const nodeInfo=e=>({tag:e.tagName,...(e.type==='file'?{selected_file_count:e.files?.length||0}:{}),class:String(e.className||'').slice(0,500),role:e.getAttribute('role')||'',
    text:allowedText.test((e.textContent||'').trim())?(e.textContent||'').trim():'',
    attrs:Object.fromEntries([...e.attributes].filter(a=>/^(?:type|placeholder|data-field|data-format|data-resume-date-format|aria-label|aria-controls|aria-owns|readonly)$/.test(a.name)).map(a=>[a.name,a.value.slice(0,200)]))});
  const structure=e=>{
    const parents=[];for(let p=e.parentElement;p&&parents.length<10&&p!==document.body;p=p.parentElement)parents.push({...nodeInfo(p),children:[...p.children].slice(0,24).map(nodeInfo)});
    return {...nodeInfo(e),labels:e.labels?[...e.labels].map(x=>x.textContent.trim().slice(0,150)):[],parents};
  };
  const actions=[...document.querySelectorAll('button,a,[role="button"],span,i,div,h2,h3,h4')].filter(e=>!e.closest('#resume-autofill-panel')&&(allowedText.test((e.textContent||'').trim())||/\b(?:icon-edit|edit-icon)\b/.test(String(e.className))));
  return {host:location.hostname,version:chrome.runtime.getManifest().version,ready_state:document.readyState,
    save_diagnostics:[...document.querySelectorAll('form.basic-wrapper[data-resume-save-diagnostics]')].map(e=>{try{return JSON.parse(e.getAttribute('data-resume-save-diagnostics'));}catch{return {};}}),
    model_fields:(globalThis.__resumeAutofill?.scan(true)||[]).map(f=>Object.fromEntries(['label','section','type','preceding_labels','format','max_length','record_index'].filter(k=>f[k]!==undefined).map(k=>[k,f[k]]))),
    fields:[...document.querySelectorAll(controls)].slice(0,200).map(structure),actions:actions.slice(0,100).map(structure),
    frames:[...document.querySelectorAll('iframe')].map(e=>({title:e.title,origin:(()=>{try{return new URL(e.src,location.href).origin;}catch{return '';}})()}))};
})();
