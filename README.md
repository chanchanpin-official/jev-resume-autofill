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

当前版本为 **v0.2.4**，包含首次初始化、自检、个人 API 实测、配对恢复及此前的表单修复。

- **[下载 v0.2.4 安装包 ZIP](https://github.com/chanchanpin-official/jev-resume-autofill/releases/download/v0.2.4/jev-resume-autofill-0.2.4.zip)**：包含浏览器扩展、本机 bridge、skill 和中文说明。
- [v0.2.4 发布说明与校验文件](https://github.com/chanchanpin-official/jev-resume-autofill/releases/tag/v0.2.4) · [始终查看最新正式版](https://github.com/chanchanpin-official/jev-resume-autofill/releases/latest)。

下载后先完整解压，保留整个目录；这不是双击安装的 `.crx` 文件，浏览器需要按下文加载其中的 `extension/` 子目录。本机服务会从同一目录读取配置与资料。安装新 skill 不会自动升级旧插件。开发者也可克隆仓库；`main` 后续可能包含尚未发布的改动。

## 从哪里获取 Jev 和 LLM API

1. **Jev / TypeSafe**：打开 [TypeSafe 官方 API 控制台](https://console.typesafe.ai/)，注册或登录自己的账号，按控制台提示创建 API key 并核对账户可用额度。获取入口见 [TypeSafe 官方快速开始](https://docs.typesafe.ai/introduction/quickstart)。本插件配置向导中的 Jev base URL 使用 `https://api.typesafe.ai/v1`，model 默认 `jev-latest`；不要填成控制台网址或完整的 `/systemone` 操作地址。
2. **生成模型 LLM**：另行向自己选择的供应商获取 API key、可用 model ID 和 base URL，并选择匹配协议。支持 OpenAI 兼容、Responses、Anthropic、Gemini；供应商示例及官方文档见 [API 配置参考](docs/API-CONFIGURATION.md#供应商设置示例)。聊天产品订阅本身不会替本插件提供 API 凭据或额度。
3. 在自己的交互终端运行 `python3 scripts/configure.py`，把两类 key 分别填入对应的不回显提示。密钥留在本机，不贴进聊天、Issue、命令参数或浏览器配对令牌框。填写完后按下文运行 `--probe-models`，确认自己的账号和模型实际可用；账号开通条件、价格与额度以供应商当前页面为准。

## 快速开始：从安装 skill 到首次填写

需要 Python 3.9+、桌面 Chrome / Edge、支持本地 skill 的 agent、自己的 Jev API key 和生成模型 API，以及本人的求职材料。运行插件不需要 Node.js；Node.js 只用于开发和测试。安装 skill 不附带模型账号或额度，也不会自动取得浏览器扩展权限。

1. 下载上方 **v0.2.4 安装包**，解压后进入 `jev-resume-autofill/`，确认其中有 `bridge/`、`extension/`、`scripts/doctor.py`。命令均在这个插件根目录执行；不要在 ZIP 内直接运行或只复制 `extension/`。也可克隆当前源码：

   ```sh
   git clone https://github.com/chanchanpin-official/jev-resume-autofill.git
   cd jev-resume-autofill
   ```

2. 安装 / 更新随仓库提供的 skill：

   ```sh
   python3 scripts/install_skill.py
   ```

   默认写入 Codex 当前支持的 `~/.agents/skills/jev-profile`；[官方安装位置说明](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。使用其他 agent 或已有自定义目录时，加 `--skills-dir "<其 skills 父目录>"`。安装器重复运行不会嵌套目录；更新前把旧副本备份到本插件的私有 `.runtime/skill-backups/`。检测到旧 `~/.codex/skills/jev-profile` 时会停止创建第二份副本，提示指定原目录更新或先整理旧安装。避免在新旧目录各留一份同名 skill。确认 agent 的 skill 列表中出现 `jev-profile`；未出现时重新打开会话。

3. 向 agent 提出完整初始化请求：

   > 使用 $jev-profile 初始化 Jev 简历填写插件。插件根目录是 `<完整插件路径>`，我的求职资料目录是 `<资料路径>`。引导我配置自己的 Jev 和 LLM API，从我的材料建立可追溯的 profile，并完成自检、服务配对和浏览器连接验收。缺失事实留空，各步骤按实际结果报告。

   skill 会串联以下工作：你在**自己的交互终端**运行 `python3 scripts/configure.py`，在不回显的提示中输入两类 API key，并选择 LLM 协议、base URL 和 model；agent 读取授权材料并建立 `profile/profile.json`、来源清单和 `profile/review-notes.md`。向导不接受聊天 / 命令行参数中的 key；必需字段缺失时不保存。使用已有环境变量 / `_FILE` 配置时可跳过向导，但须通过自检。参考 [API 配置](docs/API-CONFIGURATION.md)。

   核对姓名、联系方式、经历、日期和待确认项。默认 `{}` 不能填表；仓库的[虚构示例](docs/PROFILE-EXAMPLE.md)只教结构，不能作为自己的履历。

4. 在插件根目录检查本地资料和配置，再测试 API：

   ```sh
   python3 scripts/doctor.py
   python3 scripts/doctor.py --probe-models
   ```

   第一条完全不调用模型。第二条仅向你配置的 Jev / LLM 发送固定虚构内容，验证认证、模型和响应格式，**可能产生少量 API 费用，不发送个人 profile**。若暂不实测，可以停在“本地配置就绪”，不能将其当作 API 已可用。失败会返回非零退出码和修复方向；修改后再测。

5. 启动服务，保持终端打开：

   ```sh
   python3 -B bridge/server.py
   ```

   macOS 也可双击 `start.command`。在另一个终端进入同一插件根目录，运行 `python3 scripts/doctor.py --bridge`，确认配对、版本、profile 路径及实际服务配置一致。自定义端口时两处均加 `--port 17322`；自定义 profile 时两处均加 `--profile "<资料路径>"`。不要将其他目录中已运行的旧服务当成本目录的新服务。

6. 安装浏览器插件：把 `chrome://extensions`（Chrome）或 `edge://extensions`（Edge）粘贴到浏览器地址栏并打开，启用“开发者模式”，点击“加载已解压的扩展程序”，选择 **`jev-resume-autofill/extension/`**（里面应有 `manifest.json`），不是外层根目录或 ZIP 文件。同一路径已有安装时点击插件卡片的“重新加载”；换目录安装时确认加载的是新目录。

   从插件卡片的“详细信息 → 扩展选项”，或扩展图标菜单的“选项”打开设置页，点击“检查连接”，确认 profile、Jev、生成模型三项就绪。更换目录或令牌后若仍使用旧配对，先重载扩展，再点击“恢复本目录配对”。可将扩展固定到浏览器工具栏，便于打开填写弹窗。命令行检查不能代替此项浏览器验收；常见问题见下方说明。

完成后，手动登录招聘网站、选好岗位并打开申请表，点击插件 → **开始填写**。查看人工接手清单，审阅文字、手动上传附件和处理声明，最后自行提交。

Windows 中若 `python3` 不可用，用 `py -3` 替换；路径有空格时加引号。安装位置、每步成功标准及故障恢复见 [首次初始化与验收](skills/jev-profile/references/onboarding.md)，日常使用见 [使用参考](docs/USAGE.md)。

### 安装与升级常见问题

- **“找不到清单文件”**：先解压全部文件，选中含 `manifest.json` 的 `extension/` 目录。
- **设置页显示未连接**：确认同一份目录的 `bridge/server.py` 正在运行；重载扩展后再检查连接，必要时“恢复本目录配对”。API key 不等于配对令牌。
- **profile 为空或 API 未配置**：完成自己的 API 配置和真实 profile 创建，再运行 `python3 scripts/doctor.py`；安装包不会附带他人的资料或密钥。
- **从旧版升级**：先备份本机私有 `profile/` 和 `.runtime/config.json`。关闭旧 bridge，把新版完整解压到明确的目录，仅迁移自己的资料与 API 配置；不要复制旧 `extension/local-config.js` 或配对令牌。更新 skill、启动新 bridge 后重新加载对应扩展并检查连接。若旧扩展仍指向另一目录，停用旧副本，避免同时运行两份。

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

Python 后端只用标准库。测试使用虚构资料、本机 HTTP fixture 和隔离浏览器，不调用付费模型或操作真实申请。生产扩展不加载测试依赖。初始化链路的测试证据与实测边界见 [0.2.4 验收记录](docs/VALIDATION-0.2.4.md)。打包采用文件白名单，并执行公开信息检查；发布前还应对真实身份标识进行本地专项扫描。隐私检查范围见[隐私复核说明](docs/PRIVACY-REVIEW.md)。
