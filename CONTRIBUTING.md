# 贡献指南

欢迎报告问题、改进控件适配、添加模型协议和完善文档。Fork 仓库，创建分支并通过 Pull Request 提交。普通 Issue 与 PR 已开放，不需要私有工作区、真实 profile 或 API key。

开发环境为 Python 3.9+ 和 Node.js 22+：

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run test:widgets
npm run audit
npm run package
```

`npm test` 覆盖 Python 逻辑、四种模型协议、skill 工具与隔离浏览器中的虚构表单；首次安装回归还覆盖安装 skill、配置 API、创建 profile、启动真实 bridge、配对恢复和首次填写。`test:widgets` 使用开发依赖中的 Vue 2 / Element UI 验证旧式控件，不读取外部下载的私有资源。Vue 2 / Element UI 仅用于测试 legacy 控件，生产扩展及 Python bridge 不加载这些依赖。CI 在 Ubuntu 上执行同样检查。

可用 `TEST_BROWSER_PATH` 选择本机 Edge / Chromium 可执行文件；不设置时使用 Playwright Chromium。可用 `TEST_HEADLESS=0` 启动可见的隔离测试窗口；Linux 有头模式使用 `xvfb-run -a npm test`。Chromium 扩展测试通过 CDP 在隔离 profile 中安装解压扩展；额外调试标志仅用于测试，不是日常安装要求。测试不连接真实岗位页面，不调用付费 API。

新增回归应复现实际问题，验证用户可观察行为，例如手改保护、记录身份、保存核验或协议响应解析。表单、姓名、邮箱、日期、经历和密钥均使用虚构资料。PR 说明问题触发条件、修改行为和验证结果；先跑相关测试，再运行完整检查。

公开前执行 `python3 -B scripts/audit_public.py --tracked`。个人专项检查可提供仓库外的本机 JSON 字符串数组：`--deny-file <私有文件路径>`，检查只输出文件名与类别，不输出匹配值。自动扫描只是检查的一部分，还需核对差异和包中文件。

教学 profile 只放在 `docs/examples/profile.synthetic.json`，内容必须完全虚构；真实资料始终放在被忽略的 `profile/`。发布检查会拒绝疑似真实手机号和证件号形态；需要测试数字脱敏时使用故意无效的全零数字。示例须通过 `skills/jev-profile/scripts/validate_profile.py` 校验，默认 `profile/profile.example.json` 保持 `{}`。历史版本与发布附件须单独检查，见 [隐私复核说明](docs/PRIVACY-REVIEW.md)。

不得提交 `.runtime/`、个人 `profile/`、`extension/local-config.js`、真实网页 HTML、日志、草稿或截图。打包脚本仅收集源码白名单；新增文件需要同时检查 Git 跟踪与打包规则。漏洞报告见 [SECURITY](SECURITY.md)。

## 发布安装包

维护者发布前统一 manifest、package 与锁文件版本，并准备 `docs/releases/v<版本>.md`。推送对应 `v<主版本>.<次版本>.<补丁>` 标签后，现有 CI 先执行全部检查；只有 `checks` 成功，`release` job 才获得本次所需的仓库内容写入权限，核对版本、逐文件验证 ZIP 与标签提交、生成 SHA-256 校验文件，并发布为最新正式版。普通分支和 PR 不会发布。

发布使用 GitHub Actions 临时 `GITHUB_TOKEN`，无需个人 PAT。上传失败时检查是否遗留草稿；不要覆盖已发布版本或移动旧标签，应先确认附件和目标提交，再处理草稿或发布新版本。
