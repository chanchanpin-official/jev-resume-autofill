// Capture question labels for dependent prompts; never collect answer values.
const {chromium,browserOptions}=require('./browser-runtime.cjs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...browserOptions});
 try{
  const p=await browser.newPage();
  await p.setContent('<form><div class="el-form-item"><label>Other form</label><input value="PRIVATE OTHER"></div></form><form><div class="el-form-item"><label>Have AI or digital experience?</label><input value="PRIVATE ANSWER"></div><div class="el-form-item" style="display:none"><label>HIDDEN QUESTION</label><input></div><div class="el-form-item"><label>如果有的话，请描述该技能</label><textarea></textarea></div><div class="el-form-item"><label>Future question</label><input></div></form>');
  await p.evaluate(()=>window.chrome={runtime:{onMessage:{addListener(){}},async sendMessage(){return{ok:true,data:{}}}}});
  await p.addScriptTag({path:path.resolve(__dirname,'../extension/content.js')});
  const fields=await p.evaluate(()=>__resumeAutofill.scan(true));
  const followup=fields.find(f=>f.label.startsWith('如果'));
  assert.deepEqual(followup.preceding_labels,['Have AI or digital experience?']);
  assert(!JSON.stringify(fields).includes('PRIVATE'));
  console.log('PASS: dependent question includes preceding labels only, bounded to the same form and visible controls');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
