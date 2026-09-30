# Jev Resume Autofill · 简历填空

用自己的求职资料填写招聘表单：**Jev 匹配事实与控件选项，你配置的生成模型组织有来源的文字回答，浏览器插件写入并核验。** 支持 Chrome / Edge，采用 Manifest V3。打开弹窗后点击“开始填写”才运行。

默认 profile 为空。仓库和安装包不包含个人履历、API key、配对令牌或运行记录。通过随仓库提供的 `jev-profile` skill，在本机从指定工作区的文档生成自己的 profile。

## 快速开始

需要 Python 3.9+、Chrome 或 Edge，以及自己的 Jev API key 和生成模型 API。运行插件不需要 Node.js；Node.js 只用于开发和测试。

1. 下载 [Releases](../../releases) 中的 ZIP 并解压，或克隆此仓库。进入解压后的 `jev-resume-autofill` 根目录。
2. 在终端配置自己的 API。密钥输入不显示，只存入本机 `.runtime/config.json`：

   ```sh
   python3 scripts/configure.py
   ```

   选择生成协议，输入 base URL（含 `/v1` 等版本路径）、model ID 和 API key。Jev 使用 [TypeSafe System One API](https://docs.typesafe.ai/api)，默认 `jev-latest`，可修改 base URL 与 model。常见供应商和本机模型的设置见 [API 配置参考](docs/API-CONFIGURATION.md)。

3. 将 `skills/jev-profile` 安装到你的 agent 的 skills 目录。例如 Codex：

   ```sh
   mkdir -p ~/.codex/skills
   cp -R skills/jev-profile ~/.codex/skills/
   ```

   已有同名 skill 时更新其文件；安装后重新打开 agent 会话。向 agent 提出：

   > 使用 $jev-profile，阅读资料工作区 `<我的求职资料目录>` 中的全部相关文档，在插件根目录 `<插件目录>` 生成 profile/profile.json。记录来源、冲突和缺失信息，未知事实留空。

   核对生成的姓名、联系方式、经历、日期及 `profile/review-notes.md`。模板 `{}` 本身不能填写表单。可以用 [profile 格式参考](skills/jev-profile/references/profile-format.md) 手工建立资料。

4. 启动本机服务并保持终端打开：

   ```sh
   python3 -B bridge/server.py
   ```

   macOS 也可双击 `start.command`。启动会创建空 profile（若不存在）、本机配对令牌和 `extension/local-config.js`；不会自动读取其他工作区的个人资料。

5. 在 `chrome://extensions` 或 `edge://extensions` 打开开发者模式，点击“加载已解压的扩展程序”，选择 `extension` 目录。先启动服务，再加载扩展；已加载过的扩展点击“重新加载”。设置页点击“检查连接”，确认 profile、Jev 和生成模型已配置。
6. 手动登录招聘网站、选择岗位、打开申请表；点插件 → **开始填写**。完成后查看人工接手清单，核对文字、手动上传附件和确认声明，最后自行提交。

Windows 中若 `python3` 不可用，用 `py -3` 替换；路径有空格时加引号。详细的重试、草稿和排障操作见 [使用参考](docs/USAGE.md)。

## 支持的生成 API 协议

| 配置值 | 请求接口 | 适用接口 |
| --- | --- | --- |
| `openai-chat` | `/chat/completions` | OpenAI Chat Completions、DeepSeek、百炼、OpenRouter、其他兼容服务或本机模型 |
| `openai-responses` | `/responses` | OpenAI Responses 或实现该协议的网关 |
| `anthropic` | `/messages` | Anthropic Messages 或实现该协议的网关 |
| `gemini` | `/models/{model}:generateContent` | Google Gemini 原生 API |

协议兼容不代表每个供应商、网关或模型都完成了实测。JSON 模式可关闭以适应部分兼容接口；响应仍需是有效 JSON，之后仍由 Jev 核对来源。Azure 特有 deployment URL、AWS Bedrock 签名和 Vertex OAuth 暂未实现。

## 行为与支持范围

- 默认保留网页已有值和手动修改，包括主动清空。生成的文字标记为需要审阅。
- 事实、日期、网址和控件选项由现有资料匹配；缺资料时留空，生成模型不补造事实。
- 附件全部手动上传；密码、验证码、声明、条款、最终投递由本人处理。证件默认手填；高级本地私有值不会发送模型。
- 已实现 51job / Element UI、飞书 ATSX、北森 Phoenix 的部分控件适配；企业定制页面仍可能需要人工接手。详见 [支持范围](docs/SUPPORT-AND-HANDOFF.md)。
- Jev 默认高阈值 0.85、上下文重判起点 0.60；默认单轮约 180 秒。置信度不等于正确率。

## 资料与隐私

`profile/profile.json` 是插件默认识别的路径，每个任务重新读取。可通过 `--profile <路径>` 或 `JEV_PROFILE_PATH` 指定其他位置。资料、来源清单、审阅说明与已核验补充答案均在被 Git 忽略的 `profile/` 中；仓库仅跟踪空 `profile.example.json`。

API key 保存在本机 bridge，扩展只持有配对令牌。bridge 监听 `127.0.0.1`，校验 token、Host 和 Origin。填写时相关候选资料、字段及岗位上下文会发送到你配置的 Jev / 生成模型服务；使用这些 API 前应认可该服务的数据处理方式。profile 生成由你的 agent 执行，也遵循该 agent 的数据处理设置。

草稿备份可能包含表单值，保存于浏览器扩展的本地存储；诊断结构也可能包含标签、链接或页面上下文。不要把 `.runtime/`、`profile/`、`local-config.js`、浏览器存储、真实表单或运行截图上传到 Issue。问题报告使用虚构最小复现。

## 开发与贡献

欢迎 Issue 和 Pull Request，项目采用 [MIT License](LICENSE)。开发说明及贡献流程见 [CONTRIBUTING](CONTRIBUTING.md)，模块说明见 [架构](docs/ARCHITECTURE.md)。

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run test:widgets
npm run audit
npm run package
```

Python 后端只用标准库。测试使用虚构资料、本机 HTTP fixture 和隔离浏览器，不调用付费模型或操作真实申请。生产扩展不加载测试依赖。打包采用文件白名单，并执行公开信息检查；发布前还应对真实身份标识进行本地专项扫描。
