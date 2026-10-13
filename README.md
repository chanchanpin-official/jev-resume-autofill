# Jev Resume Autofill · 简历填空

用自己的求职资料填写招聘表单：**Jev 匹配事实与控件选项，你配置的生成模型组织有来源的文字回答，浏览器插件写入并核验。** 支持 Chrome / Edge，采用 Manifest V3。打开弹窗后点击“开始填写”才运行。

**适合在电脑浏览器中填写企业招聘官网 / ATS 的在线简历，覆盖实习、校园招聘和社会招聘的常见资料录入。** 使用者先选择岗位、登录并打开表单；插件辅助填写，最后由本人核对和投递。

默认 profile 为空。公开资料示例使用纯虚构身份；真实个人履历、API key、配对令牌和运行记录不进入仓库或安装包。通过随仓库提供的 `jev-profile` skill，在本机从自己的文档生成 profile，也可参照[虚构示例](docs/PROFILE-EXAMPLE.md)了解结构。

## 适用的投递范围

| 场景 | 适用程度与条件 |
| --- | --- |
| 实习 / 校园招聘网申 | 可辅助录入基本资料、教育、实习、项目、校园经历、奖项和有来源的文字回答；具体字段能否填写取决于控件适配和 profile 是否有可靠资料 |
| 社会招聘网申 | 可使用同一套流程填写工作经历、项目和自我介绍；任职性质、起止日期、薪资与求职意向等需要本人提供，缺失时不猜测 |
| 不同行业和岗位 | 不限于互联网、游戏或某一职业；按自己的 profile 和目标表单工作。行业或岗位适用不代表某家公司的页面已验收 |
| 中文 / 英文申请表 | 支持依据字段语言匹配资料及组织回答；英文专名和履历建议在 profile 中提供已核对版本。未知名称、资历和成绩不会自动成为事实 |
| BOSS 直聘 / 猎聘等站内聊天、邮件投递、微信小程序、手机 App | 不提供专用投递流程；通用网页控件可能可填，但没有对应平台的完整兼容承诺 |

**本项目处理“已打开的申请表填写”，不负责搜职位、判断报名资格、自动海投、代聊或最终提交。** 能填写网申不等于符合岗位的学历、应届身份、工作年限或地域条件。附件上传、验证码、声明 / 条款和最终投递均由本人完成。

### 招聘系统与页面适配

| 系统 / 控件 | 当前实现范围 | 仍可能需要人工处理 |
| --- | --- | --- |
| 51job / Element UI | 分栏编辑、文本 / 选择 / 日期、经历绑定、草稿备份及保存核验后新增 | 网站条数上限、保存校验失败、企业定制控件 |
| 飞书 ATSX | 重复经历、普通下拉、起止年月、已有附件识别 | 已有简历解析错误、缺少事实的字段、附件操作 |
| 北森 Phoenix | 栏目与记录识别、文本、单选、普通下拉 | 年月日历、复杂新增 / 保存流程、定制控件 |
| 部分 Ant 简历页面 | 外置字段标题、记录分组、下拉已选值与搜索区分、部分日期确认和空记录新增 | 无“至今”选项的必填结束日期、其他日期组件及定制布局 |
| 原生 HTML / 部分 ARIA / Moka 路径 | 通用文本和选择控件、部分栏目识别 | 未覆盖组件、跨域 iframe 授权、复杂多步流程 |

**这些是源码中的适配范围，不是招聘网站白名单，也不是整站兼容保证。** 同一招聘平台的不同企业、校招 / 社招入口可能使用不同页面。回归测试主要使用虚构表单和隔离浏览器；真实使用仍须逐项核对。完整边界见[支持范围与人工接手](docs/SUPPORT-AND-HANDOFF.md)。

## 版本与下载

当前源码版本为 **0.2.3**，包含 Ant 表单识别、日期确认、精确日期优先等修复。源码与 [Releases](https://github.com/chanchanpin-official/jev-resume-autofill/releases) 安装包分别更新；使用前核对发布页的版本号。需要当前源码功能时克隆仓库，或从 GitHub 的 Code → Download ZIP 下载源码。

## 快速开始

需要 Python 3.9+、Chrome 或 Edge，以及自己的 Jev API key 和生成模型 API。运行插件不需要 Node.js；Node.js 只用于开发和测试。

1. 下载 [Releases](https://github.com/chanchanpin-official/jev-resume-autofill/releases) 中所需版本的 ZIP 并解压，或克隆此仓库。进入包含 `bridge/`、`extension/`、`scripts/` 的插件根目录。
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

   核对生成的姓名、联系方式、经历、日期及 `profile/review-notes.md`。模板 `{}` 本身不能填写表单。也可以参照[虚构 profile 示例及修改步骤](docs/PROFILE-EXAMPLE.md)，按 [profile 格式参考](skills/jev-profile/references/profile-format.md) 手工建立自己的资料；不要将示例履历用于真实申请。

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
- 已实现上表所列的部分控件适配；不按作者的履历或求职偏好限制用户的行业、岗位或经历数量。可选的行业排除与项目选择仅在本人 profile 明确配置时生效，默认示例不启用这些规则。
- Jev 默认高阈值 0.85、上下文重判起点 0.60；默认单轮约 180 秒。置信度不等于正确率。

## 资料与隐私

`profile/profile.json` 是插件默认识别的路径，每个任务重新读取。可通过 `--profile <路径>` 或 `JEV_PROFILE_PATH` 指定其他位置。资料、来源清单、审阅说明与已核验补充答案均在被 Git 忽略的 `profile/` 中；该目录仅跟踪空 `profile.example.json`。文档目录另外提供一份明确标注为虚构的教学示例，启动时不会自动加载。

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

Python 后端只用标准库。测试使用虚构资料、本机 HTTP fixture 和隔离浏览器，不调用付费模型或操作真实申请。生产扩展不加载测试依赖。打包采用文件白名单，并执行公开信息检查；发布前还应对真实身份标识进行本地专项扫描。检查范围和本次结果见[隐私复核说明](docs/PRIVACY-REVIEW.md)。
