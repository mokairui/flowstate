import type { TodoItem, RecurrenceRule, RecurrenceFrequency } from "./types";
import { v4 as uuidv4 } from "uuid";

/** 判断某条规则在今天是否需要生成实例 */
export function shouldGenerateToday(rule: RecurrenceRule): boolean {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // 如果已设置终止日期且已过，不再生成
  if (rule.endDate && todayStart > rule.endDate) return false;

  // 如果从未生成过，需要生成
  if (!rule.lastGenerated) return true;

  const lastGen = new Date(rule.lastGenerated);
  const lastGenStart = new Date(lastGen.getFullYear(), lastGen.getMonth(), lastGen.getDate()).getTime();

  // 如果今天已经生成过了
  if (lastGenStart === todayStart) return false;

  const diffDays = Math.floor((todayStart - lastGenStart) / (1000 * 60 * 60 * 24));

  switch (rule.frequency) {
    case "daily":
      return diffDays >= rule.interval;
    case "weekly": {
      if (diffDays < 7 * rule.interval) return false;
      if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) return true;
      const todayWeekday = now.getDay();
      return rule.daysOfWeek.includes(todayWeekday);
    }
    case "monthly": {
      if (!rule.daysOfMonth || rule.daysOfMonth.length === 0) {
        // 默认每月同一天
        return diffDays >= 28; // 粗略判断
      }
      const todayDate = now.getDate();
      return rule.daysOfMonth.includes(todayDate);
    }
    case "custom":
      // v2 预留：cron 表达式解析
      return false;
    default:
      return false;
  }
}

/** 计算下一个到期日（用于生成实例的 dueAt） */
export function getNextDueDate(rule: RecurrenceRule, from: number): number {
  const base = new Date(from);
  const today = new Date();

  switch (rule.frequency) {
    case "daily": {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      return d.getTime();
    }
    case "weekly": {
      if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        return d.getTime();
      }
      // 找到本周内下一个匹配的星期几
      const todayWeekday = today.getDay();
      const sorted = [...rule.daysOfWeek].sort((a, b) => a - b);
      let targetDay = sorted.find((d) => d > todayWeekday);
      if (targetDay === undefined) {
        targetDay = sorted[0]; // 下周的第一个
      }
      const diff = targetDay - todayWeekday;
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff, 23, 59, 59, 999);
      return d.getTime();
    }
    case "monthly": {
      if (!rule.daysOfMonth || rule.daysOfMonth.length === 0) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        return d.getTime();
      }
      const todayDate = today.getDate();
      const sorted = [...rule.daysOfMonth].sort((a, b) => a - b);
      let targetDate = sorted.find((d) => d > todayDate);
      if (targetDate === undefined) {
        // 下个月的第一个
        targetDate = sorted[0];
        const d = new Date(today.getFullYear(), today.getMonth() + 1, targetDate, 23, 59, 59, 999);
        return d.getTime();
      }
      const d = new Date(today.getFullYear(), today.getMonth(), targetDate, 23, 59, 59, 999);
      return d.getTime();
    }
    case "custom":
      return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime();
    default:
      return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime();
  }
}

/** 从模板克隆一个新的 Todo 实例 */
export function generateInstance(template: TodoItem): TodoItem {
  const now = Date.now();
  const dueAt = template.recurrenceRule
    ? getNextDueDate(template.recurrenceRule, now)
    : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 23, 59, 59, 999).getTime();

  return {
    ...template,
    id: uuidv4(),
    status: template.recurrenceRule?.autoCloneTo ?? "inbox",
    createdAt: now,
    updatedAt: now,
    dueAt,
    completedAt: undefined,
    archivedAt: undefined,
    isRecurringTemplate: false,
    recurrenceRule: undefined,
    pomodoros: 0,
    totalFocusTime: 0,
    aiStatus: "idle",
    aiSummary: undefined,
    errorMessage: undefined,
    // 保留 order 以便出现在列表顶部
    order: template.order,
  };
}

/** 生成人类可读的重复描述 */
export function humanizeRecurrence(rule: RecurrenceRule): string {
  const target = rule.autoCloneTo === "today" ? " → Today" : " → Inbox";

  switch (rule.frequency) {
    case "daily":
      return rule.interval === 1 ? `每天${target}` : `每 ${rule.interval} 天${target}`;
    case "weekly": {
      if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) {
        return rule.interval === 1 ? `每周${target}` : `每 ${rule.interval} 周${target}`;
      }
      const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
      const days = rule.daysOfWeek.map((d) => weekdays[d]).join("、");
      return `每周 ${days}${target}`;
    }
    case "monthly": {
      if (!rule.daysOfMonth || rule.daysOfMonth.length === 0) {
        return `每月${target}`;
      }
      const days = rule.daysOfMonth.join("、");
      return `每月 ${days} 日${target}`;
    }
    case "custom":
      return `自定义循环${target}`;
    default:
      return `循环${target}`;
  }
}

/** 检查所有模板并返回需要生成的新任务 */
export function checkRecurringTemplates(todos: TodoItem[]): TodoItem[] {
  const templates = todos.filter((t) => t.isRecurringTemplate && t.recurrenceRule);
  const newInstances: TodoItem[] = [];

  for (const template of templates) {
    if (!template.recurrenceRule) continue;
    if (shouldGenerateToday(template.recurrenceRule)) {
      const instance = generateInstance(template);
      newInstances.push(instance);
    }
  }

  return newInstances;
}
