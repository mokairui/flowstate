import { v4 as uuidv4 } from "uuid";
import type {
  AppSettings,
  TodoPriority,
  TodoAiSummary,
  EnergyLevel,
  SubtaskItem,
  TodoItem,
  TodoStatus,
} from "./types";

export interface AiParseResultItem {
  title: string;
  action?: string;
  context?: string;
  priority?: TodoPriority;
  tags?: string[];
  relatedFiles?: string[];
  relatedSymbols?: string[];
  suggestedNextStep?: string;
  subtasks?: string[];
  dueAt?: number; // unix timestamp in ms
  estimatedMinutes?: number;
  energyLevel?: EnergyLevel;
}

export interface AiParseResult {
  items: AiParseResultItem[];
}

// 适合国内模型（GLM、通义千问、DeepSeek 等）的严格 system prompt
const SYSTEM_PROMPT = `你是一名待办整理助手。用户会输入混乱的文字或临时想法，你的任务是将它整理为结构化的 TODO。

强制规则（违反任意一条输出将被视为错误）：
1. 你必须且只能输出一个合法的 JSON 对象，不要输出任何解释文字、markdown 标记、代码块。
2. items 数组必须包含至少一个元素，绝不能为空数组 []。
3. 每个 item 的 title 必须有实际内容，不能为空字符串。
4. 即使输入很简短或模糊，也必须从中提取至少一个可执行的任务作为 title。
5. title 不超过 30 个中文字符，简洁明确。
6. priority 只能是 low、medium、high 三者之一。
7. tags 使用小写英文或简短中文，最多 5 个。
8. 如果出现文件路径，放入 relatedFiles；出现函数名/变量名/类名，放入 relatedSymbols。
9. 如果存在多个子步骤，放入 subtasks 数组中。
10. 如果用户提到了时间（如"明天下午"、"下周一"、"本周末"），解析为 dueAt（Unix 时间戳毫秒数）。
11. 估算任务预计耗时（分钟），放入 estimatedMinutes（数字类型）。
12. 判断任务需要的精力水平（high/medium/low），放入 energyLevel。高精力如复杂编程、深度思考、架构设计；中等如常规开发、代码审查、会议；低精力如回复邮件、整理文档、更新配置。
13. 不要编造不存在的信息。

输出必须是如下格式的 JSON，不要改变键名。下面是一个有真实内容的示例，你的输出也必须填充实际内容：
{"items":[{"title":"修复登录页面样式bug","action":"检查 CSS 中按钮在移动端下的显示问题","context":"用户反馈在小屏设备上登录按钮被截断","priority":"high","tags":["frontend","bug","css"],"relatedFiles":["src/pages/Login.tsx"],"relatedSymbols":[],"suggestedNextStep":"在 Chrome DevTools 中切换到 375px 宽度复现问题","subtasks":[],"dueAt":null,"estimatedMinutes":60,"energyLevel":"medium"}]} `;

const FETCH_TIMEOUT = 300000; // 5min
const MAX_ERROR_LEN = 200;

function isValidPriority(p: string): p is TodoPriority {
  return p === "low" || p === "medium" || p === "high";
}

function normalizePriority(p: unknown): TodoPriority {
  if (typeof p === "string" && isValidPriority(p)) return p;
  return "medium";
}

/** 规范化标签：trim、去重、过滤空值、限制特殊字符、小写 */
function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const t of tags) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (!trimmed) continue;
    // 过滤明显不合法的标签（仅保留字母数字中文和常见符号）
    const cleaned = trimmed
      .replace(/[\x00-\x1f\x7f]/g, "") // 控制字符
      .slice(0, 30); // 单标签长度限制
    if (!cleaned) continue;
    // 英文部分统一小写，中文保持原样
    const normalized = cleaned.replace(/[a-zA-Z]+/g, (m) => m.toLowerCase());
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result.slice(0, 8);
}

/** 带超时的 fetch，支持外部 AbortSignal */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = options.signal;
  let onAbort: (() => void) | null = null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new Error("已取消");
    }
    onAbort = () => controller.abort();
    externalSignal.addEventListener("abort", onAbort);
  }

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (err) {
    // 优先检查外部 signal 是否被用户取消（兼容各种错误类型）
    if (externalSignal?.aborted) {
      throw new Error("已取消");
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("请求超时，请检查网络或 API 地址");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (onAbort && externalSignal) {
      externalSignal.removeEventListener("abort", onAbort);
    }
  }
}

/** 深度提取 JSON：尝试多种策略 */
function deepExtractJson(text: string): { json: string; strategy: string } | null {
  const trimmed = text.trim();

  // Strategy 1: Strip markdown code blocks
  const stripped = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^```\s*/i, "")
    .trim();

  if (stripped !== trimmed) {
    const result = tryParseJson(stripped);
    if (result) return { json: result, strategy: "markdown-strip" };
  }

  // Strategy 2: Find first { to last }
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = stripped.slice(firstBrace, lastBrace + 1);
    const result = tryParseJson(candidate);
    if (result) return { json: result, strategy: "brace-extract" };
  }

  // Strategy 3: Try entire text as-is
  const direct = tryParseJson(stripped);
  if (direct) return { json: direct, strategy: "direct" };

  // Strategy 4: Repair common JSON issues
  const repaired = stripped
    .replace(/,(\s*[}\]])/g, "$1") // remove trailing commas
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // quote unquoted keys
  if (repaired !== stripped) {
    const result = tryParseJson(repaired);
    if (result) return { json: result, strategy: "repair" };
  }

  return null;
}

function tryParseJson(text: string): string | null {
  try {
    JSON.parse(text);
    return text;
  } catch {
    return null;
  }
}

function parseAiResponse(raw: string): { result: AiParseResult; rawContent: string } {
  const extracted = deepExtractJson(raw);

  if (!extracted) {
    return { result: { items: [] }, rawContent: raw };
  }

  try {
    const parsed = JSON.parse(extracted.json) as unknown;
    if (isValidResult(parsed)) {
      return { result: normalizeResult(parsed), rawContent: raw };
    }
    return { result: { items: [] }, rawContent: raw };
  } catch {
    return { result: { items: [] }, rawContent: raw };
  }
}

function isValidResult(data: unknown): data is AiParseResult {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return false;
  if (obj.items.length === 0) return false;
  return obj.items.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const it = item as Record<string, unknown>;
    return typeof it.title === "string" && it.title.length > 0;
  });
}

function normalizeDueAt(dueAt: unknown): number | undefined {
  if (typeof dueAt === "number" && dueAt > 1600000000000 && dueAt < 4100000000000) {
    return dueAt;
  }
  return undefined;
}

function normalizeEstimatedMinutes(val: unknown): number | undefined {
  if (typeof val === "number" && val > 0 && val < 10080) {
    return Math.round(val);
  }
  return undefined;
}

function normalizeEnergyLevel(val: unknown): EnergyLevel | undefined {
  if (val === "high" || val === "medium" || val === "low") return val;
  return undefined;
}

function normalizeResult(result: AiParseResult): AiParseResult {
  return {
    items: result.items.map((item) => ({
      title: item.title.trim().slice(0, 60),
      action: item.action?.trim(),
      context: item.context?.trim(),
      priority: normalizePriority(item.priority),
      tags: normalizeTags(item.tags),
      relatedFiles: normalizeStringArray(item.relatedFiles, 5),
      relatedSymbols: normalizeStringArray(item.relatedSymbols, 5),
      suggestedNextStep: item.suggestedNextStep?.trim(),
      subtasks: normalizeStringArray(item.subtasks, 10),
      dueAt: normalizeDueAt(item.dueAt),
      estimatedMinutes: normalizeEstimatedMinutes(item.estimatedMinutes),
      energyLevel: normalizeEnergyLevel(item.energyLevel),
    })),
  };
}

function normalizeStringArray(arr: unknown, maxLen: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, maxLen);
}

/** 截断错误消息，防止过长内容污染数据库 */
export function truncateError(msg: string, maxLen = MAX_ERROR_LEN): string {
  if (msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen) + "…";
}

export async function parseTodoWithAi(
  rawInput: string,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<AiParseResult> {
  if (!settings.aiEnabled) {
    throw new Error("AI 功能未启用");
  }
  if (!settings.apiBaseUrl || !settings.apiKey) {
    throw new Error("API 地址或 Key 未配置");
  }

  try {
    const body: Record<string, unknown> = {
      model: settings.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: rawInput },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    };

    if (shouldUseJsonMode(settings.model)) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetchWithTimeout(
      `${settings.apiBaseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API 错误 (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as unknown;
    const content = extractContent(data);
    if (!content) {
      throw new Error("AI 返回内容为空");
    }

    const { result, rawContent } = parseAiResponse(content);

    if (result.items.length === 0) {
      const preview = rawContent.slice(0, 200).replace(/\s+/g, " ");
      throw new Error(`AI 返回格式不正确。原始返回：${preview}…`);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "已取消" || (err instanceof Error && err.name === "AbortError")) {
      throw new Error("已取消");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function shouldUseJsonMode(model: string): boolean {
  const supported = [
    "gpt-4",
    "gpt-4o",
    "gpt-4o-mini",
    "glm-4",
    "glm-4-flash",
    "glm-4-air",
    "glm-4-airx",
    "glm-4v",
    "deepseek-chat",
    "deepseek-coder",
    "qwen",
    "qwen-turbo",
    "qwen-plus",
    "qwen-max",
  ];
  const lower = model.toLowerCase();
  return supported.some((m) => lower.includes(m));
}

export function extractContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.choices) || obj.choices.length === 0) return null;
  const first = obj.choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  if (!message) return null;
  return typeof message.content === "string" ? message.content : null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  executedActions?: ExecutedAction[];
}

export interface StreamChatCallbacks {
  onChunk: (chunk: string, isDone: boolean) => void;
  onError?: (error: string) => void;
}

// -------- Chat-driven task actions --------

export type ChatTodoRef = {
  id: string;
  title: string;
  status: TodoStatus;
  priority?: TodoPriority;
  tags?: string[];
};

export interface ChatContext {
  inboxTodos: ChatTodoRef[];
  todayTodos: ChatTodoRef[];
  doingTodos: ChatTodoRef[];
  selectedTodoTitle?: string;
  energyMode?: EnergyLevel | null;
}

export type AiAction =
  | { type: "complete_todo"; id: string }
  | { type: "move_to_status"; id: string; status: TodoStatus }
  | {
      type: "create_todo";
      title: string;
      status?: TodoStatus;
      priority?: TodoPriority;
      tags?: string[];
    }
  | { type: "recommend"; id: string; reason?: string };

export type ExecutedAction = {
  type: AiAction["type"];
  todoId?: string;
  title?: string;
  ok: boolean;
  error?: string;
  status?: TodoStatus;
};

const MAX_LIST = 20;

function formatTodoLine(t: ChatTodoRef): string {
  const p = t.priority ? `, P-${t.priority}` : "";
  return `- [id=${t.id}] (${t.status}${p}) ${t.title}`;
}

function formatTodoBlock(label: string, list: ChatTodoRef[]): string {
  if (list.length === 0) return `${label}：（无）\n`;
  const truncated = list.length > MAX_LIST;
  const rows = list.slice(0, MAX_LIST).map(formatTodoLine).join("\n");
  const note = truncated ? `（仅列出最近 ${MAX_LIST} 条，共 ${list.length} 条）` : "";
  return `${label}${note}：\n${rows}\n`;
}

function buildChatSystemPrompt(context: ChatContext | undefined): string {
  const ctx: ChatContext = context ?? {
    inboxTodos: [],
    todayTodos: [],
    doingTodos: [],
  };

  const totalTodayDoing = ctx.todayTodos.length + ctx.doingTodos.length;
  const highPriority = [...ctx.todayTodos, ...ctx.doingTodos].filter(
    (t) => t.priority === "high"
  );

  let prompt = `你是 FlowState 的 AI 助手。用户正在使用一款本地优先的待办管理应用。请用中文回答，简洁友好。\n\n当前任务概况：\n- Today/Doing 共 ${totalTodayDoing} 个任务\n`;
  if (highPriority.length > 0) {
    prompt += `- 高优先级任务：${highPriority.map((t) => t.title).join("、")}\n`;
  }
  if (ctx.energyMode) {
    prompt += `- 用户当前能量模式：${
      ctx.energyMode === "high" ? "高精力" : ctx.energyMode === "low" ? "低精力" : "正常"
    }\n`;
  }
  if (ctx.selectedTodoTitle) {
    prompt += `- 当前选中任务：${ctx.selectedTodoTitle}\n`;
  }

  prompt += `\n可操作任务清单（引用任务时**必须**使用下面的 id，不要引用未列出的 id）：\n`;
  prompt += formatTodoBlock("Inbox", ctx.inboxTodos);
  prompt += formatTodoBlock("Today", ctx.todayTodos);
  prompt += formatTodoBlock("Doing", ctx.doingTodos);

  prompt += `\n操作指令协议：
- 你可以在自然语言回答之后，仅当需要执行操作时，在消息**结尾**追加一个 fenced code block，语言标注为 flowstate-action，内容是一个 JSON 数组，形如：

\`\`\`flowstate-action
[
  {"type":"complete_todo","id":"<id>"},
  {"type":"move_to_status","id":"<id>","status":"today"},
  {"type":"create_todo","title":"...","status":"today","priority":"medium","tags":[]},
  {"type":"recommend","id":"<id>","reason":"..."}
]
\`\`\`

- \`status\` 取值仅限：inbox | today | doing | done | archived。
- \`create_todo\` 中 \`title\` 必填，其余字段可省；缺省 \`status\` 视为 inbox。
- 用户仅问建议时用 \`recommend\`（不会修改任务，只会在应用里高亮该任务）。
- 不需要操作时**不要**输出该代码块。
- 未在上方清单列出的 id 一律不要引用。
- 该 code block 必须放在消息最后，且不要在其后再输出其他内容。

你可以帮助用户分析任务、提供建议、回答关于任务的问题。不要编造不存在的信息。`;

  return prompt;
}

export async function streamChat(
  messages: ChatMessage[],
  settings: AppSettings,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
  context?: ChatContext
): Promise<void> {
  if (!settings.aiEnabled) {
    callbacks.onError?.("AI 功能未启用");
    return;
  }
  if (!settings.apiBaseUrl || !settings.apiKey) {
    callbacks.onError?.("API 地址或 Key 未配置");
    return;
  }

  try {
    const systemPrompt = buildChatSystemPrompt(context);

    const body: Record<string, unknown> = {
      model: settings.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    };

    const response = await fetchWithTimeout(
      `${settings.apiBaseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API 错误 (${response.status}): ${text || response.statusText}`);
    }

    if (!response.body) {
      throw new Error("响应体为空，无法流式读取");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          callbacks.onChunk("", true);
          return;
        }
        try {
          const json = JSON.parse(data) as unknown;
          if (typeof json === "object" && json !== null) {
            const obj = json as Record<string, unknown>;
            const choices = obj.choices as Array<Record<string, unknown>> | undefined;
            if (choices && choices.length > 0) {
              const delta = choices[0].delta as Record<string, unknown> | undefined;
              const content = typeof delta?.content === "string" ? delta.content : "";
              if (content) {
                callbacks.onChunk(content, false);
              }
            }
          }
        } catch {
          // ignore malformed JSON lines
        }
      }
    }

    callbacks.onChunk("", true);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      callbacks.onError?.("已取消");
      return;
    }
    callbacks.onError?.(err instanceof Error ? err.message : String(err));
  }
}

export async function testAiConnection(
  settings: AppSettings
): Promise<{ success: boolean; message: string }> {
  if (!settings.aiEnabled) {
    return { success: false, message: "AI 功能未启用" };
  }
  if (!settings.apiBaseUrl || !settings.apiKey) {
    return { success: false, message: "API 地址或 Key 未填写" };
  }

  try {
    const response = await fetchWithTimeout(
      `${settings.apiBaseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model || "gpt-4o-mini",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        }),
      }
    );

    if (response.ok) {
      return { success: true, message: "连接成功" };
    }
    const text = await response.text().catch(() => "");
    return { success: false, message: `连接失败 (${response.status}): ${text || response.statusText}` };
  } catch (err) {
    return {
      success: false,
      message: `请求失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function applyAiResultToTodo(
  item: AiParseResultItem
): {
  title: string;
  tags: string[];
  priority: TodoPriority;
  dueAt?: number;
  estimatedMinutes?: number;
  energyLevel?: EnergyLevel;
  aiSummary: TodoAiSummary;
  subtasks: SubtaskItem[];
} {
  return {
    title: item.title,
    tags: item.tags || [],
    priority: item.priority || "medium",
    dueAt: item.dueAt,
    estimatedMinutes: item.estimatedMinutes,
    energyLevel: item.energyLevel,
    aiSummary: {
      title: item.title,
      tags: item.tags,
      priority: item.priority,
      action: item.action,
      context: item.context,
      suggestedNextStep: item.suggestedNextStep,
      relatedFiles: item.relatedFiles,
      relatedSymbols: item.relatedSymbols,
      // 历史字段保留：F-2 起新代码不再依赖 aiSummary.subtasks，但仍写入一份
      // 文本快照以兼容旧的导出 JSON / 旧渲染路径。
      subtasks: item.subtasks,
    },
    subtasks: subtaskStringsToEntities(item.subtasks ?? [], "ai"),
  };
}

/** 把 AI 返回的字符串子任务转换为带 id/order/done 的实体。 */
export function subtaskStringsToEntities(
  texts: string[],
  source: SubtaskItem["source"]
): SubtaskItem[] {
  const now = Date.now();
  const seen = new Set<string>();
  const result: SubtaskItem[] = [];
  for (const raw of texts) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, 60);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: uuidv4(),
      text: trimmed,
      done: false,
      order: result.length,
      createdAt: now,
      source,
    });
  }
  return result;
}

/**
 * F-2 智能拆分：以当前 todo 上下文 + 已有子任务文本为输入，复用 parseTodoWithAi，
 * 返回需要追加的新子任务（已与现有子任务去重）。
 *
 * 调用方负责把返回的 added 拼接到 todo.subtasks 之后并落盘；失败时本函数抛错，
 * 调用方仅做 Toast 提示，**不要清空已有子任务**。
 */
export async function generateSubtasksForTodo(
  todo: Pick<TodoItem, "title" | "rawInput" | "note" | "aiSummary" | "subtasks">,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<{ added: SubtaskItem[] }> {
  const existing = todo.subtasks ?? [];
  const existingTexts = existing.map((s) => s.text);
  const contextParts: string[] = [];
  contextParts.push(`任务标题：${todo.title}`);
  if (todo.note?.trim()) contextParts.push(`备注：${todo.note.trim()}`);
  if (todo.aiSummary?.context?.trim()) contextParts.push(`背景：${todo.aiSummary.context.trim()}`);
  if (todo.aiSummary?.action?.trim()) contextParts.push(`关键动作：${todo.aiSummary.action.trim()}`);
  if (todo.rawInput?.trim() && todo.rawInput.trim() !== todo.title.trim()) {
    contextParts.push(`原始输入：${todo.rawInput.trim().slice(0, 400)}`);
  }
  if (existingTexts.length > 0) {
    contextParts.push(
      `已有子任务（请不要重复，仅补充缺失步骤；如已完整可返回空 subtasks）：\n${existingTexts
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n")}`
    );
  }
  contextParts.push(
    `请将该任务拆解为可逐条执行的子步骤，要求：\n- 每条单一动作，不超过 30 字\n- 按"前置 → 后置"顺序排列\n- 不超过 8 条\n- 仅把子任务放入 subtasks 字段；title 可保持与原任务一致`
  );

  const prompt = contextParts.join("\n\n");
  const result = await parseTodoWithAi(prompt, settings, signal);
  const first = result.items[0];
  if (!first || !first.subtasks || first.subtasks.length === 0) {
    return { added: [] };
  }

  // 客户端去重：trim + 大小写无关，避免 AI 又把已有项重抛回来。
  const existingKeys = new Set(existingTexts.map((t) => t.trim().toLowerCase()));
  const baseOrder = existing.length > 0 ? Math.max(...existing.map((s) => s.order)) + 1 : 0;
  const now = Date.now();
  const added: SubtaskItem[] = [];
  for (const raw of first.subtasks) {
    if (typeof raw !== "string") continue;
    const text = raw.trim().slice(0, 60);
    if (!text) continue;
    const key = text.toLowerCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    added.push({
      id: uuidv4(),
      text,
      done: false,
      order: baseOrder + added.length,
      createdAt: now,
      source: "ai",
    });
  }
  return { added };
}
