# 用自己的资料建立 profile

[profile.synthetic.json](examples/profile.synthetic.json) 是可通过格式校验的教学示例：姓名、学校、公司、项目、经历和日期均为虚构，不是作者履历的脱敏副本。邮箱使用不可投递的 `example.invalid`；不提供电话号码、住址、生日或证件号码。

示例展示中英文姓名、教育、实习、项目、技能、叙述、未知字段和来源索引的关系。它不包含行业排除、网页清理、覆盖已有值、接受声明或自动提交的授权。插件默认仍读取 `profile/profile.json`，首次启动创建的文件是 `{}`，不会自动采用这个示例。

## 推荐：从自己的材料生成

按 [README](../README.md#快速开始从安装-skill-到首次填写) 安装 `jev-profile` skill，并向 agent 提出：

> 使用 $jev-profile，读取我指定的求职资料目录，在指定插件目录生成 profile/profile.json。只提取我的已证实经历，记录来源、冲突和缺失信息，不将仓库的虚构示例当作我的事实。

核对 `profile/review-notes.md` 和最终资料，尤其是姓名、联系方式、学校 / 公司、身份和日期。没有材料支持的值留空；不能为了通过网页必填校验而编造事实。

## 手动建立

1. 对照示例和 [profile 格式参考](../skills/jev-profile/references/profile-format.md)，在本机私有的 `profile/profile.json` 中建立自己的 JSON。已有 profile 时先在同一私有目录备份，再合并修改。
2. 示例只用于看字段结构；若复制了示例，使用前替换或删除每一项虚构内容，包括英文名称、日期、职责、技能、叙述和来源索引。没有的经历直接删去。补上自己的电话等事实后，删除 `unknown_fields` 中对应的未知标记，以免继续阻止填写。
3. 将 `source_metadata` 改为自己的真实材料相对路径、页码或章节。示例中的 `fictional-resume.md` 仅表示虚构来源，不是仓库中的真实文档。
4. 日期保留原有精度；只有明确仍在读 / 在职 / 进行中的经历才使用 `is_present: true`，且不同时填写结束日期。不要把缺失日期当作“至今”。
5. 在插件根目录校验自己的文件：

   ```sh
   python3 skills/jev-profile/scripts/validate_profile.py profile/profile.json --require-facts
   ```

格式检查不会验证履历真假。本人确认后再启动 bridge、打开申请表。每个新任务会重新读取 profile。

## 本地私有与公开示例

| 路径 | 用途 | 可否提交 Git |
| --- | --- | --- |
| `profile/profile.example.json` | 空的启动模板 `{}` | 可以，始终保持为空 |
| `docs/examples/profile.synthetic.json` | 完全虚构的结构示例 | 可以，不得改填真人资料 |
| `profile/profile.json` | 自己的真实填写资料 | 不可以，已被 Git 忽略 |
| `profile/source-inventory.json`、`profile/review-notes.md` | 自己的材料来源与审阅记录 | 不可以，已被 Git 忽略 |

不要用真实资料覆盖文档目录内的示例，也不要用 `git add -f` 强行提交个人文件。
