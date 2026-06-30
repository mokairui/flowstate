import type { TodoItem } from "./types";
import { getDayStart } from "./calendar-utils";

export interface ConflictInfo {
  date: number;
  highPriorityCount: number;
  totalEstimatedMinutes: number;
  overlappingPairs: [string, string][];
}

export function getUpcomingDeadlines(todos: TodoItem[], daysAhead: number): TodoItem[] {
  const now = Date.now();
  const cutoff = now + daysAhead * 24 * 60 * 60 * 1000;
  return todos
    .filter((t) => !t.isRecurringTemplate && t.dueAt && t.dueAt >= now && t.dueAt <= cutoff)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

export function groupByDate(todos: TodoItem[]): Map<number, TodoItem[]> {
  const groups = new Map<number, TodoItem[]>();
  for (const todo of todos) {
    if (!todo.dueAt) continue;
    const dayStart = getDayStart(todo.dueAt);
    const existing = groups.get(dayStart) ?? [];
    existing.push(todo);
    groups.set(dayStart, existing);
  }
  return groups;
}

export function detectConflicts(todos: TodoItem[]): ConflictInfo[] {
  const groups = groupByDate(todos);
  const conflicts: ConflictInfo[] = [];

  for (const [date, dayTodos] of groups) {
    const highPriorityCount = dayTodos.filter((t) => t.priority === "high").length;
    const totalEstimatedMinutes = dayTodos.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);

    const overlappingPairs: [string, string][] = [];
    const scheduled = dayTodos.filter((t) => t.startTime && t.endTime);
    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = scheduled[i];
        const b = scheduled[j];
        if (a.startTime && a.endTime && b.startTime && b.endTime) {
          if (a.startTime < b.endTime && a.endTime > b.startTime) {
            overlappingPairs.push([a.id, b.id]);
          }
        }
      }
    }

    const hasConflict = highPriorityCount >= 2 || totalEstimatedMinutes > 480 || overlappingPairs.length > 0;

    if (hasConflict) {
      conflicts.push({
        date,
        highPriorityCount,
        totalEstimatedMinutes,
        overlappingPairs,
      });
    }
  }

  return conflicts.sort((a, b) => a.date - b.date);
}

export function formatDateShort(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return "今天";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
