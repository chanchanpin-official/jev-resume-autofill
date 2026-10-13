// Fresh public install only: synthetic documents, loopback APIs, isolated browser.
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),net=require('node:net'),{spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile),ROOT=path.resolve(__dirname,'..');
const python=process.env.TEST_PYTHON||'python3';
const env={...process.env,PYTHONDONTWRITEBYTECODE:'1'};
for(const key of ['TYPESAFE_API_KEY','TYPESAFE_API_KEY_FILE','JEV_BASE_URL','JEV_MODEL','LLM_PROTOCOL','LLM_BASE_URL','LLM_MODEL','LLM_API_KEY','LLM_API_KEY_FILE','LLM_JSON_MODE','JEV_PROFILE_PATH'])delete env[key];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jev-onboarding-'));
 const plugin=path.join(temp,'plugin with spaces'),skills=path.join(temp,'agent skills'),documents=path.join(temp,'my documents');
 fs.mkdirSync(plugin);fs.mkdirSync(documents);
 for(const folder of ['bridge','extension','scripts','skills'])fs.cpSync(path.join(ROOT,folder),path.join(plugin,folder),{recursive:true,filter:p=>!['local-config.js','__pycache__','.DS_Store'].includes(path.basename(p))&&!p.endsWith('.pyc')});
 fs.mkdirSync(path.join(plugin,'profile'));fs.copyFileSync(path.join(ROOT,'profile/profile.example.json'),path.join(plugin,'profile/profile.example.json'));
 const run=async(args,expected=0)=>{
  try{const result=await execute(python,args,{cwd:plugin,env,timeout:60000});assert.equal(expected,0);return result.stdout;}
  catch(error){if(error.code===expected)return error.stdout;throw error;}
 };
 let bridge,context,bridgeLog='';const calls=[];
 const fixture='<!doctype html><meta charset="utf-8"><form><label for="name">Full name</label><input id="name"><label><input id="consent" type="checkbox">I agree to the privacy terms</label><button type="submit">Submit</button></form><script>window.submits=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();submits++}</script>';
 const api=http.createServer(async(req,res)=>{
  if(req.url==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
  if(req.method!=='POST'){res.statusCode=404;return res.end();}
  let text='';for await(const chunk of req)text+=chunk;
  const body=JSON.parse(text||'{}');calls.push({url:req.url,body});
  if(req.headers.authorization!==(req.url.endsWith('/systemone')?'Bearer fixture-jev-key':'Bearer fixture-llm-key')){res.statusCode=401;return res.end('{}');}
  let response;
  if(req.url.endsWith('/systemone')){
   const answers={};for(const [key,q] of Object.entries(body.questions)){
    if(q.type==='choice'){
     const options=q.criteria||{};
     const selected=['ready','personal','person_name_en'].find(id=>Object.hasOwn(options,id))||'none';
     answers[key]={choice:selected,confidence:1};
    }else answers[key]={noul:0};
   }
   response={answers};
  }else response={choices:[{message:{content:JSON.stringify({text:'READY',source_ids:['setup_fact'],missing_facts:[]})},finish_reason:'stop'}]};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(response));
 });
 try{
  await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
  const apiBase='http://127.0.0.1:'+api.address().port;
  const installed=await run(['scripts/install_skill.py','--skills-dir',skills]);
  assert(installed.includes('jev-profile'));
  const skill=path.join(skills,'jev-profile');
  assert(fs.readFileSync(path.join(skill,'SKILL.md'),'utf8').includes('references/onboarding.md'));
  assert(fs.existsSync(path.join(skill,'references/onboarding.md')));
  let status=JSON.parse(await run(['scripts/doctor.py','--json'],1));
  assert(!status.ok);assert.equal(calls.length,0);
  await run(['-c',`import importlib.util,sys
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('wizard','scripts/configure.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with patch('sys.stdin.isatty',return_value=True), patch.object(m,'ask',side_effect=[sys.argv[1],'fixture-jev','openai-chat',sys.argv[1],'fixture-model','on']), patch.object(m.getpass,'getpass',side_effect=['fixture-jev-key','fixture-llm-key']):
 m.main()
`,apiBase+'/v1']);
  fs.writeFileSync(path.join(documents,'resume.txt'),'Synthetic Applicant');
  const profile=path.join(plugin,'profile/profile.json'),inventory=path.join(plugin,'profile/source-inventory.json');
  await run([path.join(skill,'scripts/inventory.py'),documents,'--output',inventory]);
  const listed=JSON.parse(fs.readFileSync(inventory,'utf8'));assert.equal(listed.documents.length,1);
  // Deterministic extraction of this one-line synthetic input exercises the installed skill's output contract.
  fs.writeFileSync(profile,JSON.stringify({person:{name_en:fs.readFileSync(path.join(documents,listed.documents[0].path),'utf8')},source_metadata:{'person.name_en':{file:'resume.txt'}}}),{mode:0o600});
  await run([path.join(skill,'scripts/validate_profile.py'),profile,'--require-facts']);
  status=JSON.parse(await run(['scripts/doctor.py','--probe-models','--json']));
  assert(status.ok&&status.models_probed);assert.equal(calls.length,2);
  assert(!JSON.stringify(calls).includes('Synthetic Applicant'),'Setup probes must not upload the applicant profile');
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  bridge=spawn(python,['-B','bridge/server.py','--port',String(port)],{cwd:plugin,env,stdio:['ignore','pipe','pipe']});
  bridge.stdout.on('data',data=>bridgeLog+=data);bridge.stderr.on('data',data=>bridgeLog+=data);
  for(let i=0;i<100&&!bridgeLog.includes('Resume Autofill bridge:');i++){assert.equal(bridge.exitCode,null,bridgeLog);await pause(100);}
  assert(bridgeLog.includes('Resume Autofill bridge:'),bridgeLog);
  status=JSON.parse(await run(['scripts/doctor.py','--bridge','--port',String(port),'--json']));
  assert(status.ok);
  const local=fs.readFileSync(path.join(plugin,'extension/local-config.js'),'utf8');
  assert(!local.includes('fixture-jev-key'));assert(!local.includes('fixture-llm-key'));
  const cdpLoader=!process.env.TEST_BROWSER_PATH||process.env.TEST_EXTENSION_LOADER==='cdp';
  const extension=path.join(plugin,'extension');
  context=await chromium.launchPersistentContext(path.join(temp,'browser'),{headless:true,...browserOptions,ignoreDefaultArgs:['--disable-extensions'],args:cdpLoader?['--enable-unsafe-extension-debugging']:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  if(cdpLoader){
   const manager=await context.newPage();await manager.goto('chrome://extensions/');
   const toggle=manager.locator('#devMode');if(!await toggle.evaluate(el=>el.checked))await toggle.click();await manager.close();
   const session=await context.browser().newBrowserCDPSession();await session.send('Extensions.loadUnpacked',{path:extension});await session.detach();
  }
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:20000});
  const id=new URL(worker.url()).host,options=await context.newPage();
  await options.goto('chrome-extension://'+id+'/options.html');
  await options.waitForFunction(()=>document.querySelector('#connection').textContent==='已连接');
  assert((await options.locator('#status').innerText()).includes('profile 可用'));
  await worker.evaluate(async()=>{await chrome.storage.local.set({settings:{high:.91,baseUrl:'http://127.0.0.1:1',token:'stale-pairing'}});});
  await options.reload();await options.waitForFunction(()=>document.querySelector('#connection').textContent==='未连接');
  await options.locator('#resetPairing').click();await options.waitForFunction(()=>document.querySelector('#connection').textContent==='已连接');
  const saved=await worker.evaluate(async()=> (await chrome.storage.local.get('settings')).settings);
  assert.equal(saved.high,.91);assert(!Object.hasOwn(saved,'token'));assert(!Object.hasOwn(saved,'baseUrl'));
  const page=await context.newPage();await page.goto(apiBase+'/fixture');
  await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);await startTab(tab);},apiBase+'/fixture');
  await page.waitForFunction(()=>document.querySelector('#name').value==='Synthetic Applicant',null,{timeout:20000});
  assert.equal(await page.isChecked('#consent'),false);assert.equal(await page.evaluate(()=>submits),0);
  console.log('PASS fresh installation: installed skill, user API wizard, source inventory, profile validation, both synthetic API probes, real bridge pairing, extension recovery and real bridge-to-form fill; no submission.');
 }finally{
  if(context)await context.close();
  if(bridge&&bridge.exitCode===null){bridge.kill('SIGINT');await Promise.race([new Promise(resolve=>bridge.once('exit',resolve)),pause(5000)]);if(bridge.exitCode===null)bridge.kill('SIGKILL');}
  await new Promise(resolve=>api.close(resolve));
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
