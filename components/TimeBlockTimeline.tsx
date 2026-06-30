"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock } from "lucide-react";
import type { TodoItem } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";

interface TimeBlockTimelineProps {
  todos: TodoItem[];
  onTodoClick: (id: string) => void;
}

const HOUR_HEIGHT = 56; // px per hour
const START_HOUR = 7;   // 7:00 AM
const END_HOUR = 23;    // 11:00 PM

function getMinutesFromMidnight(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

interface BlockInfo {
  todo: TodoItem;
  top: number;
  height: number;
  overlaps: boolean;
}

export default function TimeBlockTimeline({ todos, onTodoClick }: TimeBlockTimelineProps) {
  const blocks = useMemo(() => {
    const scheduled = todos.filter((t) => t.startTime && t.endTime);
    const infos: BlockInfo[] = [];

    for (const todo of scheduled) {
      if (!todo.startTime || !todo.endTime) continue;
      const startMin = getMinutesFromMidnight(todo.startTime);
      const endMin = getMinutesFromMidnight(todo.endTime);
      const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
      const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 24);

      // Check overlap with already processed blocks
      const overlaps = infos.some((b) => {
        if (!b.todo.startTime || !b.todo.endTime) return false;
        const bStart = getMinutesFromMidnight(b.todo.startTime);
        const bEnd = getMinutesFromMidnight(b.todo.endTime);
        const sStart = startMin;
        const sEnd = endMin;
        return sStart < bEnd && sEnd > bStart;
      });

      infos.push({ todo, top, height, overlaps });
    }

    return infos.sort((a, b) => a.top - b.top);
  }, [todos]);

  const totalHeight = (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT;

  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] py-6">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Clock className="h-3.5 w-3.5" />
          暂无时段规划的任务
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
      <div className="flex">
        {/* Hour labels */}
        <div className="w-12 shrink-0 border-r border-white/5 py-2">
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
            <div
              key={hour}
              className="flex items-start justify-end pr-2 text-[10px] text-text-muted"
              style={{ height: HOUR_HEIGHT }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div className="relative flex-1" style={{ height: totalHeight }}>
          {/* Hour grid lines */}
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-white/5"
              style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
            />
          ))}

          {/* Task blocks */}
          {blocks.map(({ todo, top, height, overlaps }) => {
            const priority = PRIORITY_CONFIG[todo.priority];
            return (
              <motion.button
                key={todo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                onClick={() => onTodoClick(todo.id)}
                className={`absolute left-2 right-2 overflow-hidden rounded-lg border px-3 py-1.5 text-left transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  overlaps
                    ? "border-warning/40 bg-warning/5"
                    : "border-white/5 bg-white/[0.03]"
                }`}
                style={{
                  top: Math.max(top, 0),
                  height: Math.min(height, totalHeight - top),
                }}
                aria-label={`${todo.title} ${formatTimeInput(todo.startTime)} - ${formatTimeInput(todo.endTime)}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${priority.color} ${priority.glow}`} />
                  <span className="truncate text-xs font-medium text-text-primary">{todo.title}</span>
                  {overlaps && (
                    <AlertTriangle className="ml-auto h-3 w-3 shrink-0 text-warning" />
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted">
                  {formatTimeInput(todo.startTime)} – {formatTimeInput(todo.endTime)}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatTimeInput(ts?: number): string {
  if (!ts) return "--:--";
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
