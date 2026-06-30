"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toDateInputValue, formatRelativeDate } from "@/lib/date-utils";

interface PanelPos {
  top: number;
  left: number;
}

interface DatePickerProps {
  value?: number;
  onChange: (timestamp: number | undefined) => void;
  placeholder?: string;
}

/** 获取今天 00:00:00 的时间戳（用于精确比较） */
function getTodayStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function buildCalendarDays(year: number, month: number, selectedTs?: number): CalendarDay[] {
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDayOfMonth.getDay(); // 0 = Sunday

  const todayStart = getTodayStart();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const selectedDate = selectedTs ? new Date(selectedTs) : null;
  const selectedStr = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    : null;

  const days: CalendarDay[] = [];

  // Previous month filler
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    days.push({
      date: d,
      dayOfMonth: d.getDate(),
      isCurrentMonth: false,
      isToday: false,
      isSelected: false,
      isDisabled: dStart < todayStart,
    });
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    days.push({
      date: d,
      dayOfMonth: i,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      isSelected: dStr === selectedStr,
      isDisabled: dStart < todayStart,
    });
  }

  // Next month filler to make 6 rows (42 cells)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    days.push({
      date: d,
      dayOfMonth: d.getDate(),
      isCurrentMonth: false,
      isToday: false,
      isSelected: false,
      isDisabled: dStart < todayStart,
    });
  }

  return days;
}

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

interface CalendarPanelProps {
  panelPos: PanelPos;
  viewDate: Date;
  value?: number;
  monthYearLabel: string;
  calendarDays: CalendarDay[];
  canGoPrevMonth: boolean;
  todayStart: number;
  onClose: () => void;
  onSelect: (day: CalendarDay) => void;
  onQuickSelect: (daysFromNow: number) => void;
  onClear: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

function CalendarPanel({
  panelPos,
  viewDate,
  value,
  monthYearLabel,
  calendarDays,
  canGoPrevMonth,
  onClose,
  onSelect,
  onQuickSelect,
  onClear,
  onPrevMonth,
  onNextMonth,
}: CalendarPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-[100] w-72 origin-top-left overflow-hidden rounded-2xl border border-glass-border bg-surface-solid/95 shadow-glass backdrop-blur-xl"
      style={{ top: panelPos.top, left: panelPos.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <button
          onClick={onPrevMonth}
          disabled={!canGoPrevMonth}
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            canGoPrevMonth
              ? "hover:bg-white/5 hover:text-text-primary"
              : "opacity-30 cursor-not-allowed"
          }`}
          aria-label="上个月"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-text-primary">{monthYearLabel}</span>
        <button
          onClick={onNextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="下个月"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="flex h-8 items-center justify-center text-[11px] font-medium text-text-muted"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5 px-2 pb-2">
        {calendarDays.map((day, idx) => {
          return (
            <button
              key={idx}
              onClick={() => onSelect(day)}
              disabled={day.isDisabled}
              className={`relative flex h-8 items-center justify-center rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                day.isDisabled
                  ? "cursor-not-allowed text-text-muted/25"
                  : day.isSelected
                    ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                    : day.isToday
                      ? "border border-primary/30 text-primary"
                      : day.isCurrentMonth
                        ? "text-text-secondary hover:bg-white/5"
                        : "text-text-muted/50 hover:bg-white/5"
              }`}
              aria-label={`${day.date.getFullYear()}-${day.date.getMonth() + 1}-${day.dayOfMonth}`}
              aria-pressed={day.isSelected}
            >
              {day.dayOfMonth}
            </button>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="border-t border-white/5 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <QuickChip label="今天" onClick={() => onQuickSelect(0)} />
          <QuickChip label="明天" onClick={() => onQuickSelect(1)} />
          <QuickChip label="7天后" onClick={() => onQuickSelect(7)} />
          {value !== undefined && (
            <button
              onClick={onClear}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-danger/30"
              aria-label="清除日期"
            >
              <X className="h-3 w-3" />
              清除
            </button>
          )}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

export default function DatePicker({ value, onChange, placeholder = "选择日期" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value);
    return new Date();
  });
  const [panelPos, setPanelPos] = useState<PanelPos>({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);

  const updatePanelPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 288; // w-72 = 18rem = 288px
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }
    setPanelPos({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (open) {
      updatePanelPos();
      window.addEventListener("scroll", updatePanelPos, true);
      window.addEventListener("resize", updatePanelPos);
      return () => {
        window.removeEventListener("scroll", updatePanelPos, true);
        window.removeEventListener("resize", updatePanelPos);
      };
    }
  }, [open, updatePanelPos]);

  // Sync viewDate when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [value]);

  const todayStart = useMemo(() => getTodayStart(), []);

  const calendarDays = useMemo(
    () => buildCalendarDays(viewDate.getFullYear(), viewDate.getMonth(), value),
    [viewDate, value]
  );

  const displayValue = useMemo(() => {
    if (!value) return null;
    return toDateInputValue(value);
  }, [value]);

  const displayRelative = useMemo(() => {
    if (!value) return null;
    return formatRelativeDate(value);
  }, [value]);

  const canGoPrevMonth = useMemo(() => {
    const currentYear = viewDate.getFullYear();
    const currentMonth = viewDate.getMonth();
    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    return currentYear > nowYear || (currentYear === nowYear && currentMonth > nowMonth);
  }, [viewDate]);

  const goPrevMonth = useCallback(() => {
    if (!canGoPrevMonth) return;
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, [canGoPrevMonth]);

  const goNextMonth = useCallback(() => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  const handleSelect = useCallback(
    (day: CalendarDay) => {
      if (day.isDisabled) return;
      onChange(day.date.getTime());
      setOpen(false);
    },
    [onChange]
  );

  const handleQuickSelect = useCallback(
    (daysFromNow: number) => {
      const d = new Date();
      d.setDate(d.getDate() + daysFromNow);
      d.setHours(23, 59, 59, 999);
      onChange(d.getTime());
      setOpen(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange(undefined);
    setOpen(false);
  }, [onChange]);

  const monthYearLabel = `${viewDate.getFullYear()}年${viewDate.getMonth() + 1}月`;

  return (
    <div className="relative flex-1">
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-white/[0.02] px-3 py-2 text-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary/30 ${
          open
            ? "border-primary/30 ring-1 ring-primary/30"
            : "border-white/5 hover:border-white/10"
        }`}
        aria-label="选择截止日期"
        aria-expanded={open}
      >
        <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
        {displayValue ? (
          <span className="text-text-primary">{displayValue}</span>
        ) : (
          <span className="text-text-muted">{placeholder}</span>
        )}
        {displayRelative && (
          <span className="ml-auto text-[11px] text-text-muted">{displayRelative}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <CalendarPanel
            panelPos={panelPos}
            viewDate={viewDate}
            value={value}
            monthYearLabel={monthYearLabel}
            calendarDays={calendarDays}
            canGoPrevMonth={canGoPrevMonth}
            todayStart={todayStart}
            onClose={() => setOpen(false)}
            onSelect={handleSelect}
            onQuickSelect={handleQuickSelect}
            onClear={handleClear}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      {label}
    </button>
  );
}
