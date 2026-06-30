"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, X, ChevronDown } from "lucide-react";
import type { RecurrenceRule, RecurrenceFrequency } from "@/lib/types";
import DatePicker from "./DatePicker";

interface RecurrencePickerProps {
  value?: RecurrenceRule;
  onChange: (rule?: RecurrenceRule) => void;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const PRESETS: { label: string; value: RecurrenceFrequency }[] = [
  { label: "每天", value: "daily" },
  { label: "每周", value: "weekly" },
  { label: "每月", value: "monthly" },
];

export default function RecurrencePicker({ value, onChange }: RecurrencePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<RecurrenceRule>(
    value ?? {
      frequency: "daily",
      interval: 1,
      autoCloneTo: "today",
    }
  );

  const displayText = useMemo(() => {
    if (!value) return null;
    return humanizeRecurrence(value);
  }, [value]);

  const handleSave = () => {
    onChange(draft);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setIsOpen(false);
  };

  const toggleDayOfWeek = (day: number) => {
    setDraft((prev) => {
      const current = prev.daysOfWeek ?? [];
      const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
      return { ...prev, daysOfWeek: next.sort((a, b) => a - b) };
    });
  };

  const toggleDayOfMonth = (date: number) => {
    setDraft((prev) => {
      const current = prev.daysOfMonth ?? [];
      const next = current.includes(date) ? current.filter((d) => d !== date) : [...current, date];
      return { ...prev, daysOfMonth: next.sort((a, b) => a - b) };
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-muted">重复</label>
        {value && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-danger/30"
            aria-label="清除重复规则"
          >
            <X className="h-3 w-3" />
            清除
          </button>
        )}
      </div>

      {!value ? (
        <button
          onClick={() => {
            setDraft({ frequency: "daily", interval: 1, autoCloneTo: "today" });
            setIsOpen(true);
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-text-muted transition-all hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-primary/30"
          aria-label="添加重复规则"
        >
          <Repeat className="h-4 w-4 shrink-0" />
          添加重复
        </button>
      ) : (
        <button
          onClick={() => {
            setDraft(value);
            setIsOpen(true);
          }}
          className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm transition-all hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-primary/30"
          aria-label="编辑重复规则"
        >
          <span className="flex items-center gap-2 text-text-primary">
            <Repeat className="h-4 w-4 shrink-0 text-primary" />
            {displayText}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed left-1/2 top-1/2 z-[96] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-glass-border glass-strong shadow-glass"
              role="dialog"
              aria-modal="true"
              aria-label="重复规则设置"
            >
              <div className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">重复规则</span>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg p-1 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Frequency presets */}
                <div className="flex gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setDraft((prev) => ({ ...prev, frequency: p.value }))}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                        draft.frequency === p.value
                          ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                          : "bg-white/5 text-text-secondary hover:bg-white/8"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Interval */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted">每</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={draft.interval}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1) {
                        setDraft((prev) => ({ ...prev, interval: val }));
                      }
                    }}
                    className="h-8 w-16 rounded-lg border border-white/5 bg-white/[0.02] px-2 text-center text-sm text-text-primary focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <span className="text-xs text-text-muted">
                    {draft.frequency === "daily" && "天"}
                    {draft.frequency === "weekly" && "周"}
                    {draft.frequency === "monthly" && "月"}
                  </span>
                </div>

                {/* Weekly: days of week */}
                <AnimatePresence mode="wait">
                  {draft.frequency === "weekly" && (
                    <motion.div
                      key="weekly"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <span className="text-xs text-text-muted">星期</span>
                      <div className="flex gap-1">
                        {WEEKDAYS.map((label, idx) => {
                          const isSelected = draft.daysOfWeek?.includes(idx) ?? false;
                          return (
                            <button
                              key={idx}
                              onClick={() => toggleDayOfWeek(idx)}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                                isSelected
                                  ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                                  : "bg-white/5 text-text-secondary hover:bg-white/8"
                              }`}
                              aria-pressed={isSelected}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {draft.frequency === "monthly" && (
                    <motion.div
                      key="monthly"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <span className="text-xs text-text-muted">日期</span>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => {
                          const isSelected = draft.daysOfMonth?.includes(date) ?? false;
                          return (
                            <button
                              key={date}
                              onClick={() => toggleDayOfMonth(date)}
                              className={`flex h-7 items-center justify-center rounded-lg text-[11px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                                isSelected
                                  ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                                  : "bg-white/5 text-text-secondary hover:bg-white/8"
                              }`}
                              aria-pressed={isSelected}
                            >
                              {date}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Auto clone target */}
                <div className="space-y-2">
                  <span className="text-xs text-text-muted">自动添加到</span>
                  <div className="flex gap-2">
                    {(["today", "inbox"] as const).map((target) => (
                      <button
                        key={target}
                        onClick={() => setDraft((prev) => ({ ...prev, autoCloneTo: target }))}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                          draft.autoCloneTo === target
                            ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                            : "bg-white/5 text-text-secondary hover:bg-white/8"
                        }`}
                      >
                        {target === "today" ? "Today" : "Inbox"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* End date */}
                <div className="space-y-2">
                  <span className="text-xs text-text-muted">终止日期（可选）</span>
                  <DatePicker
                    value={draft.endDate}
                    onChange={(ts) => setDraft((prev) => ({ ...prev, endDate: ts }))}
                    placeholder="不限制"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 rounded-xl bg-white/5 px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 rounded-xl bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    保存
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function humanizeRecurrence(rule: RecurrenceRule): string {
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
      if (!rule.daysOfMonth || rule.daysOfMonth.length === 0) return `每月${target}`;
      const days = rule.daysOfMonth.join("、");
      return `每月 ${days} 日${target}`;
    }
    case "custom":
      return `自定义循环${target}`;
    default:
      return `循环${target}`;
  }
}
