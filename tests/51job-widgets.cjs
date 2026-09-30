// Open-source Element UI components mounted with fictitious data.
const {chromium,browserOptions}=require('./browser-runtime.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const script=path.resolve(__dirname,'../extension/content.js');
async function mount(p,scenario){
 await p.setContent('<meta charset="utf-8"><div id="app"></div>');
 await p.addScriptTag({path:require.resolve('vue/dist/vue.runtime.js')});
 await p.addScriptTag({path:require.resolve('element-ui/lib/index.js')});
 await p.evaluate(scenario=>{
  const {DatePicker,Select,Option,Form,FormItem}=window.ELEMENT;
  window.jobs=[];window.actual=null;window.choiceCalls=0;
  const target=scenario.startsWith('select')?'硕士':scenario==='year-only'?'2023':['date','validated-date'].includes(scenario)?'2023-06-30':'2023-06';
  window.fixture=new Vue({data:()=>({value:scenario==='select-multiple-existing'?['本科','博士']:scenario==='select-multiple'?[]:null}),render(h){
   const component=scenario.startsWith('select')?h(Select,{props:{value:this.value,placeholder:'请选择',multiple:scenario.startsWith('select-multiple')},on:{input:v=>{this.value=v;window.actual=v;}}},['本科','硕士','博士'].map(v=>h(Option,{props:{label:v,value:v}}))):h(DatePicker,{props:{value:this.value,type:scenario==='month'?'month':'date',format:scenario==='month'||scenario==='monthly-date'?'yyyy-MM':'yyyy-MM-dd',valueFormat:scenario==='month'||scenario==='monthly-date'?'yyyy-MM':'yyyy-MM-dd'},on:{input:v=>{this.value=v;window.actual=v;}}});
   return h('section',{'data-resume-section':'在校职务'},[h(Form,{ref:'form',props:{model:this.$data,rules:{value:[{required:true,message:'请选择日期',trigger:'change'}]}}},[h(FormItem,{props:{prop:'value',label:scenario.startsWith('select')?'学历':'结束时间'}},[component])])]);
  }}).$mount('#app');
  window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(m){
   if(m.kind==='create-job'){window.jobs.push(m.payload);return{ok:true,data:{job_id:String(window.jobs.length-1)}};}
   if(m.kind==='poll-job'){
    const j=window.jobs[+m.id];let result;
    if(j.mode==='fields')result={decisions:j.fields.map(f=>({id:f.id,status:'fill',value:target,confidence:1,date_default_day:['convention-date','year-only'].includes(scenario)?1:null}))};
    else if(j.mode==='options'){
     window.choiceCalls++;const option=j.options.find(o=>o.text===j.target||o.text.endsWith(': '+j.target));
     result=option?{status:'select',option_id:option.id,confidence:1}:{status:'review',reason:'Fixture found no matching control'};
    }
    return{ok:true,data:{status:'done',result}};
   }
   return{ok:true,data:{}};
  }}};
 },scenario);
 if(scenario==='validated-date'){
  await p.evaluate(()=>new Promise(resolve=>window.fixture.$refs.form.validate(()=>resolve())));
  await p.waitForSelector('.el-form-item__error');
 }
 await p.addScriptTag({path:path.resolve(__dirname,'../extension/control-metadata.js')});
 await p.addScriptTag({path:script});
}
module.exports={mount};
if(require.main===module)(async()=>{const b=await chromium.launch({headless:true,...browserOptions});try{
 for(const scenario of ['date','validated-date','month','monthly-date','missing-day','convention-date','year-only','select','select-multiple','select-multiple-existing']){
  const p=await b.newPage();await mount(p,scenario);
  await p.evaluate(()=>window.__resumeAutofill.start({expandRecords:false}));
  const out=await p.evaluate(()=>({actual:window.actual,calls:window.choiceCalls,report:window.__resumeAutofill.getReport(),format:document.querySelector('.el-date-editor')?.dataset.resumeDateFormat}));
  if(['missing-day','year-only'].includes(scenario)){
   assert.equal(out.actual,null);assert(out.report.some(r=>r.status==='review'&&r.reason.includes('精度不足')));assert.equal(out.calls,0);
  }else if(scenario==='select-multiple-existing'){
   assert.equal(out.actual,null);assert.equal(out.calls,0);assert(out.report.every(r=>r.status==='preserved'));
   assert.deepEqual(await p.evaluate(()=>window.fixture.value),['本科','博士']);
  }else{
   assert.deepEqual(out.actual,scenario==='select-multiple'?['硕士']:scenario.startsWith('select')?'硕士':scenario==='convention-date'?'2023-06-01':['date','validated-date'].includes(scenario)?'2023-06-30':'2023-06',JSON.stringify(out));
   assert(out.report.every(r=>r.filled),JSON.stringify(out));assert(out.calls>0);
  }
  console.log('PASS: actual 51job Element UI '+scenario+'; committed component value verified');await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
