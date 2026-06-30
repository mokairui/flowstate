"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TodoItem } from "@/lib/types";
import { buildWeekDays, getWeekLabel, isSameDay, getDayStart } from "@/lib/calendar-utils";
import CalendarTodoCard from "./CalendarTodoCard";

interface CalendarWeekViewProps {
  todos: TodoItem[];
  onTodoClick: (id: string) => void;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export default function CalendarWeekView({ todos, onTodoClick }: CalendarWeekViewProps) {
  const [anchorDate, setAnchorDate] = useState(() => new Date());

  const weekDays = useMemo(() => buildWeekDays(anchorDate), [anchorDate]);

  const weekLabel = useMemo(() => {
    const start = weekDays[0].date;
    const end = weekDays[6].date;
    return getWeekLabel(start, end);
  }, [weekDays]);

  const goPrev = () => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - 7);
    setAnchorDate(d);
  };

  const goNext = () => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + 7);
    setAnchorDate(d);
  };

  const goToday = () => setAnchorDate(new Date());

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="上一周"
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
            aria-label="下一周"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm font-medium text-text-primary">{weekLabel}</span>
      </div>

      {/* Week columns */}
      <div className="grid flex-1 grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayStart = getDayStart(day.date.getTime());
          const dayTodos = todos.filter((t) => t.dueAt && isSameDay(t.dueAt, dayStart));
          return (
            <div
              key={day.date.getTime()}
              className={`flex flex-col gap-1.5 rounded-xl border p-2 ${
                day.isToday
                  ? "border-primary/20 bg-primary/5"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <div className="text-center">
                <div className="text-[11px] text-text-muted">{WEEKDAYS[day.date.getDay()]}</div>
                <div
                  className={`text-sm font-semibold ${
                    day.isToday ? "text-primary" : "text-text-primary"
                  }`}
                >
                  {day.dayOfMonth}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {dayTodos.map((todo) => (
                  <CalendarTodoCard
                    key={todo.id}
                    todo={todo}
                    compact
                    onClick={() => onTodoClick(todo.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
