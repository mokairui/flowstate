"use client";

import { useState, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TodoItem } from "@/lib/types";
import { buildCalendarDays, getMonthYearLabel, isSameDay, getDayStart } from "@/lib/calendar-utils";
import CalendarTodoCard from "./CalendarTodoCard";

interface CalendarMonthViewProps {
  todos: TodoItem[];
  onTodoClick: (id: string) => void;
  onDueDateChange: (id: string, dueAt: number) => void;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function DayCell({
  day,
  todos,
  onTodoClick,
  onDrop,
}: {
  day: ReturnType<typeof buildCalendarDays>[number];
  todos: TodoItem[];
  onTodoClick: (id: string) => void;
  onDrop: (date: Date) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `day-${day.date.getTime()}`,
    data: { date: day.date, type: "day-cell" },
  });

  const dayStart = getDayStart(day.date.getTime());
  const dayTodos = todos.filter((t) => t.dueAt && isSameDay(t.dueAt, dayStart));
  const visible = dayTodos.slice(0, 3);
  const overflow = dayTodos.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      className={`relative flex min-h-[80px] flex-col gap-1 rounded-lg border p-1.5 transition-colors ${
        day.isCurrentMonth
          ? "border-white/5 bg-white/[0.02]"
          : "border-transparent bg-white/[0.01]"
      } ${isOver ? "border-primary/30 bg-primary/5" : ""} ${
        day.isToday ? "ring-1 ring-primary/20" : ""
      }`}
    >
      <div className="flex items-center justify-between px-0.5">
        <span
          className={`text-[11px] font-medium ${
            day.isToday
              ? "text-primary"
              : day.isCurrentMonth
                ? "text-text-secondary"
                : "text-text-muted/40"
          }`}
        >
          {day.dayOfMonth}
        </span>
        {dayTodos.length > 0 && (
          <span className="text-[10px] text-text-muted">{dayTodos.length}</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {visible.map((todo) => (
          <CalendarTodoCard
            key={todo.id}
            todo={todo}
            compact
            onClick={() => onTodoClick(todo.id)}
          />
        ))}
        {overflow > 0 && (
          <span className="px-1 text-[10px] text-text-muted">+{overflow}</span>
        )}
      </div>
    </div>
  );
}

export default function CalendarMonthView({ todos, onTodoClick, onDueDateChange }: CalendarMonthViewProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const calendarDays = useMemo(
    () => buildCalendarDays(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate]
  );

  const monthYearLabel = useMemo(
    () => getMonthYearLabel(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate]
  );

  const goPrev = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleDrop = (date: Date) => {
    // handled by parent DndContext onDragEnd
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={goPrev}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="上个月"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-text-primary">{monthYearLabel}</span>
        <button
          onClick={goNext}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="下个月"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-1 text-center text-[11px] font-medium text-text-muted"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid flex-1 grid-cols-7 gap-1"
      >
        {calendarDays.map((day, idx) => (
          <DayCell
            key={idx}
            day={day}
            todos={todos}
            onTodoClick={onTodoClick}
            onDrop={handleDrop}
          />
        ))}
      </motion.div>
    </div>
  );
}
