# API 配置参考

在用户自己的交互终端运行 `python3 scripts/configure.py` 完成配置；不要在聊天中发送密钥或通过管道 / 命令参数传入。配置只存于 `.runtime/config.json`，不会进入扩展或发布包。必需密钥 / model / 协议不完整时不保存，原文件保持不变。更换 API 地址或协议时不会复用旧 key，必须提供新凭据；loopback 无鉴权 LLM 除外。变更后重启 bridge；网页未保存时不要刷新申请页面。

所有参数也支持环境变量；同名环境变量优先于文件配置。向导发现相关变量会列出变量名并停止，避免用户修改文件后实际仍使用旧环境。若选择环境配置，直接运行 doctor；若改用文件配置，先在当前终端取消这些变量，再运行向导和服务。不要输出变量值，也不要盲目删除全局 shell 配置。密钥可以用 `TYPESAFE_API_KEY_FILE`、`LLM_API_KEY_FILE` 指向本机文件，直接密钥优先于 `_FILE`。不要把密钥写到 shell 命令历史、仓库、Issue 或浏览器设置中。

| 参数 | 默认 / 用法 |
| --- | --- |
| `TYPESAFE_API_KEY` | 你的 Jev key；必需 |
| `JEV_BASE_URL` | `https://api.typesafe.ai/v1`，包含版本路径 |
| `JEV_MODEL` | `jev-latest` |
| `LLM_PROTOCOL` | `openai-chat`；也支持 `openai-responses`、`anthropic`、`gemini` |
| `LLM_BASE_URL` | 按协议默认 OpenAI `/v1`、Anthropic `/v1` 或 Gemini `/v1beta`；兼容服务需自行修改 |
| `LLM_MODEL` | 无默认；填写供应商提供的可用 model ID |
| `LLM_API_KEY` | 云 API 必需；本机 loopback 无鉴权服务可为空 |
| `LLM_JSON_MODE` | `on`；兼容接口不支持 JSON 参数时改为 `off`，仍须返回有效 JSON |
| `JEV_PROFILE_PATH` | 默认 `<插件目录>/profile/profile.json`；`--profile` 参数优先 |

base URL 不填写 `/chat/completions` 等最终操作路径，也不要带 key、查询参数或片段。公网连接要求 HTTPS，本机模型允许 `http://127.0.0.1:<端口>/v1`、`localhost` 或 `[::1]`。请求不会跟随重定向，以免凭据被转发；网关应直接返回响应。

## 供应商设置示例

以下是协议/base URL 示例，不固定模型版本。模型 ID 与账户权限以供应商控制台为准。

| 服务 | 协议 | base URL |
| --- | --- | --- |
| OpenAI Chat Completions | `openai-chat` | `https://api.openai.com/v1` |
| OpenAI Responses | `openai-responses` | `https://api.openai.com/v1` |
| DeepSeek | `openai-chat` | `https://api.deepseek.com/v1` |
| 百炼兼容模式 | `openai-chat` | `https://dashscope.aliyuncs.com/compatible-mode/v1`，区域端点按控制台调整 |
| OpenRouter | `openai-chat` | `https://openrouter.ai/api/v1` |
| Anthropic | `anthropic` | `https://api.anthropic.com/v1` |
| Gemini | `gemini` | `https://generativelanguage.googleapis.com/v1beta` |
| 本机兼容服务 | `openai-chat` | `http://127.0.0.1:<端口>/v1` |

Chat / Responses 使用 Bearer；Messages 使用 `x-api-key` 和 `anthropic-version: 2023-06-01`；Gemini 使用 `x-goog-api-key` 请求头，密钥不进入 URL。返回内容解析为同一候选对象：`text`、`source_ids`、`missing_facts`，然后由 Jev 核对事实依据。

设置页的“查看生成模型元数据”只查询模型元数据，不发送 profile 或执行付费生成。部分兼容服务不实现模型列表，或列表不包含别名；检测失败不等同于生成接口不可用，应核对供应商说明。认证、权限、限流和网络故障会暂停填写；错误信息不会回显供应商正文或密钥。

参考协议：[TypeSafe API](https://docs.typesafe.ai/api)、[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[OpenAI Responses](https://platform.openai.com/docs/api-reference/responses)、[Anthropic Messages](https://docs.anthropic.com/en/api/messages)、[Gemini generateContent](https://ai.google.dev/api/generate-content)。


## 完成标准与实际调用验证

Jev 使用用户自己的 TypeSafe 服务凭据；LLM 使用所选供应商提供的 API key 和可用 model ID。两者职责不同，不能仅填写一个 LLM key 代替 Jev。可从 [TypeSafe 官方文档](https://docs.typesafe.ai/api) 和对应供应商控制台了解账号、API key 与额度。不要把聊天产品订阅当作插件可直接使用的 API 配置。

```sh
python3 scripts/doctor.py
python3 scripts/doctor.py --probe-models
```

默认 doctor 只做本地检查，不联网、不填写网页；需 Python、有效 Jev 配置、有效 LLM 配置及非空且格式正确的 profile。`--probe-models` 分别调用 Jev 和当前生成协议，发送固定的虚构校验词，检查真实响应和 JSON / 来源格式，不读取 profile 的事实作为请求内容。调用可能产生少量费用；不愿调用时保持“未实测”状态。结果不含 key、供应商原始响应或个人资料。

状态不是可互换的：“已保存”表示文件写入，“本地通过”表示字段完整，“API 实测通过”表示这一次调用成功，“浏览器已连接”表示扩展配对成功。启动服务后运行 `python3 scripts/doctor.py --bridge`，确认当前终端与服务实际读取的 API 配置一致，再在扩展设置页完成连接验收。

401 / 403 检查凭据和权限；429 检查额度 / 限流；404 检查基础地址、协议与 model；JSON 校验失败核对协议及 JSON mode。模型列表缺失不应直接判定无法调用，以 `--probe-models` 的实际调用为准。
