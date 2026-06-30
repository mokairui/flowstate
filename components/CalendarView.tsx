"use client";

import { motion } from "framer-motion";
import type { TodoItem, CalendarViewMode } from "@/lib/types";
import { useFlowState } from "@/lib/store";
import { updateTodo } from "@/lib/db";
import CalendarMonthView from "./CalendarMonthView";
import CalendarWeekView from "./CalendarWeekView";
import CalendarDayView from "./CalendarDayView";

interface CalendarViewProps {
  todos: TodoItem[];
}

const VIEW_TABS: { value: CalendarViewMode; label: string }[] = [
  { value: "month", label: "月" },
  { value: "week", label: "周" },
  { value: "day", label: "日" },
];

export default function CalendarView({ todos }: CalendarViewProps) {
  const { calendarViewMode, setCalendarViewMode, openDetail, updateTodo: updateInStore, showToast } =
    useFlowState();

  const handleDueDateChange = async (id: string, dueAt: number) => {
    try {
      await updateTodo(id, { dueAt });
      updateInStore(id, { dueAt });
      showToast("已调整截止日期", "success");
    } catch {
      showToast("更新失败", "error");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* View switcher */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">日历</h2>
        <div className="flex rounded-xl bg-white/5 p-1">
          {VIEW_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setCalendarViewMode(value)}
              className={`relative rounded-lg px-4 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                calendarViewMode === value
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {calendarViewMode === value && (
                <motion.div
                  layoutId="active-cal-view"
                  className="absolute inset-0 rounded-lg bg-white/10"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        {calendarViewMode === "month" && (
          <CalendarMonthView
            todos={todos}
            onTodoClick={openDetail}
            onDueDateChange={handleDueDateChange}
          />
        )}
        {calendarViewMode === "week" && (
          <CalendarWeekView todos={todos} onTodoClick={openDetail} />
        )}
        {calendarViewMode === "day" && (
          <CalendarDayView todos={todos} onTodoClick={openDetail} />
        )}
      </div>
    </div>
  );
}
