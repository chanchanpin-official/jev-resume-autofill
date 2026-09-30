const $ = id => document.getElementById(id);
async function call(kind) {
  const result = await chrome.runtime.sendMessage({kind});
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function check() {
  try {
    const result = await call('health');
    $('connection').textContent = '已连接';
    $('status').textContent = `profile ${result.profile ? '可用' : '为空或未找到'} · Jev ${result.jev_configured ? '已配置' : '缺少密钥'} · 生成模型 ${result.generator_configured ? '已配置' : '未配置'} (${result.generator_protocol || 'unknown'})`;
    if(result.config_error) $('status').textContent = result.config_error;
  } catch (e) { $('connection').textContent = '未连接'; $('status').textContent = e.message + '\n请运行 start.command，随后在 edge://extensions 刷新此插件。'; }
}
(async () => {
  const {settings = {}} = await chrome.storage.local.get('settings');
  const config = {high: .85, low: .60, overwrite: false, expandRecords: true, autoSaveOpenDrafts: true, maxRunSeconds:180, ...globalThis.LOCAL_CONFIG, ...settings};
  for (const key of ['high','low','baseUrl','token','maxRunSeconds']) $(key).value = config[key] || '';
  for (const key of ['overwrite','expandRecords','autoSaveOpenDrafts']) $(key).checked = config[key];
  const {lastError} = await chrome.storage.session.get('lastError');
  if (lastError) $('status').textContent = lastError;
  await check();
})();
$('settings').addEventListener('submit', async e => {
  e.preventDefault();
  const high = Number($('high').value), low = Number($('low').value);
  if (!(0 <= low && low < high && high <= 1)) { $('saved').textContent = '需满足 0 ≤ 低阈值 < 高阈值 ≤ 1'; return; }
  await chrome.storage.local.set({settings: {high,low,maxRunSeconds:Math.max(60,Math.min(600,Number($('maxRunSeconds').value)||180)),baseUrl:$('baseUrl').value.replace(/\/$/,''),token:$('token').value,overwrite:$('overwrite').checked,expandRecords:$('expandRecords').checked,autoSaveOpenDrafts:$('autoSaveOpenDrafts').checked}});
  $('saved').textContent = '已保存'; await check();
});
$('test').onclick = check;
$('models').onclick = async () => { try { $('status').textContent = '正在读取 model list…'; const m = await call('models'); $('status').textContent = `${m.display_name} → ${m.model}`; } catch(e) { $('status').textContent = e.message; } };
$('grant').onclick = async () => {
  try { const origin = new URL($('frameOrigin').value).origin + '/*'; const ok = await chrome.permissions.request({origins:[origin]}); $('status').textContent = ok ? '已授权；回到申请页面重新点击插件。' : '未授权'; }
  catch(e) { $('status').textContent = e.message; }
};
