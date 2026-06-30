import type { TodoItem, AiPlanningSuggestion, EnergyLevel, AppSettings } from "./types";
import { fetchWithTimeout, extractContent, shouldUseJsonMode } from "./ai";

const FETCH_TIMEOUT = 60000; // 60s — 国内大模型 + JSON 模式经常 >15s 才出第一个 token
const DEFAULT_DAILY_AVAILABLE = 480; // 8h

/**
 * F-1 历史完成情况统计。基于过去 7 天内 `completedAt` 命中的任务。
 * 注意：完成率 = 已完成 / (已完成 + 同期未完成的"今日/进行中"任务) — 仅作为提示信号，不需要绝对精确。
 */
export interface PlanHistoryStats {
  completed: number;
  /** 过去 7 天内创建但未完成（仍在 inbox/today/doing）的任务数 */
  outstanding: number;
  /** 0–1 */
  completionRate: number;
  /** 平均完成时长（分钟）— 从 createdAt 到 completedAt；缺少数据时为 0 */
  avgCompletionMinutes: number;
}

export function computePlanHistoryStats(todos: TodoItem[], now: number = Date.now()): PlanHistoryStats {
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const completed = todos.filter(
    (t) => t.completedAt && t.completedAt >= sevenDaysAgo && !t.isRecurringTemplate
  );
  const outstanding = todos.filter(
    (t) =>
      !t.isRecurringTemplate &&
      (t.status === "inbox" || t.status === "today" || t.status === "doing") &&
      t.createdAt >= sevenDaysAgo
  );

  const denom = completed.length + outstanding.length;
  const completionRate = denom > 0 ? completed.length / denom : 0;

  const durations = completed
    .map((t) => (t.completedAt! - t.createdAt) / (1000 * 60))
    .filter((m) => m > 0 && m < 7 * 24 * 60); // 排除异常值
  const avgCompletionMinutes =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  return {
    completed: completed.length,
    outstanding: outstanding.length,
    completionRate,
    avgCompletionMinutes,
  };
}

export function buildPlanningPrompt(
  todos: TodoItem[],
  userEnergyMode: EnergyLevel | null,
  options?: { dailyAvailableMinutes?: number; history?: PlanHistoryStats }
): string {
  const pending = todos.filter((t) => t.status === "today" || t.status === "inbox");
  const todoList = pending
    .map((t, i) =>
        `${i + 1}. [id:${t.id}] ${t.title} [优先级:${t.priority}] [预估:${t.estimatedMinutes ?? "未估算"}分钟] [能量:${t.energyLevel ?? "未设置"}] [截止:${t.dueAt ? new Date(t.dueAt).toLocaleDateString("zh-CN") : "无"}]`
    )
    .join("\n");

  const avail = options?.dailyAvailableMinutes ?? DEFAULT_DAILY_AVAILABLE;
  const history = options?.history;
  const historyLine = history
    ? `历史 7 天数据：已完成 ${history.completed} 个，完成率 ${Math.round(history.completionRate * 100)}%，平均完成时长 ${history.avgCompletionMinutes || "未知"} 分钟`
    : "历史数据：暂无";

  return `你是一位高效的时间管理助手。请根据以下未完成任务，为用户建议「今天应该做什么、何时做」的清单。

用户当前能量模式：${userEnergyMode ?? "未设置"}
今日可用时间：${avail} 分钟（约 ${(avail / 60).toFixed(1)} 小时）
${historyLine}

任务列表：
${todoList}

请返回 JSON 格式：
{
  "suggestions": [
    {
      "todoId": "任务ID",
      "suggestedTime": { "startTime": "HH:MM", "endTime": "HH:MM" },
      "reason": "建议理由（简短，≤30 字）",
      "score": 0.95
    }
  ]
}

排序原则（按重要性）：
1. 高优先级任务优先
2. 截止日期临近的优先
3. 能量要求匹配用户当前能量模式
4. 安排时长不得超过今日可用时间总和
5. 同一时间段不重叠多个任务
6. 时间安排在用户工作时段（默认 9:00 起）内连续推进

只返回 JSON，不要其他文字。`;
}

function parseHHMM(hhmm: string): number | undefined {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  if (isNaN(h) || isNaN(m)) return undefined;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function parsePlanningResponse(raw: string): AiPlanningSuggestion[] {
  try {
    // Extract JSON from markdown code blocks if present
    let jsonStr = raw;
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const suggestions = parsed.suggestions ?? parsed;
    if (!Array.isArray(suggestions)) return [];

    return suggestions
      .filter((s: unknown) => s && typeof (s as Record<string, unknown>).todoId === "string")
      .map((s: unknown) => {
        const item = s as Record<string, unknown>;
        const st = item.suggestedTime as Record<string, string> | undefined;
        let suggestedTime: { startTime: number; endTime: number } | undefined;
        if (st) {
          const start = parseHHMM(st.startTime);
          const end = parseHHMM(st.endTime);
          if (start && end) {
            suggestedTime = { startTime: start, endTime: end };
          }
        }
        return {
          todoId: item.todoId as string,
          suggestedTime,
          reason: (item.reason as string) ?? "",
          score: typeof item.score === "number" ? item.score : 0.5,
        };
      });
  } catch {
    return [];
  }
}

export function ruleBasedPlan(
  todos: TodoItem[],
  userEnergyMode: EnergyLevel | null,
  options?: { dailyAvailableMinutes?: number }
): AiPlanningSuggestion[] {
  const pending = todos.filter((t) => t.status === "today" || t.status === "inbox");

  const priorityWeight = { high: 3, medium: 2, low: 1 };
  const energyWeight = { high: 3, medium: 2, low: 1 };
  const modeW = userEnergyMode ? energyWeight[userEnergyMode] : 2;

  const scored = pending.map((todo) => {
    let score = 0;
    // Priority
    score += (priorityWeight[todo.priority] ?? 1) * 10;
    // Deadline proximity
    if (todo.dueAt) {
      const daysUntil = Math.ceil((todo.dueAt - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 1) score += 20;
      else if (daysUntil <= 3) score += 10;
      else if (daysUntil <= 7) score += 5;
    }
    // Energy match
    const todoEnergy = todo.energyLevel ?? "medium";
    const energyDiff = Math.abs(energyWeight[todoEnergy] - modeW);
    score += (3 - energyDiff) * 5;
    // Has time estimate
    if (todo.estimatedMinutes && todo.estimatedMinutes > 0) score += 3;

    return { todo, score: Math.min(score / 50, 1) };
  });

  scored.sort((a, b) => b.score - a.score);

  // Slot tasks starting from 9:00 AM, capped by daily available minutes
  const availableTotal = options?.dailyAvailableMinutes ?? DEFAULT_DAILY_AVAILABLE;
  let remaining = availableTotal;
  let currentHour = 9;
  let currentMin = 0;

  const result: AiPlanningSuggestion[] = [];
  for (const { todo, score } of scored) {
    const duration = todo.estimatedMinutes ?? 60;
    if (remaining <= 0) break;

    const slotDuration = Math.min(duration, remaining);
    const startTime = new Date();
    startTime.setHours(currentHour, currentMin, 0, 0);
    const endTime = new Date(startTime.getTime() + slotDuration * 60 * 1000);

    currentHour = endTime.getHours();
    currentMin = endTime.getMinutes();
    remaining -= slotDuration;

    result.push({
      todoId: todo.id,
      suggestedTime: {
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
      },
      reason: `优先级 ${todo.priority}${todo.dueAt ? " · 即将截止" : ""}${todo.energyLevel ? " · 能量匹配" : ""}`,
      score,
    });
  }
  return result;
}

export async function fetchAiPlan(
  todos: TodoItem[],
  userEnergyMode: EnergyLevel | null,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<AiPlanningSuggestion[]> {
  const dailyAvailableMinutes = settings.dailyAvailableMinutes ?? DEFAULT_DAILY_AVAILABLE;
  const history = computePlanHistoryStats(todos);

  if (!settings.aiEnabled || !settings.apiBaseUrl || !settings.apiKey) {
    return ruleBasedPlan(todos, userEnergyMode, { dailyAvailableMinutes });
  }

  try {
    const prompt = buildPlanningPrompt(todos, userEnergyMode, {
      dailyAvailableMinutes,
      history,
    });
    const body: Record<string, unknown> = {
      model: settings.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: "你是一位高效的时间管理助手。请根据用户提供的任务列表，给出今日最佳执行顺序建议。只返回 JSON。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
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
      },
      FETCH_TIMEOUT
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

    const suggestions = parsePlanningResponse(content);
    if (suggestions.length > 0) return suggestions;
  } catch (err) {
    // 用户主动取消 → 直接向上抛出，由调用方决定（通常什么都不做，保留已有面板状态）
    if (signal?.aborted || (err instanceof Error && (err.name === "AbortError" || err.message === "已取消"))) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    console.warn("AI planning failed, falling back to rule-based:", err);
  }
  // Fallback
  return ruleBasedPlan(todos, userEnergyMode, { dailyAvailableMinutes });
}
