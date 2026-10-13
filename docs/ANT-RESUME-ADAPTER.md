# Ant 简历表单识别修复 · 0.2.1

某些 Ant 简历表单将标题放在布局列内、Form.Item 外侧，经历按 `moduleBlock / reSubBlock / blockContainer` 分组。旧扫描器只能读到通用 placeholder 或输入框 ID，并将同一条经历的布局行误认为不同记录。Jev 收到的字段名称和记录上下文错误，导致已有事实无法匹配。

修复从同一布局列读取独立标题和必填标记，按模块标题确定栏目，按完整记录容器计算序号，并用现有学校、公司、项目名称生成记录身份提示。记录身份仍由 Jev 核对，不按网页位置覆盖已有经历，不降低置信度阈值。

Ant Select 的 `role=combobox` 位于内部搜索输入框。控件读取和操作改为定位外围组件，读取已选条目，忽略未提交的搜索文字；打开面板补齐鼠标按下事件。ARIA 控制列表被隐藏时，通过其所属下拉框获取可见选项。

“记录页面结构”先更新扫描脚本，不发起填写。字段诊断仍不包含表单答案、密钥、cookies 或整页 HTML。

`tests/ant-resume.cjs` 使用虚构资料验证标题、必填性、经历归属、现有下拉值保留、搜索文字隔离、鼠标事件、只读日期选择、新增记录计数及提交保护。控件操作在隔离浏览器中验证；这不代表所有企业定制表单或完整申请流程均已验收。

## Follow-up verification (0.2.3)

- Editable Ant dates are drafts until Enter commits them. Require popup closure and the expected value after blur; restore a rejected draft and never leave a generic search value in the date input. An ongoing end without a visible Present option is a handoff, not today's date.
- Empty known repeatable containers may be expanded. Count only actual record blocks, not nested layout rows.
- Language and exam context can be carried in the row hint without forcing these fields into an education/employer/project identity lock. Retrieval confidence is distinct from final factual-match confidence.
- Prefer a supplied exact date over the default-first-day convention for the same source month. Prioritize shallow record evidence and exact dates before long nested descriptions.
- An unresolved employer industry does not authorize expanding experiences with an explicit industry exclusion. Final model confidence thresholds remain unchanged.

Regression fixtures cover both existing and empty Ant records, editable and readonly dates, rejected input drafts, ongoing dates without Present, preservation, and no form submission. Fixtures contain synthetic data only.
