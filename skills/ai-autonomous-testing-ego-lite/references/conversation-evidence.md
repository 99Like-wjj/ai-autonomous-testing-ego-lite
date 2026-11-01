# 对话取证与报告阅读

适用于任意被测聊天产品。接收统一的 conversationVersion 1 JSON；AI 根据实际页面、DOM、导出文件或获授权采集的接口资料整理，代码不识别公司名称、接口字段、业务关键词或特定 SSE 协议。格式见 ToolRoot/schemas/conversation.schema.json。整理不是重新执行，不能补写没有留存的对话。

## 先保管来源，再整理消息

长回复的可访问性快照可能截断。先核对快照是否覆盖全文；按需使用官方 Ego Page.evaluate 读取明确选中的可见消息节点，或使用 ego-helpers/capture-text.mjs。这个只读辅助要求传入实际 Page、明确 CSS 选择器、绝对新文件和 AI 声明的结束状态及依据；不点击、不等待、不重试、不推断业务结果。匹配多个、隐藏或未渲染节点明确留下缺口，不按“没有内容”判产品失败。采集时间不冒充发送时间。

```javascript
// 在官方 Ego nodejs 执行环境中使用已有的真实 page；不要另开浏览器连接。
const { captureDomText } = await import('file:///ABSOLUTE_TOOL_ROOT/ego-helpers/capture-text.mjs');
await captureDomText({
  page, outputFile: 'ABSOLUTE_PRIVATE_DIR/reply-capture.json',
  selectors: [{ id: 'reply', selector: '#observed-message-node' }],
  completion: { state: 'unknown', basis: '当前节点可见，但没有采集到结束信号。' }
});
```

选取节点的方法由 AI 依据当前页面决定。页面虚拟列表未加载的历史、折叠内容、iframe、卡片内字段和不可见附件均不能声称已采齐。流停止、工具调用结束、助手说“成功”、列表或详情确实更新是不同事实；分别记录。回复停在确认环节用 waiting_confirmation，仍在生成用 streaming，断流用 interrupted；没有可靠依据用 unknown。不能用固定等待秒数推断 final。

## 通用消息格式

每份文件包含 id、title、messages、limitations。messages 按实际顺序排列；每条需要稳定 id、role（user/assistant/tool/notice）、format（text/markdown/json/code）、content、presentation、completeness、state、completionBasis、sourceRefs、limitations。只有原件明确给出时才填 sentAt 或 displayTime；observedAt 单独表示采集时间。

- presentation：verbatim 为逐字原文，normalized 为来源整理，summary 仅为摘要。Markdown 重排、去除页面按钮等处理声明 normalized，并解释处理范围。
- completeness：complete、partial、unknown 描述原消息文字保留程度。摘要不能为 complete；完整正文与 final 是两个维度，内容齐全也可能仍在生成。
- sourceRefs 使用本文件内 sourceId，可附 JSON Pointer 和实际原文 quote。JSON Pointer 只定位现有字段；quote 必须真实存在。verbatim 内容须能在引用来源中逐字找到。normalized 的语义与完整性仍由 AI 核对，工具不会把“引用存在”当作语义正确。
- attachmentSourceIds 仅用于真实附件；映射到同用例已登记的证据。报告不外联图片、不执行HTML，Markdown中的外链图片显示说明。保留必要附件并说明未取得的内容。

示例（合成资料，不是真实证据）：

```json
{
  "conversationVersion": 1,
  "id": "dialog-1",
  "title": "合成确认对话",
  "messages": [
    {
      "id": "m1", "role": "user", "format": "text", "content": "确认",
      "presentation": "verbatim", "completeness": "complete", "state": "final",
      "completionBasis": "已留存提交文本；不表示业务执行成功。",
      "sourceRefs": [{"sourceId":"submission","jsonPointer":"/text","quote":"确认"}],
      "limitations": []
    }
  ],
  "limitations": ["本示例没有AI回复，不能推断回复或业务结果。"]
}
```

原始 DOM 文本、SSE 导出、JSON、文件分段等均由 AI 检查真实结构后转换为此格式。代码只处理统一格式、字节哈希、精确引文、引用范围和安全渲染；没有某个项目专用适配器。不要直接把原始事件包、协议字段或快照JSON当成聊天正文。

## 登记及动作关联

先用 evidence-add 登记原始文件，再登记 kind=conversation 的规范化文件；metadata.conversationSources 用 `{sourceId,evidenceId}` 将本地来源ID映射到同用例原件，映射必须恰好覆盖所有引用。工具自动将原件加入 contextEvidenceIds，便于闭包交付与并行导入；不会更改规范化文件字节。

实际 observations.actions 中记录：

- inputSummary：本步真实发了什么，保留影响预期的日期、间隔、身份、标题等具体值；不能只写“提交请求”。
- replySummary：AI 大概答了什么，包括拒绝原因、待确认、是否调用工具、结束状态；不要用“已完成”替代助手真实含义。
- input 可保留输入；inputPresentation=verbatim 时须与本步关联的逐字 user 消息完全一致。
- conversations：`[{evidenceId,messageIds}]`，同时将 conversation 证据ID放入本步 evidenceIds。只关联该实际动作的消息；其余消息在抽屉标为上下文，不是本步证明。

并行工作包使用本地证据key；协调者导入只改外部证据ID，保留消息ID、本地sourceId和原文件SHA。缺少消息、错误来源、跨用例材料或伪造原文会拒绝入账，不自动决定补测路线。

## 只读整理旧运行

用 report --context 创建新的报告目录。将新规范化文件和补充来源的绝对路径与SHA加入 context.sources，在 context.conversations 声明 caseId、goalId、sourceLabel、sourceBindings、actions、limitations。sourceBindings 每项选择已登记的 evidenceId 或 context.sources 的 sourceLabel；不能自引用。actions 只用当前目标已有的 observationId/actionId/messageIds，不能引用计划或借用其他目标的证据。原始文件不足就声明 partial/unknown，不能生成遗失的输入。

readerNotes.actions 可补充 inputSummary/replySummary，必须有来源、局限和原动作引用。整理不能改状态、预期、实际步骤或原始证据，也不能把事后意见当作原执行记录。

## 方案 2 阅读与复核

步骤面板先显示输入摘要、AI回复摘要，原输入可展开；“查看完整对话”打开侧栏，测试输入居右、被测AI居左，支持全屏、定位本步输入/回复、来源核对、复制显示内容及浏览器前进/后退。每条消息展示来源保真度、覆盖程度和结束状态，Markdown标题、列表、表格和代码按安全格式展示。原始JSON在来源层保留，不挤占正文。

生成报告后在 Ego 实际核对摘要与原文是否一致、消息是否对应当前步骤、长回复是否完整、来源是否可核验，以及返回原步骤/证据位置是否保留。verify-report 只验证交付文件，不能冒充浏览器验收或对话语义校验。
