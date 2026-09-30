# 架构

```text
status / options → background → content
                             → local bridge → Jev / configured generator
                             → DOM 写入与核验 → 人工接手

workspace documents → jev-profile skill → private profile/profile.json
```

| 模块 | 责任 |
| --- | --- |
| `extension/background.js` | 当前页注入、配对请求、跨域授权与本机草稿存储 |
| `extension/content.js` | 控件识别、记录路由、页面适配、事件写入/核验、草稿保护与接手面板 |
| `control-metadata.js` / `diagnostics.js` | 控件格式元数据与诊断信息 |
| `bridge/server.py` | loopback HTTP、认证、异步任务、健康状态和报告 |
| `bridge/engine.py` | 事实候选目录、Jev 决策、生成候选与依据复核、协议传输 |
| `bridge/model_config.py` | 私有配置、环境变量、密钥文件与 base URL 校验 |
| `bridge/pipeline.py` | 并发字段分析及逐项进度 |
| `application_scope.py` / `project_scope.py` | 仅在 profile 配置对应规则时应用经历范围策略 |
| `form_support.py` | profile 中明确授权的局部日期纠错 |
| `profile_memory.py` | 依据复核且成功写入的补充答案，来源变化后失效 |
| `skills/jev-profile` | 工作区文档清单、来源/冲突处理与 profile 格式校验 |

事实源与补充答案分开，补充答案不能循环证明自身。默认 profile 空白、无个人网站策略、无清理项目授权和日期补日规则。扩展不读取文件系统，也不直接调用模型；所有 API key 留在 bridge。模型网络请求不转发重定向。

扩展 DOM 写入需触发正确事件并核验最终值；点击事件成功不是保存成功。草稿完成保存后才能新增条目；手动修改优先，上传由人执行。与网页身份和记录顺序有关的修复应添加能覆盖错配的回归。
