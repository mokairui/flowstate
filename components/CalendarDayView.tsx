"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TodoItem } from "@/lib/types";
import { isSameDay, getDayStart } from "@/lib/calendar-utils";
import CalendarTodoCard from "./CalendarTodoCard";
import TimeBlockTimeline from "./TimeBlockTimeline";

interface CalendarDayViewProps {
  todos: TodoItem[];
  onTodoClick: (id: string) => void;
}

export default function CalendarDayView({ todos, onTodoClick }: CalendarDayViewProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const dayStart = useMemo(() => getDayStart(viewDate.getTime()), [viewDate]);

  const dayTodos = useMemo(
    () => todos.filter((t) => t.dueAt && isSameDay(t.dueAt, dayStart)),
    [todos, dayStart]
  );

  const dateLabel = useMemo(() => {
    const d = viewDate;
    const today = new Date();
    const isToday = isSameDay(d.getTime(), today.getTime());
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const label = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${weekdays[d.getDay()]}`;
    return isToday ? `${label} · 今天` : label;
  }, [viewDate]);

  const goPrev = () => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() - 1);
    setViewDate(d);
  };

  const goNext = () => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + 1);
    setViewDate(d);
  };

  const goToday = () => setViewDate(new Date());

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="前一天"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            今天
          </button>
          <button
            onClick={goNext}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="后一天"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm font-medium text-text-primary">{dateLabel}</span>
      </div>

      {/* Time block timeline */}
      <TimeBlockTimeline todos={dayTodos} onTodoClick={onTodoClick} />

      {/* Task list for the day */}
      <div className="flex-1 overflow-y-auto">
        <div className="mb-2 text-xs font-medium text-text-muted">
          当日任务 ({dayTodos.length})
        </div>
        <div className="flex flex-col gap-2">
          {dayTodos.map((todo) => (
            <CalendarTodoCard
              key={todo.id}
              todo={todo}
              onClick={() => onTodoClick(todo.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
