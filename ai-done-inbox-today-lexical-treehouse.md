# 在 QuickCapture 聊天中加入任务操作能力

## Context

`QuickCapture` 已经有 **AI 对话模式**，走 `lib/ai.ts:streamChat` 的 SSE 流式输出。但目前 AI 只能读上下文并给建议，无法真正操作任务——除了 `ChatBubble` 里两个硬编码按钮（`set_doing` / `generate_subtasks`）针对 `selectedTodoId`。

用户希望在聊天里说"X 完成了 / 今天要做 Y / 推荐我现在做什么"就能真的移动任务、创建任务、推荐任务，并且回答仍然是流式打印。

方案：**保留现有 streamChat 不动**，改在 system prompt 里指示模型在流式正文结尾**追加一段 `\`\`\`flowstate-action` JSON 指令块**。流式打印时把指令块从可见气泡里剥离，流结束后解析指令、走既有 db+store 双写模式执行，逐条 toast 汇报。

- 触发方式：JSON 指令块（无需改 SSE 循环，兼容所有 OpenAI 兼容模型）
- 支持操作：**移动状态、创建任务、推荐任务**（不含删除/归档）
- 任务匹配：**上下文注入 ID** —— 把 inbox+today+doing 的 `{id,title,status,priority}` 全部塞进 system prompt，模型返回精确 id

## 关键文件

| 文件 | 改动 |
|---|---|
| `lib/ai.ts` | 扩展 `ChatContext` 与 `buildChatSystemPrompt`，追加"操作指令协议"段 |
| `components/QuickCapture.tsx` | 传递完整任务列表到 `streamChat`；在 `onChunk` 中剥离指令块；在 `onDone` 中解析并执行；实现 `executeAiActions` |
| `components/ChatBubble.tsx` | 可选：为携带 `executedActions` 的 assistant 消息渲染"已执行 N 个操作"小卡片 |
| `lib/types.ts` | 在 `ChatMessage` 上增加可选 `executedActions?: ExecutedAction[]`（放 `lib/ai.ts` 里也行） |

不需要改：`lib/store.ts`、`lib/db.ts`、`lib/settings.ts`、`SettingsPanel.tsx`、`streamChat` 的 SSE 解析。

## 实现细节

### 1. `lib/ai.ts` — 扩展 ChatContext + Prompt

- `ChatContext` 现在只带 `today/doing` 的简版 (line ~372)。改为携带三份数组：

  ```ts
  export type ChatTodoRef = { id: string; title: string; status: TodoStatus; priority?: TodoPriority; tags?: string[] }
  export interface ChatContext {
    inboxTodos: ChatTodoRef[]
    todayTodos: ChatTodoRef[]
    doingTodos: ChatTodoRef[]
    selectedTodoTitle?: string
    userEnergyMode?: UserEnergyMode
  }
  ```

- `buildChatSystemPrompt` 追加两段：
  1. **可操作任务清单**：三段列表，每行 `- [id=xxxxx] (today, P1) 标题`；明确告诉模型"引用任务时必须使用上面的 id"。
  2. **操作指令协议**：正文自然回答之后，如果需要执行操作，在消息**结尾**附加一个 fenced code block：

     ```
     ```flowstate-action
     [
       {"type":"complete_todo","id":"<id>"},
       {"type":"move_to_status","id":"<id>","status":"today"},
       {"type":"create_todo","title":"...","status":"today","priority":"medium","tags":[]},
       {"type":"recommend","id":"<id>","reason":"..."}
     ]
     ```
     ```

     规则：只有需要操作时才输出该块；`status` 取值 `inbox|today|doing|done|archived`；`create_todo` 中 `title` 必填、其余可省；一次可含多条；用户仅问建议时用 `recommend`（不强制修改任务）。

- 保持 `temperature: 0.7`；不改 `streamChat` 主体。

### 2. `components/QuickCapture.tsx` — 上下文、剥离、执行

**A. 组装上下文 (改 `sendChatMessage` ~L211–222)**

现在只塞了 `today/doing` 的 title；改为：

```ts
const map = (t: TodoItem): ChatTodoRef => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, tags: t.tags })
const context: ChatContext = {
  inboxTodos: todos.filter(t => t.status === "inbox").map(map),
  todayTodos: todos.filter(t => t.status === "today").map(map),
  doingTodos: todos.filter(t => t.status === "doing").map(map),
  selectedTodoTitle: selectedTodo?.title,
  userEnergyMode: settings.userEnergyMode,
}
```

如果三份数组总量超过 ~40 条（防 prompt 爆），只截取每段前 20 条并在 prompt 里注明"仅列出最近 20 条"。

**B. 流式过程剥离指令块 (改 `onChunk` ~L192–204)**

`streamingContent` 里可能中途出现 ` ```flowstate-action`。**显示时**用派生值：

```ts
const ACTION_FENCE = /```flowstate-action[\s\S]*?(```|$)/
const visibleStreaming = streamingContent.replace(ACTION_FENCE, "").trimEnd()
```

把 `visibleStreaming` 传给 `ChatBubble` 的临时 streaming 消息即可，无需改 SSE。

**C. 流结束后解析 + 执行 (改 `onDone` ~L200–210)**

```ts
onDone: async () => {
  const full = streamingContent
  const match = full.match(/```flowstate-action\s*([\s\S]*?)```/)
  const cleaned = full.replace(/```flowstate-action[\s\S]*?```/, "").trim()
  let executed: ExecutedAction[] = []
  if (match) {
    try {
      const actions = JSON.parse(match[1]) as AiAction[]
      executed = await executeAiActions(actions)
    } catch (e) {
      showToast("AI 指令解析失败", "error")
    }
  }
  setChatMessages(prev => [...prev, { role: "assistant", content: cleaned, executedActions: executed }])
  setStreamingContent("")
  setIsStreaming(false)
}
```

**D. `executeAiActions(actions)` — 沿用 `handleChatAction` (~L238–292) 的双写模板**

单条 action 分派：

- `complete_todo`：`await updateTodo(id, { status: "done", completedAt: Date.now() })` → `updateInStore(id, ...)`
- `move_to_status`：先算 `order = await getNextOrderForStatus(status)`；`updateTodo(id, { status, order })` → `updateInStore(...)`；若 status 为 `done` 补 `completedAt`
- `create_todo`：构造 `TodoItem`（`crypto.randomUUID()`、`getNextOrderForStatus(status)`、`source: "ai_chat"`、时间戳、`aiStatus: "pending"`），`await addTodo(todo)` → `addTodoToStore(todo)`
- `recommend`：仅调用 `openDetail(id)` 高亮显示，不改数据

每条成功后 push 一条 `{ type, todoId, title }` 到 `executed`。所有 action 处理完毕后：

- 失败：`showToast("操作失败: xxx", "error")`，跳过后续依赖该 id 的项
- 成功：`showToast(\`已执行 ${executed.length} 个操作\`, "success")`

保持"try/catch 单条隔离，不阻塞后续 action"。

**E. 类型**

在 `lib/ai.ts` 或 `lib/types.ts` 声明：

```ts
export type AiAction =
  | { type: "complete_todo"; id: string }
  | { type: "move_to_status"; id: string; status: TodoStatus }
  | { type: "create_todo"; title: string; status?: TodoStatus; priority?: TodoPriority; tags?: string[] }
  | { type: "recommend"; id: string; reason?: string }
export type ExecutedAction = { type: AiAction["type"]; todoId?: string; title?: string }
```

### 3. `components/ChatBubble.tsx` — 展示已执行操作（可选轻量）

在 assistant 气泡底部，如果 `message.executedActions?.length`，渲染一行小 chip 组：

```
✓ 完成 · 写周报    ↗ 移到今日 · 修 Bug    ＋ 已创建 · 打电话给客户
```

用现有 `text-text-muted` + `border-glass-border` 类。点击 chip 调 `openDetail(todoId)`。

### 4. 兼容性 & 边界

- `settings.aiEnabled && apiBaseUrl && apiKey` 已在现有 UI 上 gate，不重复。
- 模型如果忘记附 code block，只显示正文即可，无副作用。
- 模型给了不存在的 id：executor 在开头 `const todo = todos.find(t => t.id === id)`，找不到就跳过并加错误 toast。
- `create_todo` 允许 status 缺省，默认 `inbox`。
- 流式过程中如果 `\`\`\`flowstate-action` 只写了一半（例如刚出现 fence 但 JSON 未完），正则 `(```|$)` 会兜底，气泡不会闪出裸 JSON。

## 验证

启动 `npx next dev`，打开 http://localhost:3000，先在 Settings 里确认 AI 已启用（apiBaseUrl/apiKey/model 已配）。

按 `Cmd/Ctrl+K` 打开 QuickCapture → 切到「AI 对话」模式，依次测试：

1. **完成任务**：先在 inbox 里加"写周报"；对话说"周报写完了"。期望：流式回答自然出现，气泡里不显示 JSON；状态切到 done；toast "已执行 1 个操作"。
2. **移到今日**：inbox 里有"调研 A/B 测试方案"；说"今天准备做 A/B 测试的那个调研"。期望：任务从 inbox 移到 today。
3. **创建任务**：说"帮我把'下午三点联系客户'加到今日"。期望：today 里新增该条，`source: ai_chat`。
4. **推荐任务**：说"我现在精力低，推荐我做什么"。期望：流式正文里给出推理与推荐；如果 today 里有匹配任务，右侧 Detail 抽屉自动打开该任务；toast 出现"已执行 1 个操作"。
5. **不存在 id 兜底**：手动 mock 模型返回错 id（临时改 executor 打日志）——确认 toast 显示错误且不影响其他动作。
6. **主题**：System/Dark/Light 切换下气泡 chip 颜色仍走语义类。
7. `npx tsc --noEmit` 通过；`npm run lint` 通过。
