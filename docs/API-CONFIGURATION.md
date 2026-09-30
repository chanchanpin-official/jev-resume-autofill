# API 配置参考

运行 `python3 scripts/configure.py` 完成交互配置。配置只存于 `.runtime/config.json`，不会进入扩展或发布包。更换 API 地址或协议且没有输入新 key 时，会清除旧 key，避免把原供应商密钥发送到新地址。变更后重启 bridge；网页未保存时不要刷新申请页面。

所有参数也支持环境变量；同名环境变量优先于文件配置。密钥可以用 `TYPESAFE_API_KEY_FILE`、`LLM_API_KEY_FILE` 指向本机文件，直接密钥优先于 `_FILE`。不要把密钥写到 shell 命令历史、仓库、Issue 或浏览器设置中。

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

“检测生成模型”只查询模型元数据，不发送 profile 或执行付费生成。部分兼容服务不实现模型列表，或列表不包含别名；检测失败不等同于生成接口不可用，应核对供应商说明。认证、权限、限流和网络故障会暂停填写；错误信息不会回显供应商正文或密钥。

参考协议：[TypeSafe API](https://docs.typesafe.ai/api)、[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[OpenAI Responses](https://platform.openai.com/docs/api-reference/responses)、[Anthropic Messages](https://docs.anthropic.com/en/api/messages)、[Gemini generateContent](https://ai.google.dev/api/generate-content)。
