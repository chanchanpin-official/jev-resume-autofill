(() => {
  const VERSION = '0.2.0';
  const reconnect=globalThis.__resumeAutofillReconnect===true;
  delete globalThis.__resumeAutofillReconnect;
  const previous=globalThis.__resumeAutofill;
  if (previous?.version===VERSION&&!reconnect) return;
  if (previous?.getRunning()&&!reconnect) throw new Error('旧版填写仍在运行，请先停止后再加载新版');
  if(previous?.dispose)previous.dispose();
  else if(reconnect&&previous?.getRunning())previous.stop?.().catch(()=>{});
  document.getElementById('resume-autofill-panel')?.remove();
  const FIELD_SELECTOR = 'input,textarea,select,[contenteditable="true"],[role="combobox"],[role="textbox"],[role="radio"],[role="checkbox"],.atsx-date-picker-period-month-label,.phoenix-radio-group';
  const WRAPPER = '.ant-form-item,.el-form-item,.ivu-form-item,.atsx-form-item,.semi-form-field,.form-item,.form-group,.form-field,[data-field],fieldset,[class*="apply-field-"]';
  const RECORD = '[data-resume-record],.education-item,.experience-item,.project-item,.resume-item,[data-record-index],[class*="apply-fields-"][class*="multi-"],.createFormSection-repeatable .resumeEditForm-item';
  const FEISHU_SECTION = '[class*="createFormSection__"],.createFormSection-repeatable';
  const FEISHU_ADD = '.formOperate-addBtn,.createFormSection-addBtn';
  const CUSTOM = '.phoenix-select,.jsb_three_layer_container,.el-autocomplete,[role="combobox"],.ant-select,.el-select,.ivu-select,.atsx-select,.atsx-cascader-picker,.atsx-calendar-picker,.atsx-date-picker,.semi-select,.ant-cascader,.el-cascader,.ant-picker,.el-date-editor,[data-resume-control],[class*="sd-Select-container-"]';
  const PANEL = '.common-unmodeled-layer:not(.common-unmodeled-layer-hidden),.phoenix-selectList,.phoenix-single-select-list,.jbs_three_layers_wrapper,.el-autocomplete-suggestion,[role="listbox"],[role="tree"],[role="dialog"],.ant-select-dropdown,.atsx-select-dropdown,.atsx-cascader-menus,.atsx-calendar,.atsx-date-picker-dropdown,.semi-select-option-list,.ant-picker-dropdown,.ant-cascader-dropdown,.el-select-dropdown,.el-picker-panel,.el-cascader__dropdown,.ivu-select-dropdown,.date-picker-popup,[data-resume-popup],[class*="sd-Dropdown-dropdown-"],[class*="sd-Select-menu-"],[class*="sd-Cascader-panel-"],[class*="sd-Cascader-menuContainer-"],[class*="sd-Menu-container-"],[class*="sd-Select-scrollable-"]';
  const OPTION = '.phoenix-selectList__listItem,.phoenix-single-select-list__item,.cascader_panel_item,.el-autocomplete-suggestion__list li,[role="option"],[role="treeitem"],[role="menuitem"],.ant-select-item-option,.atsx-select-dropdown-menu-item,.atsx-cascader-menu-item,.semi-select-option,.ant-cascader-menu-item,.el-select-dropdown__item,.el-cascader-node,.ivu-select-item,[data-resume-option],[class*="sd-Select-item-"],[class*="sd-Select-common-item-"],[class*="sd-Select-menu-item-"],[class*="sd-Cascader-option-"],[class*="sd-Cascader-item-"],[class*="sd-Menu-content-item-"],[class*="sd-List-content-item-"]';
  const UNSAFE = /提交|投递|申请职位|确认申请|同意|承诺|声明|隐私|注册|登录|删除|清空|重置|submit|apply\s+now|agree|consent|privacy|declaration|register|sign\s*in|delete|reset/i;
  const PROTECTED = /密码|验证码|银行卡|银行账号|社保.*账号|公积金.*账号|护照.*号|通行证.*号|password|passcode|verification.?code|one.?time|otp\b|bank.*(account|card)|passport.*(no|number)/i;
  const MANUAL_SECTION = /隐私|声明|承诺|同意|条款|授权|诚信|志愿|应聘岗位|申请职位|privacy|consent|declaration|terms|target.?job/i;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let running = false, cancelled = false, settings = {}, panel, panelRoot;
  const activeJobs = new Set(), knownFields = new Set();
  let startedAt=0, finishedAt=0, ticker=null, analysisState={}, readyCount=0, currentField='';
  let reportTimer = null, queuedCount = 0;
  let counter = 0, report = [], attempted = new Set(), successful = new Map();
  const ids = new WeakMap(), elements = new Map(), descriptors = new Map();
  const snapshots = new Map(), mutations = [];
  const editorRecords=new WeakMap();
  const userEditedNodes=new WeakSet(),userEditedFields=new Set(previous?.getUserEdits?.()||[]),userEditedForms=new WeakSet();
  let writeContext=null,userEditRevision=0,ownWriteDepth=0;
  const trustedInputStates=new WeakMap();
  let editorScope=null,editorRecordsContext=[],sectionDraftSaved=false,editorPaused=false,draftMode=false;
  const saved51Records=new Set();
  let formSupport={attachments:[],corrections:[]},authorizedWrite=null;
  const correctedForms=new WeakMap();
  const correctionAttempts=new Set();
  let handoffReason='',controlFailures=0;
  const recentRounds=(previous?.getRecentRounds?.()||[]).slice(-2);
  const is51job=()=>location.hostname==='xyz.51job.com'&&/^\/consumer\/pc\/resume\/index\/?$/.test(location.pathname);

  function assertRunBudget(){
    if(!running)return;
    // Finish recovery/verification of a save already in flight before handing
    // over. A new record or save must still pass the budget check in job().
    if(restoringDrafts||draftQueue&&draftQueue.phase==='saving')return;
    if(!handoffReason&&running&&Date.now()-startedAt>=settings.maxRunSeconds*1000)handoffReason='达到本轮时间预算，已保留当前内容；建议人工完成剩余项';
    if(handoffReason)throw Object.assign(new Error(handoffReason),{handoff:true});
  }
  function requiredState(el){
    const wrapper=el.closest(WRAPPER),labelNode=wrapper?.querySelector('label,.form-item__title,.atsx-form-item-label,.el-form-item__label');
    if(el.required||el.getAttribute('aria-required')==='true'||wrapper?.matches('.is-required')||wrapper?.querySelector('.atsx-form-item-required,.ant-form-item-required')||/^\s*\*|\*\s*$/.test(text(labelNode)))return true;
    if(el.getAttribute('aria-required')==='false'||wrapper?.matches('.atsx-form-item,.el-form-item,.form-item--phoenix')&&labelNode)return false;
    return null;
  }
  function issueKind(item){
    if(item.issue_kind)return item.issue_kind;
    if(item.filled)return 'verify_text';
    if(item.status==='error')return 'control_error';
    if(/身份|唯一对应|经历名称/.test(item.reason))return 'record_identity';
    if(/资料不足|缺少|未记录|profile/.test(item.reason))return 'fact_unresolved';
    if(/保存|校验|草稿/.test(item.reason))return 'save_review';
    if(/声明|本人|授权/.test(item.reason))return 'manual_confirmation';
    return 'model_uncertain';
  }
  function handoffSummary(){
    const actions={record_identity:'核对这一条经历的名称和归属后再重试',missing_fact:'补充真实资料；没有资料就留空',fact_unresolved:'核对或补充 profile 中对应事实',date_unresolved:'确认这条经历的已知年月，不能猜日期',missing_link:'有对应网址再补，没有则留空',unsupported_control:'手动操作这个控件，然后继续其他空白',control_error:'手动完成失败控件，避免整页重复运行',verify_text:'通读已填文字，确认含义与原资料一致',save_review:'查看本栏校验提示；保留当前草稿',manual_confirmation:'由你本人确认',manual_attachment:'请手动选择并上传附件；插件不会上传或替换文件',model_uncertain:'人工核对这一项'};
    const groups=new Map();
    for(const item of report.filter(r=>['review','error'].includes(r.status))){
      const kind=issueKind(item),key=[item.section,item.record_index,kind].join('|');
      if(!groups.has(key))groups.set(key,{section:item.section||'',record_index:item.record_index,kind,required:false,unknown_required:false,filled:!!item.filled,labels:[],action:actions[kind]||actions.model_uncertain});
      const group=groups.get(key);group.required ||= item.required===true;group.unknown_required ||= item.required==null;
      group.filled &&= !!item.filled;if(!group.labels.includes(item.label))group.labels.push(item.label);
    }
    const pending=[...groups.values()].sort((a,b)=>Number(b.required)-Number(a.required));
    const lowYield=recentRounds.length>=2&&recentRounds.every(r=>r.written<3)&&pending.some(g=>!g.filled);
    return {groups:pending,required_groups:pending.filter(g=>g.required&&!g.filled).length,
      optional_groups:pending.filter(g=>!g.required&&!g.unknown_required&&!g.filled).length,
      unknown_required_groups:pending.filter(g=>!g.required&&g.unknown_required&&!g.filled).length,
      text_review_groups:pending.filter(g=>g.filled).length,
      recommendation:lowYield?'连续两轮新增填写均不足3项，建议人工收尾；补充资料或展开新内容后再重试':handoffReason||'先处理必填问题，再审阅已填文字；可选项可按需补充',
      max_run_seconds:settings.maxRunSeconds||180};
  }

  function queryAll(selector, root = document) {
    let result = [...root.querySelectorAll(selector)];
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot && node !== panel) result.push(...queryAll(selector,node.shadowRoot));
    return result.filter(e => e !== panel && !panelRoot?.contains(e));
  }
  function visible(el) {
    if (!el?.isConnected || el.closest('[inert],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && !!el.getClientRects().length;
  }
  function text(el) { return (el?.innerText || el?.textContent || '').replace(/\s+/g,' ').trim(); }
  function label(el) {
    const root = el.getRootNode();
    const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => text(root.getElementById?.(id))).join(' ');
    let labels = el.labels ? [...el.labels].map(text).join(' ') : '';
    if(!labels&&['checkbox','radio'].includes(el.type)){
      const controlLabel=el.closest('label');
      const adjacent=controlLabel?.nextElementSibling;
      if(adjacent&&!adjacent.querySelector('input,select,textarea'))labels=text(adjacent).slice(0,500);
    }
    const wrapper = el.closest(WRAPPER);
    const mokaTitle=wrapper?.matches('[class*="apply-field-"]')?text(wrapper.querySelector('[class^="title-"]')):'';
    const local = wrapper?.querySelector('label,legend,.ant-form-item-label,.atsx-form-item-label,.semi-form-field-label,.el-form-item__label,.form-label,.form-item__title,[data-label]');
    let base=(mokaTitle || labelled || el.getAttribute('aria-label') || labels || text(local) || (el.type==='file'&&el.closest('.uploadResume-section')?'附件简历':'') || el.getAttribute('placeholder') || el.name || el.id || '未命名字段').replace(/^[＊*]\s*/,'').replace(/[＊*：:]\s*$/,'').slice(0,400);
    if(el.matches('.atsx-date-picker-period-month-label')){
      const index=[...el.parentElement.querySelectorAll('.atsx-date-picker-period-month-label')].indexOf(el);
      return base+' · '+(index===0?'开始 / Start':'结束 / End');
    }
    if(mokaTitle){
      if(el.type==='checkbox')return base+' / '+labels;
      const date=el.closest('.month-range-select');
      if(date){
        const inputs=[...date.querySelectorAll('input[type="text"]')],index=inputs.indexOf(el);
        // Moka clears placeholders after a value is selected. Preserve the paired position.
        const part=/year|年/i.test(el.placeholder)||(!/month|月/i.test(el.placeholder)&&index>=0&&index%2===0)?'年 / Year':'月 / Month';
        base+=' · '+(inputs.length>=4?(index<2?'开始 / Start · ':'结束 / End · '):'')+part;
      }else if(wrapper.querySelectorAll('input[type="text"]').length>1&&el.closest('[class*="sd-Select-container-"]')){
        base+=/手机|mobile|phone/i.test(mokaTitle)?' · 国家区号 / Calling code':/证件|ID number/i.test(mokaTitle)?' · 证件类型 / ID document type':'';
      }
    }
    return base;
  }
  function phoenixSection(el){
    if(!document.querySelector('[class*="STFrom-editor"] .ux-standard-form'))return null;
    // Beisen's repeated records each own one ux-standard-form. Layout rows and
    // form-part blocks inside it are NOT separate experiences.
    const root=el.closest('.sc-iAKWXU');
    if(!root?.querySelector('.ux-standard-form'))return null;
    const heading=[...root.children].find(c=>c.matches('.sc-efQSVx'));
    return heading?{root,title:text(heading)}:null;
  }
  function section(el) {
    const phoenix=phoenixSection(el);if(phoenix)return phoenix.title;
    if(is51job()&&el.closest('.resume-module'))return text(el.closest('.resume-module').querySelector('.resume-module-header .title')).slice(0,250);
    const feishu=el.closest(FEISHU_SECTION);
    if(feishu)return text(feishu.querySelector('.createFormSection-text')||feishu.querySelector('.createFormSection-left')).slice(0,250);
    const moka=el.closest('[class*="apply-block-"]');
    if(moka)return text(moka.querySelector('[class*="blockTitle-"] [class*="text-"]')).slice(0,250);
    let current = el.parentElement;
    for (let i=0;current && i<8;i++,current=current.parentElement) {
      const explicit = current.getAttribute('data-resume-section') || current.getAttribute('aria-label');
      if (explicit) return explicit.slice(0,300);
      const heading = [...current.children].find(c => c.matches('h1,h2,h3,h4,legend,.section-title,.card-title,.ant-card-head'));
      if (heading) return text(heading).slice(0,300);
    }
    return '';
  }
  function recordInfo(el) {
    const phoenix=phoenixSection(el);
    if(phoenix){
      if(!/经历|论文|专著|获奖|附加信息/.test(phoenix.title))return {record_index:null,record_hint:''};
      const record=el.closest('.ux-standard-form');
      if(!record)return {record_index:null,record_hint:''};
      const records=[...phoenix.root.querySelectorAll('.ux-standard-form')].filter(visible);
      const facts=[...record.querySelectorAll('input,textarea')].filter(e=>/^(学校名称|公司名称|单位名称|项目名称|名称|获奖项|开始时间|结束时间)$/.test(label(e))).map(e=>currentValue(e)?label(e)+'='+currentValue(e):'').filter(Boolean);
      return {record_index:records.indexOf(record),record_hint:facts.join('; ').slice(0,500)};
    }
    if(is51job()){
      const form=el.closest('form.basic-wrapper');
      if(form&&editorRecords.has(form))return editorRecords.get(form);
      if(el.closest('.resume-module'))return {record_index:null,record_hint:''};
    }
    let record = el.closest(RECORD);
    if(!record&&el.closest(FEISHU_SECTION))return {record_index:null,record_hint:''};
    if(!record&&el.closest('[class*="apply-block-"]'))return {record_index:null,record_hint:''};
    // Infer repeated containers only when siblings share class and contain multiple fields.
    if (!record) {
      let parent = el.closest(WRAPPER)?.parentElement;
      for (let i=0;parent && i<4;i++,parent=parent.parentElement) {
        if (!parent.className || typeof parent.className !== 'string' || parent.querySelectorAll('input,select,textarea').length<2) continue;
        const siblings = [...parent.parentElement?.children || []].filter(s => s.className === parent.className && s.querySelectorAll('input,select,textarea').length>=2);
        if (siblings.length>1) { record=parent; break; }
      }
    }
    if (!record) return {record_index: null, record_hint: ''};
    const siblings = [...record.parentElement.children].filter(c => c.matches(RECORD) || c.className === record.className);
    const heading = record.querySelector('h3,h4,h5,legend,[data-record-title]');
    const identities=[...record.querySelectorAll('input,[role="combobox"]')].filter(e=>/学校名称|公司名称|项目名称|获奖名称|奖项名称|school name|company name|project name|award name/i.test(label(e))).map(e=>({label:label(e),value:currentValue(e)})).filter(x=>x.value);
    return {record_index: Math.max(0,siblings.indexOf(record)), record_hint: (text(heading)+' '+identities.map(x=>x.label+'='+x.value).join('; ')).trim().slice(0,500)};
  }
  function blocked(el, description) {
    if (PROTECTED.test(description.label+' '+description.name+' '+description.placeholder) || el.type==='password'||el.autocomplete==='one-time-code') return '账号或受保护信息，需本人手填';
    if (/同意|承诺|声明|隐私|条款|真实性|真实有效|虚假陈述|签名|签署|agree|consent|privacy|declaration|terms|signature/i.test(description.label)) return '声明、条款或签署，需本人确认';
    if(/同步更新在线简历|synchronously update online resume/i.test(description.label))return '同步保存设置，需本人确认';
    if(description.label==='未命名字段'&&['checkbox','radio'].includes(el.type))return '没有可识别标签的勾选项，需本人确认';
    if(/搜索|search|keyword|关键字|关键词/i.test(description.label+' '+description.placeholder))return '页面搜索框，不是申请资料';
    if(/应聘岗位|申请职位|申请岗位|意向岗位|岗位选择|position applied|job applied|desired position|target role/i.test(description.label))return '应聘岗位由本人选择';
    if (el.disabled || el.getAttribute('aria-disabled')==='true') return '字段已禁用';
    return null;
  }
  function isCustom(el) {
    return el.matches('.phoenix-radio-group')||!!el.closest('.phoenix-select,'+CUSTOM) || (el.readOnly && el.tagName==='INPUT');
  }
  function currentValue(el) {
    if(el.matches('.phoenix-radio-group'))return text(el.querySelector('.phoenix-radio--checked .phoenix-radio__radio-text'));
    if(el.closest('.phoenix-select'))return text(el.closest('.phoenix-select').querySelector('.phoenix-select__tipEle'));
    if (el.type==='checkbox' || el.type==='radio' || ['checkbox','radio'].includes(el.getAttribute('role'))) return el.checked || el.getAttribute('aria-checked')==='true' ? '__checked__' : '';
    if (el.type==='file') {
      const wrapper=el.closest('.uploadResume')||el.closest(WRAPPER)||el.parentElement;
      if([...wrapper.querySelectorAll('.atsx-upload-list-item-done')].some(visible))return '__file__';
      if([...wrapper.querySelectorAll('.uploadFile-loadedWrapper .uploadFile-loadedFilename')].some(e=>visible(e)&&text(e)))return '__file__';
      const uploaded=[...(wrapper?.querySelectorAll('button,a,span,div')||[])].some(node=>{
        const name=text(node);
        return visible(node)&&name.length<200&&/^[^\n/]{1,160}\.(?:pdf|docx?|pptx?|wps)(?:\s*\d+(?:\.\d+)?\s*(?:KB|MB|GB|B))?$/i.test(name);
      });
      return el.files?.length||uploaded ? '__file__' : '';
    }
    if(el.matches('.atsx-date-picker-period-month-label')){
      if(el.querySelector('.atsx-date-picker-period-month-label-toToday'))return 'Present';
      const year=text(el.querySelector('.atsx-date-picker-period-month-label-year'));
      const month=text(el.querySelector('.atsx-date-picker-period-month-label-month'));
      return /^\d{4}$/.test(year)&&/^\d{1,2}$/.test(month)?year+'-'+month.padStart(2,'0'):'';
    }
    if (el.tagName==='SELECT') {
      const selected = el.selectedOptions[0];
      return !selected || selected.disabled || /^(请选择|please select|select(?: an? option)?|选择|--)/i.test(text(selected)) ? '' : el.value;
    }
    const custom=el.closest(CUSTOM);
    // Element UI multiple Select stores answers in tags, while its input stays
    // empty (or contains a search query). Read committed labels before input.
    const tags=custom?.matches('.el-select')?custom.querySelector('.el-select__tags'):null;
    if(tags)return [...tags.querySelectorAll('.el-select__tags-text')].map(text).filter(Boolean).join('; ');
    const display=custom?.querySelector('[class*="sd-Input-display-value-"],.atsx-select-selection-selected-value,.ant-select-selection-item,.el-select__selected-item');
    if(display)return text(display)&&!/^(?:请选择|please select|select an? option|选择)(?:\s*\/.*)?$/i.test(text(display))?text(display):'';
    if ('value' in el) return el.value || '';
    if (el.isContentEditable || el.getAttribute('role')==='textbox') return text(el);
    return el.getAttribute('data-value') || el.querySelector('[data-selected],.ant-select-selection-item,.el-select__selected-item')?.textContent || '';
  }
  function fieldValue(el){
    if(['checkbox','radio'].includes(el.type||el.getAttribute('role')))return groupOptions(el).map(e=>currentValue(e)).join('');
    return currentValue(el);
  }
  function fieldState(el){
    if(['checkbox','radio'].includes(el.type||el.getAttribute('role')))return JSON.stringify(groupOptions(el).map(e=>!!currentValue(e)));
    if(el.tagName==='SELECT'&&el.multiple)return JSON.stringify([...el.selectedOptions].map(e=>e.value));
    return currentValue(el);
  }
  function wasUserEdited(el,f){
    return userEditedFields.has(f.fingerprint)||userEditedNodes.has(el)||(['checkbox','radio'].includes(f.type)&&groupOptions(el).some(e=>userEditedNodes.has(e)));
  }
  function onUserEdit(event){
    if(!event.isTrusted||ownWriteDepth)return;
    const path=event.composedPath();if(path.includes(panel))return;
    const target=path.find(e=>e instanceof Element&&e.matches(FIELD_SELECTOR))||path.find(e=>e instanceof Element&&e.matches(CUSTOM))?.querySelector(FIELD_SELECTOR);
    if(target){
      // Blur/removal can commit a delayed change for an input already captured
      // before saving. Only suppress that duplicate; new input/pointer events
      // and change-only controls must still invalidate pending writes.
      const state=fieldState(target);
      if(event.type==='change'){
        const inputState=trustedInputStates.get(target);trustedInputStates.delete(target);
        if(inputState===state)return;
      }
      if(event.type==='input')trustedInputStates.set(target,state);
      userEditRevision++;userEditedNodes.add(target);
      const f=descriptors.get(ids.get(target));if(f)userEditedFields.add(f.fingerprint);
      const form=target.closest('form');if(form)userEditedForms.add(form);
    }
    // Portalled custom options do not always dispatch a native input event.
    if(writeContext&&path.some(e=>e instanceof Element&&e.matches(PANEL))){
      userEditRevision++;userEditedFields.add(writeContext.f.fingerprint);
      const form=writeContext.el.closest('form');if(form)userEditedForms.add(form);
    }
  }
  function assertUserUntouched(){
    assertRunBudget();
    if(authorizedWrite&&authorizedWrite.revision!==userEditRevision)throw Object.assign(new Error('纠错期间检测到新的手动修改，已停止'),{preserved:true});
    if(authorizedWrite&&writeContext?.f.fingerprint===authorizedWrite.fingerprint)return;
    if(writeContext&&wasUserEdited(writeContext.el,writeContext.f))throw Object.assign(new Error('你已手动修改此字段，已保留；未应用过期模型结果'),{preserved:true});
  }
  function precedingQuestionLabels(el){
    const wrapper=el.closest(WRAPPER),root=el.closest('form')||el.closest('[data-resume-section],section');
    if(!wrapper||!root)return [];
    const previous=[];
    for(const item of root.querySelectorAll(WRAPPER)){
      if(item===wrapper)break;
      if(!visible(item)||item.contains(wrapper)||item.closest('.resume-module')!==wrapper.closest('.resume-module'))continue;
      const question=item.querySelector('label,legend,.el-form-item__label,.ant-form-item-label,.atsx-form-item-label');
      const value=text(question);if(value&&!previous.includes(value))previous.push(value.slice(0,400));
    }
    return previous.slice(-3);
  }
  function scan(observeOnly=false) {
    const fields=[], seenGroups=new Set(), duplicateCounts=new Map();
    const application=document.querySelector('.job-form__wrapper');
    for (const el of queryAll(FIELD_SELECTOR)) {
      if(editorScope&&!editorScope.contains(el))continue;
      if(application&&!application.contains(el))continue;
      if(el.closest('nav,header,[role="search"],.loginForm,[class*="login-form"],[class*="loginForm"],[class*="navbar"]'))continue;
      if (['hidden','submit','button','reset','image'].includes(el.type)) continue;
      if(el.matches('.atsx-date-picker-period-hidden-input')||el.closest('.resumeEditForm-hiddenField'))continue;
      if(el.matches('.atsx-select-search__field')&&!el.closest('.atsx-select-combobox'))continue;
      if (el.matches('[role="combobox"]') && (el.closest('.atsx-select-combobox')||!el.closest('.atsx-select')) && el.querySelector('input,select')) continue;
      if (el.matches('[role="textbox"]') && el.querySelector('input,textarea')) continue;
      const fileVisible = el.type==='file' && visible(el.closest(WRAPPER) || el.parentElement);
      if (!visible(el) && !fileVisible) continue;
      if (el.closest(PANEL)) continue; // popup search fields are not resume fields
      let id=ids.get(el); if (!id) {id='f'+(++counter); ids.set(el,id);}
      const info=recordInfo(el);
      let kind=el.type || el.getAttribute('role') || (el.isContentEditable ? 'contenteditable':'text');
      if (el.tagName==='TEXTAREA') kind='textarea';
      if (el.tagName==='SELECT') kind=el.multiple ? 'select-multiple':'select';
      if (isCustom(el) && !['radio','checkbox','file'].includes(kind)) kind='custom';
      const f={id,label:label(el),name:el.name||'',placeholder:el.getAttribute('placeholder')||'',section:section(el),type:kind,required:requiredState(el),
        autocomplete:el.autocomplete||'',max_length:el.maxLength>0 ? el.maxLength:null,format:el.matches('.atsx-date-picker-period-month-label')?'YYYY-MM':el.getAttribute('data-format')||el.closest('.el-date-editor')?.getAttribute('data-resume-date-format')||el.getAttribute('placeholder')||'',...info};
      if(/^(如果|若|如有|if\b)/i.test(f.label))f.preceding_labels=precedingQuestionLabels(el);
      if(el.matches('.atsx-date-picker-period-month-label'))f.date_endpoint=[...el.parentElement.querySelectorAll('.atsx-date-picker-period-month-label')].indexOf(el)===0?'start':'end';
      if (kind==='radio' || kind==='checkbox') {
        const group=el.closest('[role="radiogroup"],fieldset,'+WRAPPER) || el.parentElement;
        const groupLabel=group?.querySelector('legend,.ant-form-item-label,.atsx-form-item-label,.el-form-item__label,[data-group-label]');
        if (groupLabel) f.label=text(groupLabel);
        const key=kind+'|'+(el.name||f.label)+'|'+f.section+'|'+info.record_index;
        if (seenGroups.has(key)) continue;
        seenGroups.add(key);
      }
      // record_hint grows as school/company/project names are filled; it is model
      // context, not a stable field identity across React renders or batches.
      const fingerprint=[f.section,f.record_index,f.label,f.name,f.type].join('|');
      const ordinal=duplicateCounts.get(fingerprint)||0; duplicateCounts.set(fingerprint,ordinal+1);
      f.fingerprint=fingerprint+'|'+ordinal;
      elements.set(id,el); descriptors.set(id,f);
      if(observeOnly){fields.push(f);continue;}
      knownFields.add(f.fingerprint);
      if (attempted.has(f.fingerprint)) continue;
      if(wasUserEdited(el,f)){userEditedFields.add(f.fingerprint);addReport(f,'preserved','保留你的手动修改');attempted.add(f.fingerprint);continue;}
      const reason=blocked(el,f);
      if (reason) {addReport(f,'skip',reason);attempted.add(f.fingerprint);continue;}
      const hasValue=!!fieldValue(el);
      if (hasValue && (!settings.overwrite||info.user_draft||kind==='file')) {addReport(f,'preserved',kind==='file'?'页面已有上传文件，避免重复上传':'保留页面已有值');attempted.add(f.fingerprint);continue;}
      fields.push(f);
    }
    return fields;
  }
  let publicJobContext=null;
  async function loadPublicJobContext(){
    publicJobContext=null;
    const match=location.pathname.match(/^\/(campus|social)\/resume\/(\d+)\/apply\/?$/);
    if(!location.hostname.endsWith('.jobs.feishu.cn')||!match)return;
    const sourcePath=location.pathname;
    updatePanel('读取当前岗位 JD，核对 profile 的项目范围及相关补充经历…');
    try{
      // Public job description only. Never send applicant cookies or resume data.
      const response=await fetch('/api/v1/job/posts/'+match[2]+'?portal_type=6&with_recommend=false',{
        credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;
      const data=await response.json(),detail=data?.data?.job_post_detail;
      if(data.code!==0||String(detail?.id)!==match[2]||sourcePath!==location.pathname)return;
      const plain=value=>{const doc=new DOMParser().parseFromString(String(value||''),'text/html');return doc.body.textContent||'';};
      publicJobContext={path:sourcePath,title:plain(detail.title),text:[plain(detail.description),plain(detail.requirement)].join('\n').slice(0,6000)};
    }catch(_){/* No JD means core projects only, never title-based expansion. */}
  }
  function pageContext() {
    const job = document.querySelector('[data-job-description],.job-description,.job-detail,.position-description,.jobDetail-description,.job-form__title');
    const params=new URLSearchParams(location.search),tenant=params.get('ctmid')||'';
    const publicJob=publicJobContext?.path===location.pathname?publicJobContext:null;
    return {host:location.hostname,path:location.pathname,title:publicJob?.title||document.title,employer:text(document.querySelector('[data-company-name],.company-name,.company-info__name')).slice(0,300),tenant_id:is51job()&&/^\d{1,20}$/.test(tenant)?tenant:'',form_language:params.get('p_lang')||document.documentElement.lang||navigator.language,job_context:publicJob?.text||(job ? text(job).slice(0,6000):''),sections:queryAll('[data-resume-section],[class*="blockTitle-"] [class*="text-"],.createFormSection-text,.resume-module-header .title,[class*="STFrom-editor"] .sc-iAKWXU > .sc-efQSVx,h2,legend').map(text).slice(0,40)};
  }
  async function message(kind, extra={}) {
    let response;
    try{response=await chrome.runtime.sendMessage({kind,...extra});}
    catch(e){throw Object.assign(new Error(e.message||'插件连接中断'),{jobFailure:true});}
    if (!response?.ok) throw Object.assign(new Error(response?.error || '插件连接中断，请刷新页面'),{jobFailure:true});
    return response.data;
  }
  async function job(payload,onDecisions=null) {
    assertRunBudget();
    if (cancelled) throw new Error('已停止');
    const started=await message('create-job',{payload:{...payload,high:settings.high,low:settings.low,client_version:VERSION}});
    const jobId=started.job_id;activeJobs.add(jobId);
    const delivered=new Set();
    const deliver=rows=>{if(!onDecisions)return;const fresh=(rows||[]).filter(d=>!delivered.has(d.id));fresh.forEach(d=>delivered.add(d.id));onDecisions(fresh.map(d=>({...d,_job_id:jobId})));};
    try {
      for (let i=0;i<600;i++) {
        try{assertRunBudget();}catch(e){await message('cancel-job',{id:jobId}).catch(()=>{});throw e;}
        if (cancelled) { await message('cancel-job',{id:jobId}); throw new Error('已停止'); }
        const result=await message('poll-job',{id:jobId});
        deliver(result.decisions);
        if(payload.mode==='fields'){analysisState={completed:result.field_completed||delivered.size,total:result.field_total||payload.fields.length,tasks:result.tasks||{}};updatePanel();}
        if (result.status==='done'){deliver(result.result?.decisions);return result.result;}
        if (result.status==='error') throw Object.assign(new Error(result.error),{jobFailure:true});
        if (result.status==='cancelled') throw new Error('已停止');
        if(payload.mode!=='fields')updatePanel(result.progress || '正在判断…');
        await sleep(900);
      }
      await message('cancel-job',{id:jobId});
      throw Object.assign(new Error('模型任务超时，已暂停；可重试待处理'),{jobFailure:true});
    } finally {activeJobs.delete(jobId);}
  }
  function addReport(f,status,reason,extra={}) {
    report.push({label:f.label,section:f.section,record_index:f.record_index??null,required:f.required??null,status,reason,...(f.fingerprint?{field_key:f.fingerprint}:{}),...extra});
    updatePanel();
  }
  function reportSnapshot() {
    return {running,filled:report.filter(x=>x.status==='filled'||x.filled).length,queued:queuedCount,
      progress:panelRoot?.getElementById('status').textContent||'',items:report,version:VERSION,started_at:startedAt,finished_at:finishedAt,
      total:knownFields.size,completed:new Set(report.map(x=>x.field_key).filter(Boolean)).size,ready:readyCount,current_field:currentField,analysis:analysisState,handoff:handoffSummary()};
  }
  function queueReport() {
    if(reportTimer)return;
    reportTimer=setTimeout(()=>{reportTimer=null;message('report',{report:reportSnapshot()}).catch(()=>{});},500);
  }
  function ensurePanel() {
    if (panel?.isConnected) {panel.style.display='block';return;}
    panel=document.createElement('div');
    panel.id='resume-autofill-panel';
    panel.style.cssText='position:fixed;right:20px;bottom:20px;width:350px;z-index:2147483647;color-scheme:light;';
    panelRoot=panel.attachShadow({mode:'closed'});
    panelRoot.innerHTML=`<style>:host{all:initial}*{box-sizing:border-box}section{font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#273e35;background:#fafbf7;border:1px solid #d9e2d5;border-radius:14px;box-shadow:0 12px 50px #16372830;overflow:hidden}header{padding:15px 18px;background:#eaf0e5;display:flex;justify-content:space-between;align-items:center}h2{font-size:15px;margin:0}small{font-size:10px;color:#68816f;letter-spacing:1px}main{padding:14px 18px}p{margin:0 0 10px}#summary{font-weight:650}#log{max-height:230px;overflow:auto;font-size:12px}.row{padding:9px 0;border-top:1px solid #e7ece1}.row strong{display:block}.reason{color:#708073}.review strong,.error strong{color:#9b661c}.filled strong{color:#2c6958}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}button{border:0;border-radius:5px;padding:7px 10px;background:#2c6958;color:white;font:inherit;cursor:pointer}button.secondary{background:#e9eee4;color:#3b604a}#close{background:transparent;color:#3b604a;padding:0 5px;font-size:19px}#status{color:#5c7262}details{margin-top:10px}summary{cursor:pointer;color:#667b69}.foot{font-size:11px;color:#778671;margin-top:12px}</style><section><header><div><small>JEV + LLM</small><h2>简历填空 0.2.0${window.top!==window?' · 嵌入页面':''}</h2></div><button id="close" title="收起">×</button></header><main><p id="status">准备读取页面</p><p id="summary"></p><progress id="progress" max="1" value="0" style="width:100%;accent-color:#2c6958"></progress><p id="activity" aria-live="polite"></p><div id="log"></div><div class="actions"><button id="stop">停止</button><button id="retry" class="secondary">重试待处理</button><button id="undo" class="secondary">撤销本次填写</button><button id="drafts" class="secondary">仅补空白</button><button id="recover" class="secondary">恢复草稿</button><button id="settings" class="secondary">设置</button></div><p class="foot">绿色为已填；黄色为待审阅。附件上传、提交和声明由你完成。</p></main></section>`;
    document.documentElement.append(panel);
    panelRoot.getElementById('close').onclick=()=>{panel.style.display='none';};
    panelRoot.getElementById('stop').onclick=stop;
    panelRoot.getElementById('retry').onclick=()=>{if(!running)start(settings,true);};
    panelRoot.getElementById('drafts').onclick=()=>{if(!running)start({...settings,draftsOnly:true},true);};
    panelRoot.getElementById('drafts').hidden=!is51job();
    panelRoot.getElementById('undo').onclick=undo;
    panelRoot.getElementById('recover').onclick=recover51Drafts;
    panelRoot.getElementById('recover').hidden=!is51job();
    panelRoot.getElementById('settings').onclick=()=>message('open-options');
  }
  async function stop(){cancelled=true;updatePanel('正在停止…');await Promise.all([...activeJobs].map(id=>message('cancel-job',{id}).catch(()=>{})));}
  function updatePanel(status) {
    if (!panelRoot) return;
    if (status) panelRoot.getElementById('status').textContent=status;
    const filled=report.filter(x=>x.status==='filled'||x.filled).length;
    const review=report.filter(x=>x.status==='review').length;
    panelRoot.getElementById('summary').textContent=`已填 ${filled} · 需审阅 ${review} · 故障 ${report.filter(x=>x.status==='error').length} · 已有值保留 ${report.filter(x=>x.status==='preserved').length} · 跳过 ${report.filter(x=>x.status==='skip').length} · 排队 ${queuedCount}`;
    const done=new Set(report.map(x=>x.field_key).filter(Boolean)).size,total=knownFields.size;
    panelRoot.getElementById('progress').max=Math.max(total,1);panelRoot.getElementById('progress').value=done;
    const elapsed=startedAt?Math.floor((Date.now()-startedAt)/1000):0;
    const active=Object.values(analysisState.tasks||{}).filter(x=>x.state==='analyzing');
    panelRoot.getElementById('activity').textContent=`已处理 ${done}/${total} · 待写入 ${readyCount} · ${Math.floor(elapsed/60)}分${elapsed%60}秒\n分析并发 ${active.length}/3${active.length?'：'+active.map(x=>x.title+'（'+x.detail+'）').join('；'):''}${currentField?'\n控件：'+currentField:''}`;
    const handoff=handoffSummary();
    if(!running)panelRoot.getElementById('activity').textContent+=`\n人工接手：必填问题 ${handoff.required_groups} 组 · 待确认必填性 ${handoff.unknown_required_groups} 组 · 可选 ${handoff.optional_groups} 组 · 文字审阅 ${handoff.text_review_groups} 组\n${handoff.recommendation}`;
    const log=panelRoot.getElementById('log');log.replaceChildren();
    const entries=running?report.slice(-60):handoff.groups.map(g=>({...g,status:'review',label:g.labels.join('、'),reason:g.action}));
    for(const entry of entries) {
      const row=document.createElement('div');row.className='row '+entry.status;
      const heading=document.createElement('strong');heading.textContent=(entry.status==='review'&&entry.filled?'已填，待审阅 · ':'')+(entry.section?entry.section+(Number.isInteger(entry.record_index)?' '+(entry.record_index+1):'')+' · ':'')+entry.label;
      const reason=document.createElement('div');reason.className='reason';reason.textContent=entry.reason;
      row.append(heading,reason);log.append(row);
    }
    panelRoot.getElementById('stop').disabled=!running;
    panelRoot.getElementById('retry').disabled=running;
    panelRoot.getElementById('undo').disabled=running;
    panelRoot.getElementById('recover').disabled=running;
    panelRoot.getElementById('drafts').disabled=running;
    queueReport();
  }
  function nativeSet(el,value,commit=true) {
    assertUserUntouched();
    if (el.isContentEditable) el.textContent=value;
    else {
      const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter)setter.call(el,value);else el.value=value;
    }
    el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
    if(commit){
      el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      el.dispatchEvent(new FocusEvent('blur',{bubbles:true,composed:true}));
    }
  }
  function saveSnapshot(el) {
    if(el.type==='file'||snapshots.has(el))return;
    snapshots.set(el,{value:el.value,text:el.isContentEditable?el.textContent:null,checked:el.checked,selected:el.tagName==='SELECT'?[...el.options].map(o=>o.selected):null});
    mutations.push(el);
  }
  function mark(el,review) {el.style.outline=review?'2px solid #d6a551':'2px solid #6fa588';el.style.outlineOffset='2px';}
  async function undo() {
    if(running)return;
    let restored=0,unavailable=0;
    for(const el of [...mutations].reverse()) {
      const snapshot=snapshots.get(el);
      if(!el.isConnected){unavailable++;continue;}
      const f=descriptors.get(ids.get(el));if(userEditedNodes.has(el)||(f&&wasUserEdited(el,f))){unavailable++;continue;}
      if(el.type==='file')continue;
      if(el.type==='radio'||el.type==='checkbox'){el.checked=snapshot.checked;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
      else if(snapshot.selected){[...el.options].forEach((o,i)=>o.selected=snapshot.selected[i]);el.dispatchEvent(new Event('change',{bubbles:true}));}
      else nativeSet(el,snapshot.text??snapshot.value??'');
      el.style.outline='';restored++;
    }
    updatePanel(`已尝试恢复 ${restored} 个原值${unavailable?'；'+unavailable+' 个控件已重建，需手动检查':''}。自定义控件和新增经历请检查。`);
    snapshots.clear();mutations.length=0;attempted.clear();successful.clear();
  }
  function safeClick(el) {
    assertUserUntouched();
    if(cancelled)throw new Error('已停止');
    if(!el?.isConnected||!visible(el)||el.disabled||el.getAttribute('aria-disabled')==='true')throw new Error('控件已变化或不可操作');
    if(el.matches('button') && (el.type==='submit'||!el.getAttribute('type')) && el.closest('form'))throw new Error('控件可能提交表单，已跳过');
    if(UNSAFE.test(text(el)) && !el.matches('[role="option"],option'))throw new Error('已阻止提交、声明或不安全操作');
    // Native checkbox/radio default actions dispatch trusted input/change events
    // even for HTMLElement.click(). They are ours, not a user's correction.
    ownWriteDepth++;try{el.click();}finally{ownWriteDepth--;}
  }
  function groupOptions(el) {
    const kind=el.type||el.getAttribute('role');
    if(el.name) return queryAll('input').filter(x=>x.type===kind&&x.name===el.name&&x.form===el.form&&visible(x));
    const root=el.closest('[role="radiogroup"],fieldset,'+WRAPPER)||el.parentElement;
    return [...root.querySelectorAll(kind==='radio'?'input[type="radio"],[role="radio"]':'input[type="checkbox"],[role="checkbox"]')].filter(visible);
  }
  async function choose(f,target,entries,context={}) {
    if(entries.length>240) throw new Error('可见选项超过 240 个，请先缩小搜索范围');
    const original=writeContext?.el,state=original?fieldState(original):null;
    const result=await job({mode:'options',field:f,target,page:pageContext(),context:{...context,verified_record:f.answer_context||[]},options:entries.map((x,i)=>({id:'o'+i,text:x.label}))});
    assertUserUntouched();
    const current=original&&resolveField(f,original);
    if(current&&fieldState(current)!==state)throw Object.assign(new Error('控件判断期间值已变化，已保留当前选择'),{preserved:true});
    return result;
  }
  function chosen(entries, result) {
    if(result.status!=='select')throw Object.assign(new Error(result.reason||'控件选项置信度不足'),{review:true});
    const index=Number(result.option_id?.replace(/^o/,''));
    if(!Number.isInteger(index)||!entries[index])throw new Error('选项已失效');
    return entries[index];
  }
  async function fillSelect(el,f,value) {
    const entries=[...el.options].filter(o=>!o.disabled&&o.value!==''&&!/^(请选择|please select)/i.test(text(o))).map(o=>({el:o,label:text(o)}));
    const result=await choose(f,value,entries,{multiple:el.multiple});
    if(cancelled)return;
    saveSnapshot(el);
    if(el.multiple){
      if(result.status!=='select'||!Array.isArray(result.option_ids))throw Object.assign(new Error(result.reason||'多选判断失败'),{review:true});
      const selected=new Set(result.option_ids);
      entries.forEach((entry,i)=>{entry.el.selected=selected.has('o'+i);});
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      if(entries.some((entry,i)=>entry.el.selected!==selected.has('o'+i)))throw new Error('页面未接受多选结果');
      return;
    }
    const option=chosen(entries,result);nativeSet(el,option.el.value);
    await sleep(180);
    if(!option.el.selected)throw new Error('页面未接受下拉选择');
  }
  async function fillCheck(el,f,value) {
    const options=groupOptions(el);
    const entries=options.map(o=>({el:o,label:label(o)}));
    // A lone checkbox is a yes/no answer, not a license to assume consent.
    if(options.length===1&&el.type==='checkbox'){
      const result=await choose(f,value,[{label:'Yes / 是 / checked'},{label:'No / 否 / unchecked'}]);
      if(result.status!=='select')throw Object.assign(new Error(result.reason),{review:true});
      const expected=result.option_id==='o0';saveSnapshot(el);
      if(el.checked!==expected)safeClick(el);
      if(el.checked!==expected)throw new Error('复选框未响应');
      return;
    }
    if(el.type==='checkbox'&&options.length>1){
      const result=await choose(f,value,entries,{multiple:true});
      if(result.status!=='select'||!Array.isArray(result.option_ids))throw Object.assign(new Error(result.reason||'多选判断失败'),{review:true});
      options.forEach(saveSnapshot);
      for(let i=0;i<options.length;i++){
        const expected=result.option_ids.includes('o'+i);
        if(!!currentValue(options[i])!==expected)safeClick(options[i]);
        if(!!currentValue(options[i])!==expected)throw new Error('页面未接受多选结果');
      }
      return;
    }
    const selected=chosen(entries,await choose(f,value,entries));
    options.forEach(saveSnapshot);safeClick(selected.el);await sleep(120);
    if(!currentValue(selected.el))throw new Error('页面未接受单选/多选');
  }
  function popupRoots(el,before) {
    const own=[el.getAttribute('aria-controls'),el.getAttribute('aria-owns'),el.closest('[aria-controls]')?.getAttribute('aria-controls'),el.closest('[aria-owns]')?.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(id=>el.getRootNode().getElementById?.(id)).filter(e=>e?.matches(PANEL)&&visible(e));
    if(own.length)return own;
    const local=el.closest('[class*="sd-Dropdown-container-"]');
    const nearby=local?[...local.querySelectorAll(PANEL)].filter(visible):[];
    if(nearby.length)return nearby;
    const panels=queryAll(PANEL).filter(visible);
    const fresh=panels.filter(p=>!before.has(p));
    return fresh.length?fresh:panels.length===1?panels:[];
  }
  function controlOptions(roots) {
    const seen=new Set(), entries=[];
    for(const root of roots){
      const opts=[...root.querySelectorAll(OPTION)];
      for(const option of opts){
        if(!visible(option)||option.getAttribute('aria-disabled')==='true'||option.className?.toString().match(/disabled/)||option.querySelector('.el-icon-loading,.empty'))continue;
        if([...option.querySelectorAll(OPTION)].some(visible))continue;
        const label=text(option);if(!label||seen.has(option))continue;
        seen.add(option);entries.push({el:option,label});
      }
    }
    return entries;
  }
  function calendarOptions(roots) {
    const entries=[];
    for(const root of roots){
      for(const el of root.querySelectorAll('[role="gridcell"],td[title],td .ant-picker-cell-inner,.atsx-date-picker-panel-body-cell-content,.el-year-table td,.el-month-table td,.el-date-table td,[data-date]')){
        if(!visible(el)||el.closest('.ant-picker-cell-disabled,.disabled,[aria-disabled="true"]'))continue;
        const cell=el.matches('.atsx-date-picker-panel-body-cell-content')?el:el.closest('td')||el;
        const label=cell.getAttribute('title')||cell.getAttribute('data-date')||el.getAttribute('data-cy')||el.getAttribute('aria-label')||text(el);
        if(label&&!entries.some(x=>x.el===cell))entries.push({el:cell,label});
      }
      // Only expose bounded calendar navigation controls, never arbitrary page buttons.
      for(const el of root.querySelectorAll('button,[role="button"],.el-date-picker__header-label,.atsx-date-picker-panel-header-operator')){
        if(!visible(el)||el.disabled)continue;
        const label=el.getAttribute('aria-label')||el.title||el.getAttribute('data-cy')||text(el);
        if(/year|month|previous|prev|next|年|月|上|下|前|后/i.test(label)&&!UNSAFE.test(label))entries.push({el,label:'Calendar navigation: '+label});
      }
    }
    return entries;
  }
  function resolveField(f,original) {
    if(original?.isConnected){
      if(f.record_hint&&f.record_hint!==recordInfo(original).record_hint)return null;
      return original;
    }
    // Re-scan current nodes but reuse a decision only for one structurally identical
    // field. Never migrate a decision to another experience or a changed identity.
    scan(true);
    const matches=[...descriptors.values()].filter(d=>d.fingerprint===f.fingerprint&&elements.get(d.id)?.isConnected);
    if(matches.length!==1)return null;
    const current=matches[0];
    if(f.record_hint&&f.record_hint!==current.record_hint)return null;
    return elements.get(current.id);
  }
  function visibleEntries(roots) {
    const options=controlOptions(roots);
    return options.length?options:calendarOptions(roots);
  }
  async function waitControl(el,before,requireEntries=false) {
    for(let i=0;i<20;i++){
      if(cancelled)throw new Error('已停止');
      const roots=popupRoots(el,before),entries=visibleEntries(roots);
      if(roots.length&&(!requireEntries||entries.length))return {roots,entries};
      await sleep(100);
    }
    const roots=popupRoots(el,before);return {roots,entries:visibleEntries(roots)};
  }
  async function fillCustom(el,f,value) {
    if(el.matches('.phoenix-radio-group')){
      const entries=[...el.querySelectorAll('.phoenix-radio')].filter(o=>visible(o)&&!o.classList.contains('phoenix-radio--disabled')).map(o=>({el:o,label:text(o.querySelector('.phoenix-radio__radio-text'))})).filter(o=>o.label);
      const result=chosen(entries,await choose(f,value,entries));
      safeClick(result.el);await sleep(120);
      if(currentValue(el)!==result.label)throw new Error('页面未接受单选结果');
      return;
    }
    if(el.matches('.atsx-date-picker-period-month-label'))return fillFeishuPeriod(el,f,value);
    if(el.closest('.el-date-editor'))return fillElementDate(el,f,value);
    // The captured Phoenix date control is a read-only select search input.
    // Its calendar is not yet verified: never type a date into its search box
    // or spend eighteen generic-dropdown iterations guessing navigation.
    if(el.closest('.phoenix-select')&&/时间|日期|年月|date|period/i.test(f.label))throw Object.assign(new Error('北森年月控件尚未验证自动选择，请手动选择本条日期；已保留其他内容'),{review:true,issue_kind:'unsupported_control'});
    saveSnapshot(el);
    const before=new Set(queryAll(PANEL).filter(visible));
    let trigger=el.closest(CUSTOM)||el;
    // Clicking a label also forwards a second click to its input, which can
    // immediately close a Moka dropdown. Activate its actual input only once.
    if(el.closest('.phoenix-select')){assertUserUntouched();el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,composed:true,button:0}));}
    safeClick(el);await sleep(220);
    const moka=trigger.matches('[class*="sd-Select-container-"]');
    const autocomplete=moka&&el.closest('[class*="string_info-"]');
    const companyAutocomplete=el.closest('.el-autocomplete')&&/公司|单位|company|employer/i.test(f.label);
    const companyNames=companyAutocomplete?[value,...(f.answer_context||[]).filter(c=>/\.(?:company_zh|company_en|company_group_zh|company_group_en|brand_name_zh|legal_name_zh)$/.test(c.source||'')).map(c=>String(c.value||'').trim())]:[];
    // Shorter and uppercase variants are search terms only, never new profile facts.
    const searchAliases=[...new Set(companyNames.flatMap(v=>[v,v.toUpperCase(),v.replace(/(?:股份有限公司|有限责任公司|有限公司|集团|科技)$/u,'')]).filter(v=>v.length>=2&&v!==value))].slice(0,8);
    let searchIndex=0;
    let searched=false;
    if(el.tagName==='INPUT'&&!el.readOnly&&!el.closest('.atsx-date-picker,.jsb_three_layer_container,.phoenix-select')&&(!moka||autocomplete)){
      if(el.closest('.el-autocomplete')&&document.activeElement===el)el.blur();
      el.focus();nativeSet(el,value,false);searched=true;if(companyAutocomplete)f.pending_company_query=value;
    }
    let trail=[],lastSignature='',unchanged=0;
    for(let step=0;step<18;step++){
      if(cancelled)throw new Error('已停止');
      el=resolveField(f,el);if(!el)throw new Error('字段身份已变化，无法沿用判断');
      trigger=el.closest(CUSTOM)||el;
      const {roots,entries:visibleOptions}=await waitControl(el,before,true);
      if(companyAutocomplete&&!visibleOptions.length&&searchIndex<searchAliases.length){
        // A dictionary may list the known group/brand instead of the unit name.
        // These are search queries only; Jev must still select a visible option.
        assertUserUntouched();el.focus();const query=searchAliases[searchIndex++];nativeSet(el,query,false);f.pending_company_query=query;continue;
      }
      if(!roots.length){
        // A search query is not a selected answer. Never report it as filled.
        throw new Error('未识别出可见下拉/日期面板');
      }
      let entries=visibleOptions;
      if(!searched&&(entries.length===0||entries.length>240)){
        const search=roots.flatMap(r=>[...r.querySelectorAll('input:not([type=checkbox]):not([type=radio])')]).find(e=>visible(e)&&!e.readOnly&&!e.disabled)
          || (el.tagName==='INPUT'&&!el.readOnly&&trigger.matches('[class*="sd-Select-container-"]')?el:null);
        if(search){searched=true;search.focus();nativeSet(search,value,false);await sleep(500);continue;}
      }
      if(!entries.length)throw Object.assign(new Error('控件面板尚未提供可识别的选项'),{review:!!el.closest('.phoenix-select')});
      if(roots.some(r=>r.querySelector('.ant-picker-date-panel,.el-date-table,.atsx-calendar-date-panel'))||entries.some(e=>/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(e.label)))value=dateWithDefaultDay(value,f);
      const signature=entries.map(e=>e.label).join('|');
      if(signature===lastSignature)unchanged++;else unchanged=0;
      if(unchanged>1)throw new Error('控件未继续变化，已停止尝试');
      lastSignature=signature;
      const result=await choose(f,value,entries,{trail,step,panel_headings:roots.map(r=>text(r.querySelector('header,.ant-picker-header,.el-date-picker__header,.atsx-date-picker-panel-header'))).join(' ')});
      let selected=chosen(entries,result);
      el=resolveField(f,el);if(!el)throw new Error('字段身份已变化，无法沿用判断');
      trigger=el.closest(CUSTOM)||el;
      if(!popupRoots(el,before).length){safeClick(el);await sleep(200);}
      const fresh=await waitControl(el,before,true);
      const sameOptions=fresh.entries.map(e=>e.label).sort().join('\u0000')===entries.map(e=>e.label).sort().join('\u0000');
      const matches=fresh.entries.filter(e=>e.label===selected.label);
      // Option indexes and node objects are snapshots. Rebind by exact label only
      // when the full option set is unchanged; otherwise ask Jev again.
      if(!sameOptions||matches.length!==1){lastSignature='';continue;}
      selected=matches[0];
      safeClick(selected.el);trail.push(selected.label);await sleep(300);
      el=resolveField(f,el);if(!el)throw new Error('选择后字段身份已变化，请检查');
      trigger=el.closest(CUSTOM)||el;
      const accepted=currentValue(el)||currentValue(trigger);
      if(accepted===selected.label){el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));el.blur?.();return;}
      if(!popupRoots(el,before).length){
        const actual=accepted;
        if(actual||selected.el.getAttribute('aria-selected')==='true')return;
        throw new Error('选项已点击，但未能确认控件保留了值');
      }
      const selectedState=selected.el.getAttribute('aria-selected')==='true'||selected.el.className?.toString().match(/selected|checked/);
      if(selectedState&&!selected.el.getAttribute('aria-expanded')&&!selected.el.querySelector('.ant-cascader-menu-item-expand-icon,.atsx-cascader-menu-item-expand-icon,.el-cascader-node__postfix,[class*="sd-Cascader-icon-"]')){
        el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
        if(currentValue(el)||currentValue(trigger))return;
      }
    }
    throw new Error('控件达到尝试上限，需手动检查');
  }
  async function fillElementDate(el,f,value){
    await message('control-metadata').catch(()=>{});
    assertUserUntouched();
    const root=el.closest('.el-date-editor');
    const format=root.getAttribute('data-resume-date-format')||f.format;
    const monthly=/^yyyy[-/]MM$/i.test(format)||root.classList.contains('el-date-editor--month');
    const yearly=/^yyyy$/i.test(format)||root.classList.contains('el-date-editor--year');
    let target=String(value);
    if(monthly&&/^\d{4}-\d{2}(?:-\d{2})?$/.test(target))target=target.slice(0,7);
    if(yearly&&/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(target))target=target.slice(0,4);
    if(!monthly&&!yearly)target=dateWithDefaultDay(target,f);
    const required=yearly?'YYYY':monthly?'YYYY-MM':'YYYY-MM-DD';
    const valid=yearly?/^\d{4}$/.test(target):monthly?/^\d{4}-(0[1-9]|1[0-2])$/.test(target):/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(target);
    if(!valid)throw Object.assign(new Error('此日期控件需要 '+required+'，资料日期精度不足；未补造月或日'),{review:true});
    if(format.includes('/'))target=target.replace(/-/g,'/');
    if(el.readOnly)throw Object.assign(new Error('此日期输入框只读，需要通过日历手动选择'),{review:true});
    // Element UI opens its picker on focus, not HTMLElement.click().
    // The extension popup can own window focus, suppressing the native focus
    // event. Deliver that same DOM event so closing the picker emits change.
    const focusDate=()=>{el.focus();if(!document.hasFocus())el.dispatchEvent(new FocusEvent('focus'));};
    if(document.activeElement===el)el.blur();focusDate();
    await sleep(160);assertUserUntouched();
    const entries=[{el,label:'日期输入框 / Date input ('+required+'): '+target}];
    chosen(entries,await choose({...f,format:required},target,entries,{date_format:required,operation:'enter verified date and confirm',source_date:String(value),month_only_default_day:f.date_default_day===1?1:null}));
    if(root.hasAttribute('data-resume-date-needs-commit')&&currentValue(el)===target){
      // A stale draft can contain the desired date but have missed the site's
      // change serializer. Recommit the Jev-approved date through the widget's
      // own clear/input sequence; never directly alter Vue state or API data.
      saveSnapshot(el);root.dispatchEvent(new MouseEvent('mouseenter'));
      await sleep(100);assertUserUntouched();
      const clear=root.querySelector('.el-icon-circle-close');
      if(!clear||!visible(clear))throw Object.assign(new Error('日期尚未完成网站格式确认，未找到安全的重新确认入口'),{review:true});
      safeClick(clear);await sleep(120);assertUserUntouched();
      if(currentValue(el))throw new Error('日期控件未响应重新确认操作');
      el.blur();focusDate();await sleep(120);assertUserUntouched();
    }
    saveSnapshot(el);nativeSet(el,target,false);
    // Commit typed input and let Vue propagate the new picker value before
    // closing it. Closing in the input tick suppresses Element's change event,
    // so site handlers (e.g. datetime serialization) never receive the date.
    el.dispatchEvent(new Event('change',{bubbles:true}));
    await sleep(120);assertUserUntouched();
    el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    await sleep(180);assertUserUntouched();
    el.blur();await sleep(120);assertUserUntouched();
    // Async form validators and Vue re-renders can outlast the input tick.
    for(let i=0;i<15;i++){
      assertUserUntouched();const current=resolveField(f,el);
      if(current&&currentValue(current)===target&&!current.closest('.el-form-item')?.querySelector('.el-form-item__error'))return;
      await sleep(100);
    }
    throw new Error('日期组件未接受目标日期，请检查网页提示');
  }
  async function fillFeishuPeriod(el,f,value){
    if(value!=='Present'&&!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(value)))throw Object.assign(new Error('资料缺少此端点的完整年月，未填入日期控件'),{review:true});
    if(value==='Present'&&f.date_endpoint!=='end')throw Object.assign(new Error('至今只能用于结束时间'),{review:true});
    saveSnapshot(el);
    for(const part of value==='Present'?['year']:['year','month']){
      el=resolveField(f,el);if(!el)throw new Error('日期所属经历已变化');
      // rc-trigger dismisses other pickers on mousedown, not click. A failed
      // earlier date can otherwise leave a second portal visible indefinitely.
      assertUserUntouched();
      el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,composed:true,button:0}));
      safeClick(el);await sleep(180);
      const panels=queryAll('.atsx-date-picker-period-month-panel').filter(visible);
      if(panels.length!==1)throw new Error('未能唯一定位飞书日期面板');
      const lists=[...panels[0].querySelectorAll('.atsx-date-picker-period-month-panel-list')];
      const list=lists[part==='year'?0:1];
      const entries=[...(list?.querySelectorAll('.atsx-date-picker-period-month-panel-list-item')||[])].filter(e=>visible(e)&&!e.className.includes('disabled')).map(e=>({el:e,label:part+' / '+(part==='year'?'年':'月')+': '+text(e)}));
      if(!entries.length)throw new Error('飞书日期面板没有可识别的'+part+'选项');
      const result=await choose(f,value,entries,{calendar_part:part,date_endpoint:f.date_endpoint});
      const selected=chosen(entries,result);
      // React may repaint the menu while Jev runs. Only an unchanged list can be rebound.
      const currentPanels=queryAll('.atsx-date-picker-period-month-panel').filter(visible);
      const currentList=currentPanels.length===1?currentPanels[0].querySelectorAll('.atsx-date-picker-period-month-panel-list')[part==='year'?0:1]:null;
      const fresh=[...(currentList?.querySelectorAll('.atsx-date-picker-period-month-panel-list-item')||[])].filter(e=>visible(e)&&!e.className.includes('disabled')).map(e=>({el:e,label:part+' / '+(part==='year'?'年':'月')+': '+text(e)}));
      const matching=fresh.filter(e=>e.label===selected.label);
      if(fresh.map(e=>e.label).join('|')!==entries.map(e=>e.label).join('|')||matching.length!==1)throw new Error('日期选项已改变，请重试');
      matching[0].el.scrollIntoView({block:'nearest'});safeClick(matching[0].el);await sleep(160);
    }
    el=resolveField(f,el);if(!el)throw new Error('日期控件已重建');
    el.closest('.atsx-date-picker').querySelector('.atsx-date-picker-period-hidden-input')?.blur();
    await sleep(180);
    if(currentValue(el)!==String(value))throw new Error('飞书日期控件未保留目标年月，请检查');
  }
  function dateWithDefaultDay(value,f){
    value=String(value);
    return f.date_default_day===1&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)?value+'-01':value;
  }
  function formatValue(value,el,f) {
    value=String(value);
    if(el.type==='date'||/^yyyy[-/.]mm[-/.]dd$/i.test(f.format))value=dateWithDefaultDay(value,f);
    if(el.type==='month')return /^\d{4}-\d{2}/.test(value)?value.slice(0,7):value;
    if(el.type==='date'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Object.assign(new Error('资料缺少所需年月日或日期补全规则'),{review:true});
      return value;
    }
    if(el.type==='number'&&!/^-?\d+(\.\d+)?$/.test(value))throw new Error('该字段需要纯数字，现有候选格式不符');
    if(el.maxLength>0&&value.length>el.maxLength)throw new Error('内容超过字段字数上限');
    if(/yyyy\/mm/i.test(f.format))value=value.replace(/-/g,'/');
    if(/yyyy\.mm/i.test(f.format))value=value.replace(/-/g,'.');
    return value;
  }
  async function apply(decision) {
    assertRunBudget();
    const f=descriptors.get(decision.id);
    if(!f)return;
    f.answer_context=decision.context||[];
    f.date_default_day=decision.date_default_day===1?1:null;
    const el=resolveField(f,elements.get(decision.id));
    if(cancelled)return;
    // Local guard also rejects stale bridge decisions; never assign FileList.
    if(f.type==='file'||decision.status==='file'){
      attempted.add(f.fingerprint);
      if(el&&currentValue(el))addReport(f,'preserved','已有附件由你管理，保持原样');
      else addReport(f,f.required===false?'skip':'review','所有附件由你手动上传（照片、作品集、附件简历等）',{issue_kind:'manual_attachment'});
      return;
    }
    if(!['fill','file'].includes(decision.status)){attempted.add(f.fingerprint);addReport(f,decision.status==='skip'?'skip':'review',decision.reason||'需检查',{issue_kind:decision.issue_kind});return;}
    if(!el?.isConnected){attempted.add(f.fingerprint);addReport(f,'error','字段身份已变化，请重试待处理');return;}
    attempted.add(f.fingerprint);
    if(blocked(el,f)){addReport(f,'skip',blocked(el,f));return;}
    const approved=authorizedWrite?.fingerprint===f.fingerprint&&authorizedWrite.revision===userEditRevision&&currentValue(el)===authorizedWrite.from;
    if(!approved&&(wasUserEdited(el,f)||((!settings.overwrite||f.user_draft)&&fieldValue(el)))){addReport(f,'preserved','判断期间你已修改或填入此字段，已保留');return;}
    try {
      writeContext={f,el};
      currentField=f.label;updatePanel('正在填写：'+f.label);
      if(f.type==='select'||f.type==='select-multiple')await fillSelect(el,f,decision.value);
      else if(f.type==='radio'||f.type==='checkbox')await fillCheck(el,f,decision.value);
      else if(f.type==='custom')await fillCustom(el,f,decision.value);
      else {
        const value=formatValue(decision.value,el,f);saveSnapshot(el);nativeSet(el,value);await sleep(120);
        const current=resolveField(f,el);
        if(!current||currentValue(current)!==value)throw new Error('页面未接受输入值');
        if(current.validity&&!current.validity.valid)throw new Error(current.validationMessage||'字段校验未通过');
      }
      if(cancelled)return;
      assertUserUntouched();
      successful.set(f.fingerprint,true);mark(el,decision.review);
      controlFailures=0;
      if(decision._learning&&decision._job_id){
        try{const learned=await message('learn',{id:decision._job_id,decision_id:decision.id});if(learned?.saved)decision.reason=(decision.reason||'已填写')+'；已回填 profile 扩展资料库';}
        catch{decision.reason=(decision.reason||'已填写')+'；profile 回填暂未成功';}
      }
      addReport(f,decision.review?'review':'filled',decision.local_only?'已从本地填写；未发送模型':decision.status==='file'?'已交给网页上传控件，上传结果请核对':decision.reason||'已填写', {filled:true,confidence:decision.confidence});
    } catch(e){
      if(f.pending_company_query!=null&&!e.preserved&&!wasUserEdited(el,f)&&snapshots.get(el)?.value===''&&currentValue(el)===f.pending_company_query){
        nativeSet(el,'',false);el.blur();
      }
      if(e.jobFailure||e.handoff){attempted.delete(f.fingerprint);throw e;}
      if(!cancelled){
        if(!e.preserved)mark(el,true);addReport(f,e.preserved?'preserved':e.review?'review':'error',e.message,{issue_kind:e.issue_kind});
        if(!e.preserved&&!e.review&&['custom','select','select-multiple','radio','checkbox'].includes(f.type)&&++controlFailures>=3)handoffReason='连续3个控件操作失败，自动处理已暂停；建议手动完成这些控件';
      }
    } finally {delete f.pending_company_query;writeContext=null;currentField='';updatePanel();}
  }
  async function expandRecords() {
    if(!settings.expandRecords)return;
    // Native disclosure elements are reversible and do not submit forms.
    for(const detail of queryAll('details'))if(visible(detail)&&detail.querySelector(FIELD_SELECTOR))detail.open=true;
    const handled=new Set();
    const buttons=queryAll('button,[role="button"],a,'+FEISHU_ADD).filter(b=>visible(b)&&(b.matches(FEISHU_ADD)||/^(\+\s*)?(添加|新增|增加|add)\s*(教育|工作|实习|项目|校园|education|work|experience|project)/i.test(text(b))||(/^添加\s*\/\s*Add$/i.test(text(b))&&b.closest('[class*="apply-block-"]')))&&!UNSAFE.test(text(b)));
    for(const button of buttons){
      if(cancelled)return;
      const container=button.closest(FEISHU_SECTION)||button.closest('[data-resume-section],section,.resume-section,.form-section,.ant-card,[class*="apply-block-"]')||button.parentElement;
      if(handled.has(container))continue;handled.add(container);
      const records=()=>[...container.querySelectorAll(RECORD)].filter(visible);
      if(!records().length&&!container.matches('.createFormSection-repeatable')){addReport({label:text(button)},'review','发现新增经历按钮，但无法可靠计数，需手动展开');continue;}
      const projectRows=container.matches(FEISHU_SECTION)&&/^项目经历$/.test(section(button))?records():[];
      const captureProject=row=>({hint:recordInfo(row.querySelector(FIELD_SELECTOR)).record_hint,
        fields:[...row.querySelectorAll(FIELD_SELECTOR)].filter(e=>visible(e)&&e.type!=='file').map(e=>({label:label(e),type:e.type||e.getAttribute('role')||'',value:currentValue(e)}))});
      const projectBackup=projectRows.map(captureProject),revision=userEditRevision;
      const plan=await job({mode:'section',control:{label:text(button),section:section(button),visible_records:records().length,
        ...(projectRows.length?{project_records:projectBackup.map(r=>({hint:[r.hint,...r.fields.filter(f=>/描述|职责|角色|起止|开始|结束|description|role|start|end/i.test(f.label)).map(f=>f.label+'='+f.value.slice(0,500))].join('; ').slice(0,1800)}))}:{})},page:pageContext()});
      if(plan.status!=='expand')continue;
      if(plan.cleanup_review)addReport({label:'项目范围',section:'项目经历'},'review',plan.cleanup_review);
      if(plan.cleanup_authorized===true&&Array.isArray(plan.remove_project_indices)&&plan.remove_project_indices.length&&projectRows.length){
        const indices=[...new Set(plan.remove_project_indices)].sort((a,b)=>b-a);
        if(indices.some(i=>!Number.isInteger(i)||i<0||i>=projectRows.length)||projectRows.length-indices.length<4)throw new Error('项目清理计划不完整，已停止');
        const unchanged=()=>revision===userEditRevision&&JSON.stringify(records().map(captureProject))===JSON.stringify(expected);
        let expected=projectBackup.slice();
        if(!unchanged())throw new Error('项目判断期间页面内容发生变化，保留当前内容');
        const backup=await message('project-backup',{backup:{url:location.href,created_at:new Date().toISOString(),records:projectBackup}});
        if(!backup?.saved)throw new Error('项目草稿备份未确认，未清理');
        for(const index of indices){
          if(cancelled)return;
          if(!unchanged())throw new Error('项目清理期间页面内容发生变化，已停止');
          const row=records()[index],remove=[...row.querySelectorAll('.formOperate-remove')].filter(visible);
          if(remove.length!==1)throw new Error('未能唯一定位本条项目的移除控件，已停止');
          // Exact page authorization + Jev identity + durable backup. No generic delete actions.
          remove[0].click();await sleep(250);
          expected.splice(index,1);
          if(!unchanged())throw new Error('项目移除结果与预期不一致，已停止；本机备份已保留');
          // Removing a backed-up row also removes its fields from this page's
          // progress. The initial scan may already have counted preserved values.
          const liveKeys=new Set(scan(true).map(f=>f.fingerprint));
          for(const key of knownFields)if(!liveKeys.has(key))knownFields.delete(key);
          report=report.filter(item=>!item.field_key||liveKeys.has(item.field_key));
        }
        addReport({label:'项目范围',section:'项目经历'},'skip',`已备份并移除 ${indices.length} 条未达到当前 JD 高匹配条件的历史项目，保留 ${records().length} 条`);
      }
      const desired=Math.min(plan.desired_count,12);
      for(let i=records().length;i<desired;i++){
        const before=records().length;
        const active=container.matches(FEISHU_SECTION)?[...container.querySelectorAll(FEISHU_ADD)].find(visible):button;
        if(!active)break;
        safeClick(active);await sleep(300);
        if(records().length<=before){addReport({label:text(button)},'review','新增条目未出现，停止添加');break;}
      }
    }
  }
  function module51Title(root){return text(root.querySelector('.resume-module-header .title'));}
  function module51Rows(root){return [...root.querySelectorAll('.field-list-box')].filter(row=>row.querySelector('.buttons-box'));}
  function module51Hint(row){
    const facts=[...row.querySelectorAll('.field-item')].map(item=>{
      const key=text(item.querySelector('.field-item-label'));
      return /学校|公司|单位|部门|社团|组织|职务|职位|项目名称|竞赛名称|比赛名称|奖项|获奖名称|开始|结束|时间|school|company|project|competition|organization|department|role/i.test(key)?key+'='+text(item).slice(key.length).trim():'';
    }).filter(Boolean);
    return facts.join('; ').slice(0,500)||'网页已有记录，尚未识别学校、公司或项目身份';
  }
  function open51Forms(){return queryAll('.resume-content .resume-module form.basic-wrapper').filter(visible);}
  function register51Drafts(root){
    const rows=module51Rows(root),forms=[...root.querySelectorAll('form.basic-wrapper')].filter(visible);
    let added=0;
    for(const form of forms){
      const sibling=form.parentElement.previousElementSibling;
      const row=sibling?.matches('.field-list-box')?sibling:null;
      const multiple=rows.length>0||form.parentElement.matches('.common-item')&&form.parentElement.parentElement===root||[...root.querySelectorAll('.resume-module-header .custom-button')].some(b=>text(b)==='添加');
      const hint=[...form.querySelectorAll('input,textarea')].filter(e=>/学校名称|公司名称|单位名称|部门|社团|组织|职务|职位|项目名称|竞赛名称|比赛名称|奖项|获奖名称|开始时间|结束时间|school name|company name|project name|competition|organization|department|role/i.test(label(e))).map(e=>currentValue(e)?label(e)+'='+currentValue(e):'').filter(Boolean).join('; ');
      editorRecords.set(form,{record_index:multiple?(row?rows.indexOf(row):rows.length+added++):null,record_hint:hint||(row?module51Hint(row):''),user_draft:true,draft_only:true});
    }
  }
  async function fill51Drafts(){
    draftMode=true;
    // A section save re-renders the whole resume. Fill open drafts in place,
    // including drafts opened during analysis, without saving or cancelling them.
    for(let pass=0;pass<20&&!cancelled;pass++){
      const forms=open51Forms().filter(f=>!MANUAL_SECTION.test(module51Title(f.closest('.resume-module'))));
      const before=attempted.size;
      for(const root of new Set(forms.map(f=>f.closest('.resume-module'))))register51Drafts(root);
      for(const form of forms){
        if(!form.isConnected||!visible(form))continue;
        const root=form.closest('.resume-module');
        updatePanel('补填已展开栏目：'+module51Title(root));
        await process51Form(root,form,editorRecords.get(form));
      }
      const current=open51Forms();
      if(attempted.size===before&&current.every(f=>forms.includes(f)||MANUAL_SECTION.test(module51Title(f.closest('.resume-module')))))break;
    }
    editorScope=null;editorRecordsContext=[];
  }
  let draftQueue=null,draftQueueRevision=0,restoringDrafts=false,draftQueuePaused=false;
  function checkpointRecordSaved(record){
    const roots=queryAll('.resume-content .resume-module').filter(root=>module51Title(root)===record.section);
    if(roots.length!==1)return false;
    const root=roots[0],rows=module51Rows(root),row=record.record_index==null?(rows.length===1?rows[0]:root):rows[record.record_index];
    if(!row||!visible(row)||open51Forms().some(form=>queue51MatchesForm(form,record)))return false;
    const preview=[...row.querySelectorAll('.field-item')].map(el=>{const key=text(el.querySelector('.field-item-label'));return {label:key,value:text(el).slice(key.length).trim()};});
    const populated=record.fields.filter(f=>f.value);
    return populated.length>0&&populated.every(field=>{
      const matches=preview.filter(p=>p.label===field.label);
      const expected=field.type==='file'?field.upload_label:field.display_value;
      return !!expected&&matches.length===1&&matches[0].value.replace(/\s/g,'')===String(expected).replace(/\s/g,'');
    });
  }
  function checkpointStillOnPage(backup){
    return backup.phase==='checkpoint'&&backup.records.every(record=>{
      const matches=open51Forms().filter(form=>queue51MatchesForm(form,record));
      if(matches.length!==1)return false;
      const form=matches[0],previous=form.parentElement.previousElementSibling;
      if(record.existing&&(!previous?.matches('.field-list-box')||module51Hint(previous)!==record.record_hint))return false;
      const fields=draft51Fields(form);
      return fields.length===record.fields.length&&record.fields.every(saved=>fields.filter(({f})=>f.label===saved.label&&f.type===saved.type).length===1);
    });
  }
  async function checkpoint51Drafts(){
    if(!is51job()||draftQueue)return;
    const forms=open51Forms().filter(form=>!MANUAL_SECTION.test(module51Title(form.closest('.resume-module'))));
    if(!forms.length)return;
    const revision=userEditRevision;
    for(const form of forms)register51Drafts(form.closest('.resume-module'));
    const records=await Promise.all(forms.map(form=>capture51Draft(form,{allowCommitOnly:true})));
    if(revision!==userEditRevision||forms.some(form=>!form.isConnected))throw new Error('备份期间页面发生变化，请重试备份');
    const result=await message('draft-backup',{action:'write',backup:{schema:1,url:location.href,phase:'checkpoint',records}});
    if(!result?.saved)throw new Error('未确认草稿本机备份');
  }
  async function recover51Drafts(){
    if(running)return;ensurePanel();running=true;cancelled=false;
    try{
      const stored=await message('draft-backup',{action:'read'});
      if(!stored?.backup){updatePanel('本页没有待恢复的本机草稿');return;}
      draftQueue=stored.backup;draftQueueRevision=userEditRevision;
      const uncertain=draftQueue.phase==='saving'||draftQueue.phase==='uncertain';
      const records=draftQueue.records;
      try{
        if(uncertain)draftQueue.records=records.slice(1);
        await restore51Queue();
      }finally{draftQueue.records=records;}
      if(draftQueue.partialRecovery){await persist51Queue();updatePanel('文本草稿已恢复，原附件需重新选择；备份仍保留。');return;}
      if(uncertain){
        draftQueue.phase='uncertain';await persist51Queue();
        updatePanel('其余草稿已恢复。上次保存的“'+records[0].section+'”结果未确认，请核对；原备份仍保留。');
      }else{
        await message('draft-backup',{action:'clear'});draftQueue=null;draftQueuePaused=false;
        updatePanel('本机草稿已恢复到页面，检查后可重试继续填写。');
      }
    }catch(e){draftQueuePaused=true;updatePanel('恢复未完成：'+e.message);}
    finally{running=false;writeContext=null;updatePanel();}
  }
  async function persist51Queue(){
    const response=await message('draft-backup',{action:'write',backup:draftQueue});
    if(!response?.saved)throw new Error('未确认本机草稿备份，未自动保存');
  }
  function draft51Fields(form){
    const scope=editorScope;editorScope=form;
    try{return scan(true).map(f=>({f,el:elements.get(f.id)}));}finally{editorScope=scope;}
  }
  async function fileHash(file){
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function capture51Draft(form,options={}){
    const root=form.closest('.resume-module'),info=editorRecords.get(form),fields=draft51Fields(form),seen=new Set();
    if(!fields.length||!info)throw new Error('草稿身份尚不明确，未自动保存');
    const snapshot=await Promise.all(fields.map(async ({f,el})=>{
      const key=f.label+'|'+f.type;
      if(seen.has(key)||blocked(el,f)&&currentValue(el)&&!options.allowCommitOnly||!['text','textarea','date','month','select','custom','file'].includes(f.type)||f.type==='custom'&&!el.closest('.el-select,.el-autocomplete,.el-date-editor'))throw new Error('草稿含暂不能完整恢复的字段，已保留页面内容');
      if(el.closest('.el-select')?.querySelectorAll('.el-select__tags-text').length>1)throw new Error('多选草稿含多个已有选项，暂不自动保存以免丢失选项');
      seen.add(key);
      let attachment={};
      if(f.type==='file'&&currentValue(el)){
        if(!options.allowOpaqueFiles&&!options.allowCommitOnly)throw new Error('附件由本人手动上传，无法自动恢复；保留当前草稿');
        const uploadLabel=el.files?.[0]?.name||text(el.closest(WRAPPER)?.querySelector('.show-file .file-data'));
        if(options.allowCommitOnly&&!uploadLabel)throw new Error('无法核对原附件名称，暂不自动保存');
        attachment={needs_reupload:true,upload_label:uploadLabel||text(el.closest(WRAPPER)||el.parentElement).slice(0,200)};
      }
      return {label:f.label,type:f.type,value:currentValue(el),display_value:f.type==='select'?text(el.selectedOptions[0]):currentValue(el),edited:wasUserEdited(el,f),protected:!!blocked(el,f),...attachment};
    }));
    const previous=form.parentElement.previousElementSibling;
    const existing=!!previous?.matches('.field-list-box');
    return {section:module51Title(root),record_index:info.record_index,existing,record_hint:existing?module51Hint(previous):info.record_hint,fields:snapshot,
      commit_only:snapshot.some(f=>f.needs_reupload||f.protected&&f.value)};
  }
  function queue51MatchesForm(form,record){
    const root=form.closest('.resume-module');
    if(module51Title(root)!==record.section)return false;
    register51Drafts(root);
    return editorRecords.get(form)?.record_index===record.record_index;
  }
  function queue51SafeToSave(){
    if(!draftQueue||draftQueue.phase!=='ready'||draftQueueRevision!==userEditRevision)return false;
    return open51Forms().every(form=>{
      const record=draftQueue.records.find(r=>queue51MatchesForm(form,r));if(!record)return false;
      const fields=draft51Fields(form);
      return fields.length===record.fields.length&&record.fields.every(saved=>{
        const matches=fields.filter(({f})=>f.label===saved.label&&f.type===saved.type);
        return matches.length===1&&currentValue(matches[0].el)===saved.value;
      });
    });
  }
  async function restore51Queue(){
    restoringDrafts=true;
    try{
      for(const record of draftQueue.records){
        if(cancelled||draftQueueRevision!==userEditRevision)throw new Error('恢复期间检测到停止或手动修改，剩余草稿保留在本机备份');
        const roots=queryAll('.resume-content .resume-module').filter(r=>module51Title(r)===record.section);
        if(roots.length!==1)throw new Error('草稿栏目发生变化，本机备份保留');
        const root=roots[0];let form=open51Forms().find(f=>queue51MatchesForm(f,record)),openedForRestore=false;
        if(!form){
          let button;
          if(record.existing){
            const row=module51Rows(root)[record.record_index];
            if(!row||module51Hint(row)!==record.record_hint)throw new Error('原记录身份变化，未跨经历恢复');
            button=[...row.querySelectorAll('.buttons-box .custom-button')].find(b=>text(b)==='编辑');
          }else{
            if(record.record_index!=null&&module51Rows(root).length!==record.record_index)throw new Error('新增草稿的条目位置已变化，未重复添加');
            button=[...root.querySelectorAll('.resume-module-header .custom-button')].find(b=>visible(b)&&/^(添加|编辑)$/.test(text(b)));
          }
          if(!await editor51Action(button,root,'open'))throw new Error('Jev 未确认恢复草稿的展开操作');
          form=await wait51Form(root);register51Drafts(root);openedForRestore=true;
        }
        const fields=draft51Fields(form);
        if(fields.length!==record.fields.length)throw new Error('恢复表单字段发生变化，本机备份保留');
        for(const saved of record.fields){
          const matches=fields.filter(({f})=>f.label===saved.label&&f.type===saved.type);
          if(matches.length!==1)throw new Error('无法唯一对应草稿字段，本机备份保留');
          const {f,el}=matches[0],current=currentValue(el);
          if(saved.protected&&current!==saved.value)throw new Error('声明或受保护字段已变化，未自动恢复');
          if(saved.type==='file'){
            // Includes pre-0.2.0 hash-backed checkpoints. Missing files need
            // manual selection; keep restoring the text and keep the backup.
            const mismatch=current&&saved.sha256&&(!el.files?.[0]||await fileHash(el.files[0])!==saved.sha256);
            if(current!==saved.value||mismatch){
              draftQueue.partialRecovery=true;
              addReport(f,'review',current?'当前附件由你管理，未覆盖；请核对原备份附件':'文本草稿已恢复；原附件请手动重新上传，备份仍保留',{issue_kind:'manual_attachment'});
            }
            continue;
          }
          if(current!==saved.value){
            // A freshly reopened, identity-verified saved row contains its old
            // baseline. Restore the exact checkpoint over that baseline only;
            // never overwrite differing values in a pre-existing live draft.
            if(current&&(!openedForRestore||el.closest('.el-select')?.querySelector('.el-select__tags'))||draftQueueRevision!==userEditRevision||!saved.edited&&wasUserEdited(el,f))throw new Error('恢复目标已有不同内容，未覆盖手动修改；本机备份保留');
            if(saved.value){
              // Restore the exact backed-up manual value, not a fresh profile answer.
              // A new trusted edit during the await reinstates these guards immediately.
              const oldNodeGuard=userEditedNodes.has(el),oldFieldGuard=userEditedFields.has(f.fingerprint);
              if(saved.edited){userEditedNodes.delete(el);userEditedFields.delete(f.fingerprint);}
              writeContext={f,el};
              try{
                if(f.type==='custom')await fillCustom(el,f,saved.value);
                else if(f.type==='select')await fillSelect(el,f,saved.display_value);
                else nativeSet(el,saved.value);
                await sleep(150);
                if(currentValue(el)!==saved.value)throw new Error('网页未保留恢复值，本机备份保留');
              }finally{writeContext=null;if(oldNodeGuard)userEditedNodes.add(el);if(oldFieldGuard)userEditedFields.add(f.fingerprint);}
            }
          }
          if(saved.edited){userEditedNodes.add(el);userEditedFields.add(f.fingerprint);}
        }
      }
    }finally{restoringDrafts=false;editorScope=null;editorRecordsContext=[];}
  }
  async function save51DraftQueue(){
    const revision=userEditRevision;
    await fill51Drafts();
    if(cancelled||revision!==userEditRevision||report.some(r=>r.status==='error'||r.status==='review'&&!r.filled))return;
    const forms=open51Forms();
    if(forms.length<2)return;
    let records;
    try{
      records=await Promise.all(forms.map(form=>capture51Draft(form,{allowCommitOnly:true})));
      if(revision!==userEditRevision)throw new Error("备份期间发生手动修改，未保存");
      if(records.filter(r=>r.commit_only).length>1)throw new Error('多个栏目含无法自动恢复的附件或本人声明，暂不保存以免丢失草稿');
      // Save the sole non-replayable draft first, in its current DOM. Only after
      // verifying its saved preview may another save reset the remaining drafts.
      records.sort((a,b)=>Number(!!b.commit_only)-Number(!!a.commit_only));
    }catch(e){addReport({label:'连续保存'},'review',e.message);return;}
    draftQueue={schema:1,url:location.href,phase:'ready',records};
    draftQueueRevision=userEditRevision;
    try{await persist51Queue();}catch(e){draftQueue=null;throw e;}
    draftMode=false;
    while(draftQueue.records.length&&!cancelled){
      const record=draftQueue.records[0];
      await restore51Queue();
      if(!queue51SafeToSave())throw new Error('草稿在备份后发生变化，未继续保存');
      const form=open51Forms().find(f=>queue51MatchesForm(f,record)),root=form.closest('.resume-module');
      const saved=await process51Form(root,form,{...editorRecords.get(form),user_draft:true,draft_only:false});
      if(!saved){
        if(draftQueue.phase==='ready'&&forms.every(f=>f.isConnected&&visible(f))){await message('draft-backup',{action:'clear'});draftQueue=null;draftMode=true;}
        else draftQueuePaused=true;
        return;
      }
      draftQueue.records.shift();draftQueue.phase='ready';await persist51Queue();
    }
    if(!draftQueue.records.length){await message('draft-backup',{action:'clear'});draftQueue=null;}
    else draftQueuePaused=true;
  }
  async function continue51Draft(){
    const forms=open51Forms();
    if(forms.length!==1)return false;
    const form=forms[0],root=form.closest('.resume-module'),title=module51Title(root);
    if(MANUAL_SECTION.test(title)||root.matches('.jobs-wrapper'))return false;
    register51Drafts(root);
    updatePanel('接续已展开栏目，填写后自动保存：'+title);
    return process51Form(root,form,{...editorRecords.get(form),draft_only:false});
  }
  function correctionField(f,rule){
    return rule.host===location.hostname&&rule.section===f.section&&f.record_hint?.includes(rule.identity)&&
      (rule.endpoint==='start'?/开始|入学|start/i:/结束|毕业|end/i).test(f.label);
  }
  function matchingCorrection(f,el,rule){
    return correctionField(f,rule)&&currentValue(el)===rule.from;
  }
  async function apply51AuthorizedDates(form){
    for(const rule of formSupport.corrections||[]){
      if(draft51Fields(form).some(({f,el})=>correctionField(f,rule)&&currentValue(el)===rule.to&&!el.closest('.el-date-editor')?.hasAttribute('data-resume-date-needs-commit'))){
        const ids=correctedForms.get(form)||new Set();ids.add(rule.id);correctedForms.set(form,ids);continue;
      }
      if(correctionAttempts.has(rule.id))continue;
      const matches=draft51Fields(form).filter(({f,el})=>matchingCorrection(f,el,rule)||correctionField(f,rule)&&currentValue(el)===rule.to&&el.closest('.el-date-editor')?.hasAttribute('data-resume-date-needs-commit'));
      if(matches.length!==1)continue;
      const {f,el}=matches[0],revision=userEditRevision,from=currentValue(el);
      const result=await job({mode:'fields',fields:[{...f,label:rule.field,record_index:null,record_hint:rule.identity}],page:pageContext()});
      const d=result.decisions?.find(d=>d.id===f.id);
      if(!d||d.status!=='fill'||d.confidence<settings.high||d.source!==rule.source||dateWithDefaultDay(d.value,{date_default_day:d.date_default_day})!==rule.to){addReport(f,'review','已授权纠错，但Jev未确认对应的profile日期');continue;}
      if(revision!==userEditRevision||currentValue(el)!==from){addReport(f,'preserved','纠错判断期间页面已有新修改，未覆盖');continue;}
      correctionAttempts.add(rule.id);
      authorizedWrite={fingerprint:f.fingerprint,revision,from};
      try{await apply(d);}finally{authorizedWrite=null;}
      if(currentValue(el)===rule.to){const ids=correctedForms.get(form)||new Set();ids.add(rule.id);correctedForms.set(form,ids);}
    }
  }
  async function open51CorrectionDrafts(){
    for(const rule of formSupport.corrections||[]){
      if(rule.host!==location.hostname||cancelled)continue;
      const roots=queryAll('.resume-content .resume-module').filter(r=>module51Title(r)===rule.section);
      if(roots.length!==1)continue;
      const root=roots[0];register51Drafts(root);
      // A reload may find the corrected draft open above its stale saved row.
      // Never click that hidden row again, or discard a newer manual date.
      const existing=open51Forms().find(form=>draft51Fields(form).some(({f})=>correctionField(f,rule)));
      if(existing){
        if(draft51Fields(existing).some(({f,el})=>correctionField(f,rule)&&currentValue(el)===rule.to)){
          const ids=correctedForms.get(existing)||new Set();ids.add(rule.id);correctedForms.set(existing,ids);
        }
        continue;
      }
      const rows=module51Rows(root).filter(r=>module51Hint(r).includes(rule.identity)&&module51Hint(r).includes(rule.from));
      if(rows.length!==1)continue;
      const button=[...rows[0].querySelectorAll('.buttons-box .custom-button')].find(b=>text(b)==='编辑');
      if(!button)continue;
      const originals=open51Forms(),revision=userEditRevision;
      if(originals.length){
        for(const f of originals)register51Drafts(f.closest('.resume-module'));
        const backup={schema:1,url:location.href,phase:'editing',records:await Promise.all(originals.map(f=>capture51Draft(f,{allowOpaqueFiles:true})))};
        const result=await message('draft-backup',{action:'write',backup});if(!result?.saved)throw new Error('纠错前未确认草稿备份');
      }
      if(revision!==userEditRevision)throw new Error('备份期间检测到手动修改，未展开纠错');
      if(!await editor51Action(button,root,'open',true,rule))continue;
      const form=await wait51Form(root);register51Drafts(root);
      if(form.querySelector('.el-date-editor'))await message('control-metadata');
      await apply51AuthorizedDates(form);
      if(originals.length&&originals.every(f=>f.isConnected&&visible(f)))await message('draft-backup',{action:'clear'});
    }
  }
  async function fill51MissingDrafts(){
    // Only Edit for incomplete single sections. Never Add, Save, Cancel or submit.
    const roots=queryAll('.resume-content .resume-module'),originalForms=open51Forms(),revision=userEditRevision;
    let backedUp=false;
    for(const root of roots){
      if(cancelled)return;
      const title=module51Title(root);
      if(!title||MANUAL_SECTION.test(title)||root.matches('.jobs-wrapper')||roots.filter(r=>module51Title(r)===title).length!==1)continue;
      if(module51Rows(root).length||[...root.querySelectorAll('form.basic-wrapper')].some(visible)||!text(root).includes('内容缺失，待补充'))continue;
      const button=[...root.querySelectorAll('.resume-module-header .custom-button')].find(b=>visible(b)&&text(b)==='编辑');
      if(!button)continue;
      if(revision!==userEditRevision){addReport({label:title},'review','检测到新的手动修改，未继续展开栏目');break;}
      // Opening a section can redirect to login if the session expired. Preserve
      // all pre-existing drafts before the first request which can navigate.
      if(!backedUp&&originalForms.length){
        for(const original of originalForms)register51Drafts(original.closest('.resume-module'));
        const backup={schema:1,url:location.href,phase:'editing',records:await Promise.all(originalForms.map(capture51Draft))};
        const result=await message('draft-backup',{action:'write',backup});
        if(!result?.saved)throw new Error('未确认原草稿备份，未展开其他栏目');
        backedUp=true;
        if(revision!==userEditRevision)throw new Error('备份期间检测到手动修改，未继续展开栏目');
      }
      updatePanel('仅补空白，展开未完成栏目：'+title);
      if(!await editor51Action(button,root,'open',true))continue;
      const form=await wait51Form(root);register51Drafts(root);
      await process51Form(root,form,{...editorRecords.get(form),user_draft:true,draft_only:true});
    }
    if(backedUp&&!cancelled&&originalForms.every(f=>f.isConnected&&visible(f)))await message('draft-backup',{action:'clear'});
    editorScope=null;editorRecordsContext=[];
  }
  async function editor51Action(button,root,kind,openDraftOnly=false,correction=null){
    if(!button||button.closest('.jobs-wrapper')||button.closest('.el-dialog__wrapper'))throw new Error('未找到安全的简历栏目操作入口');
    const label=text(button);
    if(!(kind==='open'?/^(编辑|添加)$/:/^保存$/).test(label))throw new Error('未识别的栏目操作已保留给本人');
    if(button.disabled||button.getAttribute('aria-disabled')==='true'||button.classList.contains('disabled')||button.classList.contains('is-disabled'))return false;
    const revision=userEditRevision;
    const result=await job({mode:'editor',control:{label,section:module51Title(root),kind,
      location:button.closest('.resume-module-header')?'section_header':button.closest('form.basic-wrapper')?'section_form':'saved_record',
      visible_records:module51Rows(root).length},page:pageContext()});
    if(result.status!=='operate'){
      addReport({label:module51Title(root)+' · '+label,section:module51Title(root)},'review',result.reason||'Jev 未确认此栏目操作',{confidence:result.confidence});
      return false;
    }
    if(kind==='save'&&((open51Forms().some(f=>!f.contains(button))&&!queue51SafeToSave())||revision!==userEditRevision)){
      addReport({label:module51Title(root),section:module51Title(root)},'review','发现其他展开草稿或新的手动修改，继续补填空白，暂不保存以免刷新丢失内容');return false;
    }
    if(kind==='open'&&open51Forms().length&&!restoringDrafts&&!(openDraftOnly&&label==='编辑'&&!draftQueue&&(settings.draftsOnly&&!module51Rows(root).length||correction&&formSupport.corrections.includes(correction)&&correction.host===location.hostname&&module51Title(root)===correction.section)))return false;
    if(settings.draftsOnly&&kind==='save')throw new Error('仅补空白模式不保存栏目');
    if(kind==='save'&&draftQueue){draftQueue.phase='saving';await persist51Queue();if(revision!==userEditRevision){draftQueue.phase='ready';await persist51Queue();return false;}}
    // 51job renders row Edit inside a hover-only toolbar; the public component
    // binds the same edit handler to the visible field-list-box itself.
    const row=kind==='open'&&label==='编辑'?button.closest('.field-list-box'):null;
    const target=!visible(button)&&row&&row.closest('.resume-module')===root&&visible(row)?row:button;
    safeClick(target);
    return true;
  }
  async function wait51Form(root){
    for(let i=0;i<80&&!cancelled;i++){
      const forms=[...root.querySelectorAll('form.basic-wrapper')].filter(visible);
      if(forms.length===1&&forms[0].querySelector(FIELD_SELECTOR))return forms[0];
      if(forms.length>1)throw new Error('同栏存在多个编辑草稿，请先保存或取消后重试');
      await sleep(100);
    }
    throw new Error(cancelled?'已停止':'栏目编辑表单未出现，可能仍在加载或网页禁止编辑');
  }
  async function process51Form(root,form,info){
    const formRevision=userEditRevision;
    const controls=[...form.querySelectorAll('input,textarea,select,[contenteditable="true"]')];
    const baseline=controls.map(el=>({el,value:el.value,checked:el.checked,text:el.isContentEditable?el.textContent:null,files:el.files?[...el.files]:null}));
    const unchanged=()=>{
      const current=[...form.querySelectorAll('input,textarea,select,[contenteditable="true"]')];
      return current.length===controls.length&&baseline.every((b,i)=>current[i]===b.el&&b.el.isConnected&&b.el.value===b.value&&b.el.checked===b.checked&&(!b.el.isContentEditable||b.el.textContent===b.text)&&(!b.files||b.el.files.length===b.files.length&&b.files.every((f,j)=>b.el.files[j]===f)));
    };
    const existingSavedRecord=Number.isInteger(info.record_index)&&!!module51Rows(root)[info.record_index];
    const savedRowCount=module51Rows(root).length;
    editorRecords.set(form,info);editorScope=form;
    if(form.querySelector('.el-date-editor'))await message('control-metadata').catch(()=>{});
    editorRecordsContext=module51Rows(root).map((row,index)=>({section:module51Title(root),record_index:index,record_hint:module51Hint(row)}));
    for(const draft of root.querySelectorAll('form.basic-wrapper')){
      const record=editorRecords.get(draft);if(visible(draft)&&record?.record_index!=null){
        editorRecordsContext=editorRecordsContext.filter(r=>r.record_index!==record.record_index);
        editorRecordsContext.push({section:module51Title(root),...record});
      }
    }
    const before=report.length;
    await apply51AuthorizedDates(form);
    for(let pass=0;pass<12&&!cancelled;pass++){
      const fields=scan();if(!fields.length)break;
      const files=fields.filter(f=>f.type==='file');
      await analyzeAndFill(files.length?files.slice(0,1):fields.slice(0,120));
      await sleep(200);
    }
    if(cancelled){editorPaused=true;return false;}
    if(info.draft_only){editorScope=null;editorRecordsContext=[];return true;}
    if(formRevision!==userEditRevision||(open51Forms().some(f=>f!==form)&&!queue51SafeToSave())){
      addReport({label:module51Title(root)},'review','填写期间发生手动修改或出现其他草稿，已保留；当前内容确认后重试即可继续自动保存');editorPaused=true;return false;
    }
    const needsReview=report.slice(before).some(item=>item.status==='error'||item.status==='review'&&!item.filled);
    const written=report.slice(before).some(item=>item.filled);
    const save=[...form.querySelectorAll('button.btn-save')].find(visible);
    if(!written&&!info.user_draft&&(!needsReview||existingSavedRecord)&&unchanged()){
      // An existing saved row with unfillable optional blanks must not block
      // later sections. Close only our untouched editor, never a user draft,
      // a new incomplete record, or a tentative control edit missing from reports.
      const cancel=[...form.querySelectorAll('button.btn-cancel')].find(b=>visible(b)&&text(b)==='取消');
      if(cancel)safeClick(cancel);else {editorPaused=true;return false;}
      for(let i=0;i<20&&form.isConnected&&visible(form);i++)await sleep(100);
      if(form.isConnected&&visible(form)){addReport({label:module51Title(root)},'review','未能收起未修改的已有记录；已保留页面');editorPaused=true;return false;}
      editorScope=null;editorRecordsContext=[];return true;
    }
    if(needsReview){
      addReport({label:module51Title(root)},'review','本条还有未填成功的项目，已保留草稿；补齐或重试成功后再自动保存');editorPaused=true;return false;
    }
    if(!written&&!info.user_draft&&!unchanged()){
      addReport({label:module51Title(root)},'review','控件内容已变化但未确认写入结果，保留当前编辑框');editorPaused=true;return false;
    }
    if(!save||save.disabled){addReport({label:module51Title(root)},'review','本栏已预填，但保存不可用；请补齐必填项或完成本人验证后继续');editorPaused=true;return false;}
    const expectedIdentity=[...form.querySelectorAll('input,textarea')].filter(e=>/学校名称|公司名称|单位名称|部门|社团|组织|职务|职位|项目名称|获奖名称|school name|company name|organization|role|position/i.test(label(e))).map(currentValue).filter(Boolean);
    const expectedFields=draft51Fields(form).filter(({f,el})=>!blocked(el,f)&&['text','textarea','date','month','select','custom'].includes(f.type)).map(({f,el})=>({label:f.label,value:f.type==='select'?text(el.selectedOptions[0]):currentValue(el)})).filter(f=>f.value);
    const commitRecord=draftQueue?.records.find(r=>queue51MatchesForm(form,r));
    updatePanel('正在保存简历栏目：'+module51Title(root));
    const warnings=[];
    // Some sites show a brief toast instead of form-item errors. Retain it for
    // the save result so failures do not collapse into an unexplained timeout.
    const observeWarnings=()=>{
      for(const el of queryAll('.el-message--error,.el-message--warning,.el-notification--error,.el-notification--warning,[role="alert"][class*="error"],[role="alert"][class*="warning"],.van-toast--fail')){
        const value=text(el);if(visible(el)&&value&&!warnings.includes(value))warnings.push(value.slice(0,250));
      }
    };
    const warningObserver=new MutationObserver(observeWarnings);
    warningObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
    setTimeout(()=>warningObserver.disconnect(),15000);
    if(!await editor51Action(save,root,'save')){editorPaused=true;return false;}
    for(let i=0;i<100&&!cancelled;i++){
      if(!form.isConnected||!visible(form)){
        sectionDraftSaved=true;snapshots.clear();mutations.length=0;
        panelRoot.getElementById('undo').disabled=true;
        panelRoot.querySelector('.foot').textContent='已保存的简历分栏需在网页中修改；最终投递和声明由你完成。';
        editorScope=null;editorRecordsContext=[];await sleep(450);
        const fresh=queryAll('.resume-content .resume-module').find(r=>module51Title(r)===module51Title(root));
        let row=null;
        if(fresh&&Number.isInteger(info.record_index)){
          const rows=module51Rows(fresh),norm=value=>String(value).replace(/\s/g,'');
          // The website reorders saved records by date. The previous array
          // index is not a persistent identity and can now name another row.
          let candidates=rows.filter(r=>visible(r)&&expectedIdentity.every(value=>norm(text(r)).includes(norm(value))));
          if(candidates.length>1||!expectedIdentity.length)candidates=candidates.filter(r=>{
            const values=[...r.querySelectorAll('.field-item')].map(item=>{const key=text(item.querySelector('.field-item-label'));return {label:key,value:text(item).slice(key.length).trim()};});
            return expectedFields.length>0&&expectedFields.every(field=>{
              const matches=values.filter(p=>p.label===field.label);
              return matches.length===1&&norm(matches[0].value)===norm(field.value);
            });
          });
          if(rows.length===savedRowCount+(existingSavedRecord?0:1)&&candidates.length===1)row=candidates[0];
        }
        if(!fresh||Number.isInteger(info.record_index)&&(!row||expectedIdentity.some(value=>!text(row).replace(/\s/g,'').includes(String(value).replace(/\s/g,''))))){
          addReport({label:module51Title(root)},'review','编辑框已关闭，但未能确认对应记录保存成功；已停止继续添加，请核对网页');editorPaused=true;return false;
        }
        const preview=[...(row||fresh).querySelectorAll('.field-item')].map(item=>{const key=text(item.querySelector('.field-item-label'));return {label:key,value:text(item).slice(key.length).trim()};});
        const differs=expectedFields.some(field=>{
          const matches=preview.filter(p=>p.label===field.label);
          return matches.length===1&&!matches[0].value.replace(/\s/g,'').includes(String(field.value).replace(/\s/g,''));
        });
        if(differs){addReport({label:module51Title(root)},'review','保存后展示值与草稿不一致，已停止后续保存，请核对；已有备份保留');editorPaused=true;return false;}
        if(commitRecord?.commit_only&&commitRecord.fields.some(field=>{
          if(!field.needs_reupload&&!field.protected)return false;
          if(!field.value)return false;
          const matches=preview.filter(p=>p.label===field.label);
          return matches.length!==1||!matches[0].value.includes(field.needs_reupload?field.upload_label:field.value);
        })){
          addReport({label:module51Title(root)},'review','未确认附件或本人已选声明保存到页面，未继续保存；其余草稿可从本机备份恢复');editorPaused=true;return false;
        }
        saved51Records.add(module51Title(fresh)+'|'+(row?module51Hint(row):'single'));
        for(const id of correctedForms.get(form)||[])await message('correction-complete',{id});
        return true;
      }
      const errors=[...form.querySelectorAll('.el-form-item__error')].filter(visible);
      if(errors.length){addReport({label:module51Title(root)},'review','本栏已预填但未保存：'+errors.map(text).join('；').slice(0,250));editorPaused=true;return false;}
      if(warnings.length){warningObserver.disconnect();addReport({label:module51Title(root)},'review','网站未保存：'+warnings.join('；'));editorPaused=true;return false;}
      await sleep(100);
    }
    if(!cancelled){
      await message('control-metadata').catch(()=>{});
      const diagnostics=form.getAttribute('data-resume-save-diagnostics');
      let detail='网页未提供保存状态';
      try{
        const state=JSON.parse(diagnostics||'{}'),response=state.saveResponses?.at(-1);
        if(response)detail=`网站保存返回 ${response.code??'无业务码'}（HTTP ${response.status}）：${response.message||'未提供错误说明'}`;
        else if(state.fieldStates?.length)detail='网页校验未结束：'+state.fieldStates.map(f=>f.label+' '+f.state).join('；');
        else if(state.requests?.length)detail='保存请求已发送，尚未确认页面保存结果';
      }catch{}
      addReport({label:module51Title(root)},'review',detail+'；已保留草稿，未继续新增。');
    }
    editorPaused=true;return false;
  }
  async function fill51jobEditors(){
    const roots=()=>queryAll('.resume-content .resume-module').filter(root=>!root.matches('.jobs-wrapper'));
    const titles=roots().map(module51Title);
    for(const title of titles){
      if(cancelled)return;
      if(open51Forms().length)return;
      if(!title||titles.filter(t=>t===title).length!==1){addReport({label:title||'简历栏目'},'review','栏目名称不唯一，未自动进入编辑');continue;}
      if(MANUAL_SECTION.test(title)){addReport({label:title,section:title},'skip','该栏目涉及声明、授权或岗位选择，留给本人确认；继续处理其他简历栏目');continue;}
      const root=()=>roots().find(r=>module51Title(r)===title);
      let current=root();if(!current)continue;
      const header=()=>[...root().querySelectorAll('.resume-module-header .custom-button')].find(b=>visible(b)&&/^(编辑|添加)$/.test(text(b)));
      current=root();const initialRows=module51Rows(current),button=header();
      const multiple=initialRows.length>0||text(button)==='添加';
      if(!multiple){
        if(saved51Records.has(title+'|single'))continue;
        // The site's basic card uses has-data only for a saved section whose
        // required fields are complete. Do not reopen it for optional blanks.
        if(current.matches('.basic-mod.has-data'))continue;
        if(!button)continue;
        updatePanel('正在展开：'+title);if(!await editor51Action(button,current,'open'))continue;
        const form=await wait51Form(current);
        if(!await process51Form(current,form,{record_index:null,record_hint:''}))return;
        continue;
      }
      const identities=initialRows.map(module51Hint);
      for(const hint of identities){
        if(saved51Records.has(title+'|'+hint))continue;
        current=root();const rows=module51Rows(current),matches=rows.filter(row=>module51Hint(row)===hint);
        if(matches.length!==1){addReport({label:title},'review','已有记录身份重复或变化，未跨记录填写');continue;}
        const row=matches[0],edit=[...row.querySelectorAll('.buttons-box .custom-button')].find(b=>text(b)==='编辑');
        if(!edit)continue;
        updatePanel('正在展开：'+title);if(!await editor51Action(edit,current,'open'))continue;
        if(!await process51Form(current,await wait51Form(current),{record_index:rows.indexOf(row),record_hint:hint}))return;
      }
      if(!settings.expandRecords)continue;
      current=root();let add=header();
      const plan=await job({mode:'section',control:{label:'添加',section:title,visible_records:module51Rows(current).length},page:pageContext()});
      if(plan.status!=='expand'){
        addReport({label:title+' · 添加',section:title},'review',plan.reason||'Jev 未确认此栏目应增加的经历类型',{confidence:plan.confidence});continue;
      }
      for(let count=module51Rows(current).length;count<Math.min(plan.desired_count,12);count++){
        current=root();add=header();
        if(!add||text(add)!=='添加'||add.disabled||add.getAttribute('aria-disabled')==='true'||add.classList.contains('disabled')||add.classList.contains('is-disabled')){
          addReport({label:title,section:title},'review',`已保存 ${count} 条，profile 共 ${plan.desired_count} 条；当前网页没有可用的添加入口，可能达到条数上限，剩余 ${plan.desired_count-count} 条未添加`);break;
        }
        updatePanel(`正在新增${title}第 ${count+1} / ${plan.desired_count} 条`);
        if(!await editor51Action(add,current,'open'))break;
        if(!await process51Form(current,await wait51Form(current),{record_index:count,record_hint:''}))return;
        if(module51Rows(root()).length<=count){addReport({label:title},'review','没有新增已保存记录，停止重复添加');return;}
      }
    }
  }
  async function analyzeAndFill(fields){
    // Uploads are local manual handoffs, never model jobs or remote file reads.
    for(const f of fields.filter(f=>f.type==='file'))await apply({id:f.id,status:'review'});
    fields=fields.filter(f=>f.type!=='file');
    if(!fields.length)return;
    const ready=[],received=new Set();let finished=false,failure=null;
    const add=decisions=>{for(const d of decisions){if(!received.has(d.id)){received.add(d.id);ready.push(d);}}readyCount=ready.length;updatePanel();};
    const records=[...new Map([...editorRecordsContext,...scan(true).filter(f=>f.record_index!==null)].map(f=>[[f.section,f.record_index].join('|'),{section:f.section,record_index:f.record_index,record_hint:f.record_hint}])).values()].slice(0,120);
    const analysis=job({mode:'fields',stream:true,fields,records,page:pageContext()},add)
      .then(result=>{if(result.paused)failure=new Error(result.error||'模型服务故障');})
      .catch(error=>{failure=error;}).finally(()=>{finished=true;});
    try{
      while((!finished||ready.length)&&!cancelled){
        if(ready.length){
          // Plain text and ready review results need no popup and cannot starve
          // behind a long calendar/combobox judgment.
          const index=ready.findIndex(d=>!['fill','file'].includes(d.status)||!['custom','select','select-multiple','radio','checkbox','file'].includes(descriptors.get(d.id)?.type));
          const [decision]=ready.splice(index<0?0:index,1);readyCount=ready.length;
          await apply(decision);queuedCount=Math.max(0,fields.length-received.size+ready.length);updatePanel();
        }else if(failure)break;
        else await sleep(100);
      }
      if(cancelled)await Promise.all([...activeJobs].map(id=>message('cancel-job',{id}).catch(()=>{})));
      await analysis;
      if(failure)throw failure;
    }finally{
      if(!finished)await Promise.all([...activeJobs].map(id=>message('cancel-job',{id}).catch(()=>{})));
      readyCount=0;
    }
  }
  async function start(config,retry=false) {
    ensurePanel();if(running)return;
    settings={high:.85,low:.60,overwrite:false,expandRecords:true,autoSaveOpenDrafts:true,maxRunSeconds:180,...config};
    settings.maxRunSeconds=Math.max(60,Math.min(600,Number(settings.maxRunSeconds)||180));
    handoffReason='';controlFailures=0;
    if(settings.draftsOnly){settings.autoSaveOpenDrafts=false;settings.overwrite=false;}
    if(retry){attempted=new Set([...successful.keys()]);report=[];}else{attempted.clear();report=[];}
    running=true;cancelled=false;let failure='';knownFields.clear();analysisState={};readyCount=0;currentField='';editorScope=null;editorRecordsContext=[];sectionDraftSaved=false;editorPaused=false;draftMode=false;startedAt=Date.now();finishedAt=0;
    saved51Records.clear();
    correctionAttempts.clear();
    if(ticker)clearInterval(ticker);ticker=setInterval(()=>{if(running){ensurePanel();updatePanel();}},1000);updatePanel('读取页面字段…');
    try{
      await loadPublicJobContext();
      if(cancelled)return;
      if(is51job()&&document.querySelector('.resume-content .resume-module')){
        const pending=await message('draft-backup',{action:'read'});
        if(pending?.backup?.records?.length){
          if(pending.backup.phase==='checkpoint')pending.backup.records=pending.backup.records.filter(record=>!checkpointRecordSaved(record));
          if(!pending.backup.records.length||checkpointStillOnPage(pending.backup))await message('draft-backup',{action:'clear'});
          else {draftQueue=pending.backup;draftQueuePaused=true;addReport({label:'本机草稿'},'review','发现本机草稿备份，请先点击“恢复草稿”；未开始新一轮保存');return;}
        }
        draftQueue=null;draftQueuePaused=false;
        formSupport=await message('form-support');
        await open51CorrectionDrafts();
        if(settings.draftsOnly){await fill51Drafts();await fill51MissingDrafts();}
        else {
        if(settings.autoSaveOpenDrafts&&open51Forms().length>1)await save51DraftQueue();
        else if(settings.autoSaveOpenDrafts&&open51Forms().length===1)await continue51Draft();
        if(!editorPaused&&!open51Forms().length)await fill51jobEditors();
        if(!cancelled&&open51Forms().length)await fill51Drafts();
        }
      }
      else {
      let expanded=false;
      for(let pass=0;pass<60&&!cancelled;pass++){
        if(document.querySelector('.el-date-editor:not([data-resume-date-format])'))await message('control-metadata').catch(()=>{});
        const fields=scan();
        queuedCount=fields.length;
        // Hand off file controls once, then continue the ordinary form fields.
        const uploads=fields.filter(f=>f.type==='file');
        if(!uploads.length&&!expanded){expanded=true;await expandRecords();continue;}
        if(!fields.length)break;
        const batch=uploads.length?uploads.slice(0,1):fields.slice(0,120);
        updatePanel(`已识别 ${knownFields.size} 项；分析结果就绪后逐项填写`);
        await analyzeAndFill(batch);
        queuedCount=Math.max(0,fields.length-batch.length);
        await sleep(250);
      }
      if(!cancelled){const remaining=scan();if(remaining.length)addReport({label:'动态新增字段'},'review',`仍有 ${remaining.length} 个新字段，点击“重试待处理”继续。`);}
      }
      if(!cancelled&&!knownFields.size)addReport({label:'页面字段识别'},'review','没有识别到可编辑字段。当前可能是展示页、表单尚未加载或存在未适配的编辑入口。可记录页面结构进行适配。');
      const inaccessible=queryAll('iframe').filter(el=>{try{return !el.contentDocument;}catch{return true;}});
      if(inaccessible.length&&window.top===window){
        const origins=[...new Set(inaccessible.map(el=>{try{return new URL(el.src,location.href).origin;}catch{return '未知域名';}}))];
        addReport({label:'嵌入页面'},'review','跨域 iframe 可能需要额外授权：'+origins.join('、'));
      }
    }catch(e){if(!cancelled){if(e.handoff){handoffReason=e.message;addReport({label:'人工接手'},'review',e.message,{issue_kind:'manual_confirmation'});}else{failure=e.message;addReport({label:'填写任务'},'error',e.message);}}}
    finally{
      if(!cancelled)try{await checkpoint51Drafts();}catch(e){addReport({label:'本机草稿备份'},'review',e.message);}
      recentRounds.push({written:report.filter(r=>r.filled||r.status==='filled').length});if(recentRounds.length>2)recentRounds.shift();
      running=false;finishedAt=Date.now();if(ticker){clearInterval(ticker);ticker=null;}currentField='';analysisState={};editorScope=null;editorRecordsContext=[];updatePanel(draftQueue?.records?.length?'连续保存暂停，'+draftQueue.records.length+'份草稿已在本机备份；可点击“恢复草稿”。':cancelled?'已停止。已填内容保留。':handoffReason?handoffReason:failure?'本轮因故障暂停，已填内容保留。请检查页面提示后重试。':draftMode?'已补填当前展开栏目的空白，草稿未保存；请检查后在网页保存。新展开内容可点击重试。':editorPaused?'当前栏目尚未保存，请检查网页提示后重试；已填草稿保留。':!knownFields.size?'未识别到可编辑字段，本轮未完成填写。':sectionDraftSaved?'本轮处理结束，已保存通过校验的简历分栏。请审阅后自行投递。':'自动处理结束。请按人工接手清单补齐并检查，之后自行提交。');
      if(reportTimer){clearTimeout(reportTimer);reportTimer=null;}
      await message('report',{report:reportSnapshot()}).catch(()=>{});
    }
  }
  function onMessage(message,sender,respond=()=>{}){
    if(message.kind==='autofill-ping'){respond({ok:true,version:VERSION,running});return;}
    if(message.kind==='start-'+VERSION){
      start(message.settings,message.retry).catch(error=>updatePanel('启动失败：'+error.message));
      respond({ok:running,version:VERSION,running,error:running?'':'页面填写任务未启动'});
    }
    if(message.kind==='recover-drafts-'+VERSION){settings={high:.85,low:.60,...message.settings};recover51Drafts().catch(error=>updatePanel(error.message));respond({ok:true,version:VERSION,running});return;}
    if(message.kind==='stop-'+VERSION){stop().catch(()=>{});respond({ok:true,version:VERSION});}
  }
  function dispose(){cancelled=true;if(ticker)clearInterval(ticker);if(reportTimer)clearTimeout(reportTimer);for(const type of ['input','change','pointerdown'])document.removeEventListener(type,onUserEdit,true);chrome.runtime.onMessage.removeListener?.(onMessage);panel?.remove();}
  for(const type of ['input','change','pointerdown'])document.addEventListener(type,onUserEdit,true);
  chrome.runtime.onMessage.addListener(onMessage);
  // Isolated-world object is exposed only for DOM fixture tests, never the page world.
  globalThis.__resumeAutofill={version:VERSION,start,scan,undo,recoverDrafts:recover51Drafts,getReport:()=>report,getRunning:()=>running,getSnapshot:reportSnapshot,getUserEdits:()=>[...userEditedFields],getRecentRounds:()=>recentRounds,stop,dispose};
})();
