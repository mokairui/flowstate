"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, X } from "lucide-react";

interface TimeBlockPickerProps {
  dueAt?: number;
  startTime?: number;
  endTime?: number;
  estimatedMinutes?: number;
  onChange: (start?: number, end?: number) => void;
}

interface PanelPos {
  top: number;
  left: number;
}

/** 将时间戳转为 HH:MM 字符串 */
function formatTimeInput(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** 将 HH:MM 字符串解析为基于 baseDate 的时间戳 */
function parseTimeInput(timeStr: string, baseDate: number): number | undefined {
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return undefined;
  const base = new Date(baseDate);
  base.setHours(h, m, 0, 0);
  return base.getTime();
}

/** 将小时+分钟组合为 HH:MM 字符串 */
function toTimeStr(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

// ── Quick presets ──
const TIME_PRESETS = [
  { label: "09:00", hour: 9, minute: 0 },
  { label: "10:00", hour: 10, minute: 0 },
  { label: "14:00", hour: 14, minute: 0 },
  { label: "15:00", hour: 15, minute: 0 },
  { label: "18:00", hour: 18, minute: 0 },
  { label: "20:00", hour: 20, minute: 0 },
];

// ── Hour/minute options ──
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// ── TimePickerPanel ──
interface TimePickerPanelProps {
  panelPos: PanelPos;
  currentHour: number;
  currentMinute: number;
  onClose: () => void;
  onSelect: (hour: number, minute: number) => void;
  onClear: () => void;
  hasValue: boolean;
}

function TimePickerPanel({
  panelPos,
  currentHour,
  currentMinute,
  onClose,
  onSelect,
  onClear,
  hasValue,
}: TimePickerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Scroll selected hour/minute into view
  useEffect(() => {
    if (hourScrollRef.current) {
      const el = hourScrollRef.current.querySelector(`[data-hour="${currentHour}"]`);
      el?.scrollIntoView({ block: "center" });
    }
    if (minuteScrollRef.current) {
      const el = minuteScrollRef.current.querySelector(`[data-minute="${currentMinute}"]`);
      el?.scrollIntoView({ block: "center" });
    }
  }, [currentHour, currentMinute]);

  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-[100] w-56 origin-top-left overflow-hidden rounded-2xl border border-glass-border bg-surface-solid/95 shadow-glass backdrop-blur-xl"
      style={{ top: panelPos.top, left: panelPos.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <span className="text-sm font-medium text-text-primary">选择时间</span>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Current time preview */}
      <div className="border-b border-white/5 px-3 py-2">
        <span className="font-mono text-lg font-medium text-text-primary">
          {toTimeStr(currentHour, currentMinute)}
        </span>
      </div>

      {/* Hour + Minute columns */}
      <div className="flex border-b border-white/5">
        {/* Hours */}
        <div
          ref={hourScrollRef}
          className="h-40 w-1/2 overflow-y-auto border-r border-white/5 py-1"
        >
          {HOURS.map((h) => (
            <button
              key={h}
              data-hour={h}
              onClick={() => onSelect(h, currentMinute)}
              className={`flex w-full items-center justify-center py-1.5 text-sm font-medium transition-colors focus:outline-none ${
                h === currentHour
                  ? "bg-primary/15 text-primary"
                  : "text-text-secondary hover:bg-white/5"
              }`}
            >
              {h.toString().padStart(2, "0")}
            </button>
          ))}
        </div>

        {/* Minutes */}
        <div
          ref={minuteScrollRef}
          className="h-40 w-1/2 overflow-y-auto py-1"
        >
          {MINUTES.map((m) => (
            <button
              key={m}
              data-minute={m}
              onClick={() => onSelect(currentHour, m)}
              className={`flex w-full items-center justify-center py-1.5 text-sm font-medium transition-colors focus:outline-none ${
                m === currentMinute
                  ? "bg-primary/15 text-primary"
                  : "text-text-secondary hover:bg-white/5"
              }`}
            >
              {m.toString().padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>

      {/* Quick presets + Clear */}
      <div className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onSelect(p.hour, p.minute)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                currentHour === p.hour && currentMinute === p.minute
                  ? "bg-primary/15 text-primary"
                  : "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary"
              }`}
            >
              {p.label}
            </button>
          ))}
          {hasValue && (
            <button
              onClick={onClear}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-danger/30"
              aria-label="清除时间"
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

// ── TimeTrigger + TimePicker wrapper ──
interface TimeFieldProps {
  value?: number;
  baseDate: number;
  placeholder: string;
  ariaLabel: string;
  onChange: (ts?: number) => void;
}

function TimeField({ value, baseDate, placeholder, ariaLabel, onChange }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPos>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const displayValue = useMemo(() => {
    if (!value) return null;
    return formatTimeInput(value);
  }, [value]);

  const currentHour = value ? new Date(value).getHours() : 9;
  const currentMinute = value ? new Date(value).getMinutes() : 0;

  const updatePanelPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 224; // w-56 = 14rem = 224px
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

  const handleSelect = useCallback(
    (hour: number, minute: number) => {
      const base = new Date(baseDate);
      base.setHours(hour, minute, 0, 0);
      onChange(base.getTime());
    },
    [baseDate, onChange]
  );

  const handleClear = useCallback(() => {
    onChange(undefined);
    setOpen(false);
  }, [onChange]);

  return (
    <div className="relative flex-1">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-white/[0.02] px-3 py-2 text-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary/30 ${
          open
            ? "border-primary/30 ring-1 ring-primary/30"
            : "border-white/5 hover:border-white/10"
        }`}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <Clock className="h-4 w-4 shrink-0 text-text-muted" />
        {displayValue ? (
          <span className="text-text-primary">{displayValue}</span>
        ) : (
          <span className="text-text-muted">{placeholder}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <TimePickerPanel
            panelPos={panelPos}
            currentHour={currentHour}
            currentMinute={currentMinute}
            onClose={() => setOpen(false)}
            onSelect={(h, m) => {
              handleSelect(h, m);
              setOpen(false);
            }}
            onClear={handleClear}
            hasValue={value !== undefined}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── TimeBlockPicker ──
export default function TimeBlockPicker({
  dueAt,
  startTime,
  endTime,
  estimatedMinutes,
  onChange,
}: TimeBlockPickerProps) {
  const baseDate = dueAt ?? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

  // Auto-calculate end time when start changes and estimatedMinutes exists
  useEffect(() => {
    if (startTime && estimatedMinutes && !endTime) {
      const end = startTime + estimatedMinutes * 60 * 1000;
      onChange(startTime, end);
    }
  }, []); // Only on mount

  const handleStartChange = (ts?: number) => {
    if (ts !== undefined) {
      if (estimatedMinutes && estimatedMinutes > 0) {
        const calculatedEnd = ts + estimatedMinutes * 60 * 1000;
        onChange(ts, calculatedEnd);
      } else {
        onChange(ts, endTime);
      }
    } else {
      onChange(undefined, endTime);
    }
  };

  const handleEndChange = (ts?: number) => {
    onChange(startTime, ts);
  };

  const handleClear = () => {
    onChange(undefined, undefined);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-muted">时段规划</label>
        {(startTime || endTime) && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-danger/30"
            aria-label="清除时段"
          >
            <X className="h-3 w-3" />
            清除
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TimeField
          value={startTime}
          baseDate={baseDate}
          placeholder="开始时间"
          ariaLabel="选择开始时间"
          onChange={handleStartChange}
        />
        <span className="text-xs text-text-muted">–</span>
        <TimeField
          value={endTime}
          baseDate={baseDate}
          placeholder="结束时间"
          ariaLabel="选择结束时间"
          onChange={handleEndChange}
        />
      </div>
      {estimatedMinutes && estimatedMinutes > 0 && (
        <p className="text-[11px] text-text-muted">
          预计耗时 {estimatedMinutes} 分钟
        </p>
      )}
    </div>
  );
}
