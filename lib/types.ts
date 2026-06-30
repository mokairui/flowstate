export type TodoStatus = "inbox" | "today" | "doing" | "done" | "archived" | "error";
export type TodoPriority = "low" | "medium" | "high";
export type TodoSource = "text" | "voice" | "ai_split";
export type AiProcessStatus = "idle" | "processing" | "success" | "error";
export type EnergyLevel = "high" | "medium" | "low";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "custom";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  cronExpression?: string;
  interval: number;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  endDate?: number;
  autoCloneTo: "inbox" | "today";
  lastGenerated?: number;
}

export type CalendarViewMode = "month" | "week" | "day";

export interface AiPlanningSuggestion {
  todoId: string;
  suggestedTime?: { startTime: number; endTime: number };
  reason: string;
  score: number;
}

export interface TodoAiSummary {
  title?: string;
  tags?: string[];
  priority?: TodoPriority;
  dueAt?: number;
  /**
   * @deprecated F-2 起子任务以实体形式存储在 `TodoItem.subtasks: SubtaskItem[]`。
   * 此字段仅作为历史快照保留，新代码不应写入；导入旧版 JSON 时由 db 迁移逻辑搬运。
   */
  subtasks?: string[];
  action?: string;
  context?: string;
  suggestedNextStep?: string;
  relatedFiles?: string[];
  relatedSymbols?: string[];
}

/** F-2 子任务实体。来源 ai 表示由 AI 拆分生成，manual 表示用户手工添加。 */
export interface SubtaskItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
  createdAt: number;
  completedAt?: number;
  source: "ai" | "manual";
}

export interface Project {
  id: string;
  name: string;
  color?: string;
  order: number;
  createdAt: number;
}

export interface TodoItem {
  id: string;
  title: string;
  rawInput: string;
  note?: string;
  status: TodoStatus;
  priority: TodoPriority;
  tags: string[];
  source: TodoSource;
  order: number;
  createdAt: number;
  updatedAt: number;
  dueAt?: number;
  completedAt?: number;
  archivedAt?: number;
  aiSummary?: TodoAiSummary;
  aiStatus: AiProcessStatus;
  errorMessage?: string;
  /** 2.2 番茄钟 */
  pomodoros?: number;
  totalFocusTime?: number; // 秒
  /** 2.3 预计耗时 */
  estimatedMinutes?: number;
  /** 2.4 项目分组 */
  projectId?: string;
  /** 2.10 能量等级 */
  energyLevel?: EnergyLevel;
  /** 3.1 循环任务 */
  recurrenceRule?: RecurrenceRule;
  isRecurringTemplate?: boolean;
  /** 3.2 时段规划 */
  startTime?: number;
  endTime?: number;
  /** F-2 子任务实体。空数组与 undefined 等价。 */
  subtasks?: SubtaskItem[];
}

export interface AppSettings {
  theme: "system" | "dark" | "light";
  aiEnabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  autoParse: boolean;
  quickCaptureShortcut: string;
  speechEnabled: boolean;
  speechLang: string;
  ttsEnabled: boolean;
  ttsLang: string;
  ambientMotionEnabled: boolean;
  /** 2.6 每日回顾 */
  lastReviewedAt?: number;
  /** 2.10 用户能量模式 */
  userEnergyMode?: EnergyLevel;
  /** F-1 AI 每日规划助手 */
  lastPlanGeneratedAt?: number;
  /** F-1 今日可用时间（分钟），默认 480 = 8h */
  dailyAvailableMinutes?: number;
  /** F-1 是否在每天首次启动时自动唤起规划面板 */
  autoOpenDailyPlan?: boolean;
}

export interface TodoFilter {
  status: TodoStatus | "all";
}

export const TODO_STATUSES: { value: TodoStatus; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "today", label: "Today" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

export const PRIORITY_CONFIG: Record<
  TodoPriority,
  { label: string; color: string; glow: string }
> = {
  low: { label: "低", color: "bg-text-muted", glow: "shadow-none" },
  medium: { label: "中", color: "bg-warning", glow: "shadow-[var(--priority-medium-glow)]" },
  high: { label: "高", color: "bg-danger", glow: "shadow-[var(--priority-high-glow)]" },
};

export const ENERGY_CONFIG: Record<
  EnergyLevel,
  { label: string; color: string; bgColor: string }
> = {
  high: { label: "高精力", color: "text-danger", bgColor: "bg-danger/10" },
  medium: { label: "中等", color: "text-warning", bgColor: "bg-warning/10" },
  low: { label: "低精力", color: "text-success", bgColor: "bg-success/10" },
};
