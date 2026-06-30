"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock } from "lucide-react";
import type { TodoItem } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";
import { getUpcomingDeadlines, detectConflicts, groupByDate, formatDateShort } from "@/lib/deadline-utils";

interface DeadlineTimelineProps {
  todos: TodoItem[];
  daysAhead: 7 | 14 | 30;
  onTodoClick: (id: string) => void;
}

export default function DeadlineTimeline({ todos, daysAhead, onTodoClick }: DeadlineTimelineProps) {
  const upcoming = useMemo(() => getUpcomingDeadlines(todos, daysAhead), [todos, daysAhead]);
  const conflicts = useMemo(() => detectConflicts(upcoming), [upcoming]);
  const grouped = useMemo(() => groupByDate(upcoming), [upcoming]);
  const conflictDates = useMemo(() => new Set(conflicts.map((c) => c.date)), [conflicts]);

  if (upcoming.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] py-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Clock className="h-3.5 w-3.5" />
          未来 {daysAhead} 天内没有截止任务
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">
          截止时间表 · 未来 {daysAhead} 天
        </span>
        {conflicts.length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
            <AlertTriangle className="h-3 w-3" />
            {conflicts.length} 个冲突
          </span>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from(grouped.entries()).map(([date, dayTodos]) => {
          const hasConflict = conflictDates.has(date);
          return (
            <motion.div
              key={date}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex w-40 shrink-0 flex-col gap-1.5 rounded-xl border p-2 ${
                hasConflict
                  ? "border-warning/20 bg-warning/[0.03]"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">{formatDateShort(date)}</span>
                {hasConflict && (
                  <AlertTriangle className="h-3 w-3 text-warning" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                {dayTodos.map((todo) => {
                  const priority = PRIORITY_CONFIG[todo.priority];
                  return (
                    <button
                      key={todo.id}
                      onClick={() => onTodoClick(todo.id)}
                      className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-left transition-colors hover:bg-white/8 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priority.color}`} />
                      <span className="truncate text-[11px] text-text-primary">{todo.title}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
