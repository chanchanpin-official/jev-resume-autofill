// Runs in MAIN world: read only public component configuration, never field values.
// Publish a validated format as DOM metadata for the isolated content script.
(() => {
  for(const root of document.querySelectorAll('.el-date-editor')){
    // Tooltip wrappers can replace __vue__ on the same root. Inspect only
    // component links/configuration and require the date picker to own this DOM.
    const queue=[root.__vue__],seen=new Set();
    for(let count=0;queue.length&&count<80;count++){
      const component=queue.shift();if(!component||seen.has(component))continue;
      seen.add(component);
      if(component.$options?.name!=='ElDatePicker'||component.$el!==root){
        queue.push(component.$parent,...(component.$children||[]));continue;
      }
      const format=component.valueFormat||component.format||({date:'yyyy-MM-dd',month:'yyyy-MM',year:'yyyy'}[component.type]);
      if(/^(?:yyyy-MM-dd|yyyy-MM|yyyy|yyyy\/MM\/dd|yyyy\/MM)$/.test(format||''))root.setAttribute('data-resume-date-format',format);
      break;
    }
  }
})();

// Read-only save diagnostics: component validation states and bounded request
// status metadata. Never publish form values, request bodies, query strings,
// credentials, or response bodies.
(() => {
  if(location.hostname!=='xyz.51job.com')return;
  const endpoints=new Set(['/talent-domain/consumer/updateSingleResumeSubInfo','/talent-domain/consumer/addResumeSub','/talent-domain/consumer/updateResumeInfo']);
  for(const form of document.querySelectorAll('form.basic-wrapper')){
    const queue=[form.__vue__],seen=new Set();let fieldStates=[],flags={},owner=null;
    for(let n=0;queue.length&&n<40;n++){
      const component=queue.shift();if(!component||seen.has(component))continue;seen.add(component);
      if(component.$el!==form&&!component.$el?.contains(form))continue;
      if(component.$options?.name==='ElForm')fieldStates=(component.fields||[]).filter(f=>f.validateState==='error'||f.validateState==='validating').map(f=>({label:String(f.label||'').slice(0,120),state:f.validateState}));
      if(typeof component.handleSave==='function'&&!owner){
        if(component.$options?.name==='EditBasicInfo')for(const f of Object.values(component.fields||{})){
          if(f.inputType!==4)continue;const refs=component.$refs?.[f.colName],picker=Array.isArray(refs)?refs[0]:refs;
          if(picker?.$options?.name==='ElDatePicker'&&component.$el.contains(picker.$el)){
            const value=component.formData?.[f.colName];picker.$el.toggleAttribute('data-resume-date-needs-commit',typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value));
          }
        }
        owner={name:component.$options?.name,module_label:component.module?.cname,mode:component.type,single:component.isSingleModule,has_resume_id:!!component.resumeId,has_sub_id:!!component.data?.resumeSubID,has_module_id:!!component.module?.modId,fields:Object.values(component.fields||{}).map(f=>{const v=component.formData?.[f.colName];return {label:String(f.cname||'').slice(0,120),key:f.colName,input_type:f.inputType,value_type:v===null?'null':Array.isArray(v)?'array':typeof v,empty:v===undefined||v===null||v==='',date_shape:f.inputType===4&&typeof v==='string'?v.replace(/\d/g,'D'):undefined};})};
        for(const key of ['isPreview','disabledSave','isLianHeLihua','isLianHeLihuaCanSave'])if(typeof component[key]==='boolean')flags[key]=component[key];
      }
      queue.push(component.$parent);
    }
    const requests=performance.getEntriesByType('resource').filter(e=>performance.now()-e.startTime<30000).flatMap(e=>{
      try{const path=new URL(e.name).pathname;return endpoints.has(path)?[{path,status:e.responseStatus||0,duration:Math.round(e.duration)}]:[];}catch{return [];}
    }).slice(-4);
    form.setAttribute('data-resume-save-diagnostics',JSON.stringify({fieldStates,flags,owner,requests,saveResponses:(window.__resumeSaveProbe?.entries||[]).filter(e=>Date.now()-e.at<120000)}));
  }
})();

// Observe only the three existing section-save endpoints; no request mutation,
// replay, request payload, headers or applicant response data is retained.
(() => {
  if(location.hostname!=='xyz.51job.com'||window.__resumeSaveProbe)return;
  const paths=new Set(['/talent-domain/consumer/updateSingleResumeSubInfo','/talent-domain/consumer/addResumeSub','/talent-domain/consumer/updateResumeInfo']);
  const probe=window.__resumeSaveProbe={entries:[]},bound=new WeakMap(),open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url,...args){
    try{const path=new URL(String(url),location.href).pathname;if(paths.has(path))bound.set(this,path);else bound.delete(this);}catch{bound.delete(this);}
    return open.call(this,method,url,...args);
  };
  XMLHttpRequest.prototype.send=function(...args){
    const path=bound.get(this);
    if(path){const started=Date.now();this.addEventListener('loadend',()=>{
      let code=null,message='';try{const body=this.responseType==='json'?this.response:JSON.parse(this.responseText);code=typeof body.code==='number'||/^[A-Za-z0-9_-]{1,30}$/.test(body.code||'')?body.code:null;
       message=String(body.message||body.msg||'').slice(0,180).replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|\d{7,}/g,'[redacted]');
      }catch{}
      probe.entries.push({path,status:this.status,code,message,duration:Date.now()-started,at:Date.now()});probe.entries=probe.entries.slice(-4);
    },{once:true});}
    return send.apply(this,args);
  };
})();
