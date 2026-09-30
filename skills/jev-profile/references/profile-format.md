# Profile 格式

根节点是 JSON 对象。未知值省略；空容器合法。插件匹配以下结构，所有键均为可选：

| 键 | 类型 | 内容 |
| --- | --- | --- |
| `person` | 对象 | `name_zh/name_en`、`phone/email`、已证实的所在地；不要放证件号 |
| `education` | 对象数组 | `id`、`school_zh/school_en`、`faculty_zh`、`major_zh/major_en`、`degree_zh/degree_en`、`start/end`、有来源的 GPA |
| `experience` | 对象数组 | `id`、`company_zh/company_en`、`department_zh`、`title_zh/title_en`、`start/end`、`is_internship/is_full_time`、`responsibilities_zh`、`bullets` |
| `projects` | 对象数组 | `id`、`name_zh/name_en`、`role_zh`、`start/end`、`description_zh`、`responsibilities_zh`、`bullets` |
| `leadership` | 对象数组 | `id`、`school_zh`、`org_zh`、`role_zh`、`start/end`、`description_zh` |
| `honors` | 对象 | `dated_items` 数组：`zh/name_zh`、`date`、`level_zh`、`type_zh`；竞赛获奖用 `type_zh: "竞赛获奖"` |
| `skills`、`research_focus`、`publications`、`gaming_profile` | 对象 | 有来源的技能、研究、论文、游戏经历；缺少材料时不创建内容 |
| `narratives` | 对象 | `one_liner_zh`、`self_introduction_versions` 等完整叙述；必须有依据 |
| `atomic_fields` | 对象数组 | 特定表单已有答案：`id`、`en`（字段语义）、`value`、`aliases_zh/aliases_en`；默认不添加声明答案 |
| `job_preferences` | 对象 | 用户明确表达的意向和偏好；不从 JD 推断 |
| `unknown_fields` | 对象数组 | `id`、`aliases_zh/aliases_en`、`why`；匹配这些字段时留空 |
| `source_metadata` | 对象 | 字段路径或记录 ID → 文件相对路径、页码、章节、摘要；不会进入模型候选 |

日期使用 `YYYY`、`YYYY-MM` 或 `YYYY-MM-DD`，保持来源精度。只有已明确在读/在职/进行中才用 `is_present: true`。缺失结束日期省略，不伪造；没有来源时也不填 `false`。原文是长日期、学期或范围时可额外保留 `date_display_zh`，需要精确日期的控件交给用户。

经历的 `id` 在后续更新中保持稳定，同一组织的不同职位可为不同记录。叙述 `bullets` 是对象数组，例如 `{ "zh": "已核实的职责", "en": "verified responsibility" }`；不要将来源备注当成履历。建议按时间倒序排列，所有记录顺序同时决定初始表单顺序。

`form_record_policy.project_ids` 可以记录用户主动选择的项目 ID 列表；省略时全部项目均可匹配，不限制数量。不默认添加 `application_policy`、`allow_high_match_extras` 或网站清理授权。`date_conventions.month_only_default_day: 1` 仅在用户明确同意用每月 01 日满足完整日期控件时添加。

示例展示的是字段形状，不能复制其中的占位文字成为用户事实：

```json
{
  "person": {},
  "education": [],
  "experience": [],
  "projects": [],
  "leadership": [],
  "honors": {"dated_items": []},
  "skills": {},
  "narratives": {},
  "atomic_fields": [],
  "unknown_fields": [],
  "source_metadata": {}
}
```
