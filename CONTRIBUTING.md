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

`npm test` 覆盖 Python 逻辑、四种模型协议、skill 工具与隔离浏览器中的虚构表单。`test:widgets` 使用开发依赖中的 Vue 2 / Element UI 验证旧式控件，不读取外部下载的私有资源。Vue 2 / Element UI 仅用于测试 legacy 控件，生产扩展及 Python bridge 不加载这些依赖。CI 在 Ubuntu 上执行同样检查。

可用 `TEST_BROWSER_PATH` 选择本机 Edge / Chromium 可执行文件；不设置时使用 Playwright Chromium。可用 `TEST_HEADLESS=0` 启动可见的隔离测试窗口；Linux 有头模式使用 `xvfb-run -a npm test`，CI 使用此模式验证扩展重载。测试不连接真实岗位页面，不调用付费 API。

新增回归应复现实际问题，验证用户可观察行为，例如手改保护、记录身份、保存核验或协议响应解析。表单、姓名、邮箱、日期、经历和密钥均使用虚构资料。PR 说明问题触发条件、修改行为和验证结果；先跑相关测试，再运行完整检查。

公开前执行 `python3 -B scripts/audit_public.py --tracked`。个人专项检查可提供仓库外的本机 JSON 字符串数组：`--deny-file <私有文件路径>`，检查只输出文件名与类别，不输出匹配值。自动扫描只是检查的一部分，还需核对差异和包中文件。

不得提交 `.runtime/`、个人 `profile/`、`extension/local-config.js`、真实网页 HTML、日志、草稿或截图。打包脚本仅收集源码白名单；新增文件需要同时检查 Git 跟踪与打包规则。漏洞报告见 [SECURITY](SECURITY.md)。
