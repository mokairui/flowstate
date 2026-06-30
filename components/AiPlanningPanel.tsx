"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Check, Loader2, BrainCircuit, TrendingUp, RefreshCw } from "lucide-react";
import type { AiPlanningSuggestion, TodoItem } from "@/lib/types";
import { useFlowState } from "@/lib/store";
import { updateTodo } from "@/lib/db";
import { fetchAiPlan, computePlanHistoryStats } from "@/lib/ai-planning";
import { saveSettings } from "@/lib/settings";
import { useScrollLock } from "@/lib/useScrollLock";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const PLAN_SNAPSHOT_KEY = "flowstate_plan_snapshot";

export default function AiPlanningPanel() {
  const {
    todos,
    updateTodo: updateInStore,
    showToast,
    settings,
    setSettings,
    userEnergyMode,
    openDetail,
    isAiPlanningOpen,
    closeAiPlanning,
  } = useFlowState();

  const isOpen = isAiPlanningOpen;
  const onClose = closeAiPlanning;

  const [suggestions, setSuggestions] = useState<AiPlanningSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastEnergyRef = useRef<string | null>(null);

  useScrollLock(isOpen);

  // 7-day stats — memoized off the live todos list
  const stats = useMemo(() => computePlanHistoryStats(todos), [todos]);

  // Generate a fresh plan via AI and persist as the new snapshot.
  // Used by: initial open when no snapshot exists, the "重新规划" button,
  // and the energy-change toast action.
  const loadFreshPlan = useCallback(async () => {
    // Abort any in-flight request first
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setLoading(true);
    try {
      // Read fresh refs each call to avoid stale closures over todos/settings.
      const { todos: liveTodos, settings: liveSettings, userEnergyMode: liveEnergy } =
        useFlowState.getState();
      const result = await fetchAiPlan(liveTodos, liveEnergy, liveSettings, signal);
      if (signal.aborted) return;
      setSuggestions(result);
      setAppliedIds(new Set());
      const now = Date.now();
      setGeneratedAt(now);
      // Persist snapshot so the next open reuses it without a fresh AI call.
      try {
        const snapshot = {
          generatedAt: now,
          userEnergyMode: liveEnergy ?? null,
          suggestions: result,
        };
        localStorage.setItem(PLAN_SNAPSHOT_KEY, JSON.stringify(snapshot));
      } catch {
        // Snapshot write failures are non-fatal — fall through silently.
      }
      // Persist lastPlanGeneratedAt so we don't auto-pop again today
      const next = { ...liveSettings, lastPlanGeneratedAt: now };
      saveSettings(next);
      setSettings(next);
    } catch (err) {
      if (signal.aborted) return;
      // 用户主动取消（关闭面板）→ 静默
      if (err instanceof Error && (err.name === "AbortError" || err.message === "已取消")) {
        return;
      }
      showToast(
        err instanceof Error && err.message ? `AI 规划失败：${err.message}` : "AI 规划失败",
        "error"
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [setSettings, showToast]);

  // On open: try to hydrate from the last saved snapshot; only call AI if no snapshot exists.
  useEffect(() => {
    if (!isOpen) {
      setSuggestions([]);
      setAppliedIds(new Set());
      setGeneratedAt(null);
      abortRef.current?.abort();
      return;
    }

    // Try snapshot first
    try {
      const raw = localStorage.getItem(PLAN_SNAPSHOT_KEY);
      if (raw) {
        const snapshot = JSON.parse(raw) as {
          generatedAt?: number;
          suggestions?: AiPlanningSuggestion[];
        };
        if (snapshot && Array.isArray(snapshot.suggestions)) {
          setSuggestions(snapshot.suggestions);
          setGeneratedAt(snapshot.generatedAt ?? null);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Corrupted snapshot — fall through and fetch fresh.
    }

    // No usable snapshot → run a fresh plan
    loadFreshPlan();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Detect energy mode changes while panel is open — prompt user instead of auto-refetching
  useEffect(() => {
    if (!isOpen) {
      lastEnergyRef.current = null;
      return;
    }
    const cur = userEnergyMode ?? "";
    if (lastEnergyRef.current === null) {
      lastEnergyRef.current = cur;
      return;
    }
    if (lastEnergyRef.current !== cur) {
      lastEnergyRef.current = cur;
      showToast("能量模式已变化，建议重新生成规划", "info", {
        label: "重新规划",
        onClick: () => {
          loadFreshPlan();
        },
      });
    }
  }, [userEnergyMode, isOpen, showToast, closeAiPlanning, loadFreshPlan]);

  const handleApply = async (s: AiPlanningSuggestion) => {
    const todo = todos.find((t) => t.id === s.todoId);
    if (!todo) return;
    try {
      const changes: Partial<TodoItem> = {
        status: "today",
        startTime: s.suggestedTime?.startTime,
        endTime: s.suggestedTime?.endTime,
      };
      await updateTodo(todo.id, changes);
      updateInStore(todo.id, changes);
      setAppliedIds((prev) => new Set(prev).add(s.todoId));
      showToast("已应用建议", "success");
    } catch {
      showToast("应用失败", "error");
    }
  };

  const handleApplyAll = async () => {
    let okCount = 0;
    for (const s of suggestions) {
      if (appliedIds.has(s.todoId)) continue;
      const todo = todos.find((t) => t.id === s.todoId);
      if (!todo) continue;
      try {
        const changes: Partial<TodoItem> = {
          status: "today",
          startTime: s.suggestedTime?.startTime,
          endTime: s.suggestedTime?.endTime,
        };
        await updateTodo(todo.id, changes);
        updateInStore(todo.id, changes);
        okCount++;
      } catch {
        // skip failed ones, continue
      }
    }
    if (okCount > 0) {
      setAppliedIds((prev) => {
        const next = new Set(prev);
        for (const s of suggestions) next.add(s.todoId);
        return next;
      });
      showToast(`已应用 ${okCount} 条建议`, "success");
    } else {
      showToast("无可应用的建议", "info");
    }
  };

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const availMinutes = settings.dailyAvailableMinutes ?? 480;
  const completionPct = Math.round(stats.completionRate * 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-[86] max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-glass-border glass-strong shadow-glass sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[28rem] sm:rounded-none sm:border-l sm:border-t-0"
            role="dialog"
            aria-modal="true"
            aria-label="AI 智能规划"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-text-primary">AI 智能规划</span>
                  {loading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  )}
                  {!loading && suggestions.length > 0 && (
                    <span className="text-[11px] text-text-muted">{suggestions.length} 条建议</span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-white/[0.015] px-5 py-2.5 text-[11px] text-text-muted">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-accent" />
                  历史 7 天完成率：
                  <span className="font-mono text-text-secondary">{completionPct}%</span>
                </span>
                <span className="text-text-muted/60">·</span>
                <span>
                  已完成{" "}
                  <span className="font-mono text-text-secondary">{stats.completed}</span> 个
                </span>
                {stats.avgCompletionMinutes > 0 && (
                  <>
                    <span className="text-text-muted/60">·</span>
                    <span>
                      均时{" "}
                      <span className="font-mono text-text-secondary">
                        {stats.avgCompletionMinutes}m
                      </span>
                    </span>
                  </>
                )}
                <span className="text-text-muted/60">·</span>
                <span>
                  今日可用{" "}
                  <span className="font-mono text-text-secondary">
                    {(availMinutes / 60).toFixed(1)}h
                  </span>
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {loading && suggestions.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-accent" />
                    <p className="text-sm text-text-muted">AI 正在分析任务并生成建议…</p>
                    {/* Skeleton placeholders */}
                    <div className="w-full space-y-2 pt-2">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-16 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!loading && suggestions.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <BrainCircuit className="h-6 w-6 text-text-muted" />
                    <p className="text-sm text-text-muted">暂无可规划的任务</p>
                  </div>
                )}

                {suggestions.map((s) => {
                  const todo = todos.find((t) => t.id === s.todoId);
                  if (!todo) return null;
                  const isApplied = appliedIds.has(s.todoId);
                  return (
                    <motion.div
                      key={s.todoId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-xl border p-3 transition-colors ${
                        isApplied
                          ? "border-success/20 bg-success/[0.03]"
                          : "border-white/5 bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => openDetail(todo.id)}
                            className="text-left text-sm font-medium text-text-primary hover:text-primary focus:outline-none"
                          >
                            {todo.title}
                          </button>
                          {s.suggestedTime && (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-muted">
                              <span className="font-mono text-accent">
                                {formatTime(s.suggestedTime.startTime)} –{" "}
                                {formatTime(s.suggestedTime.endTime)}
                              </span>
                            </div>
                          )}
                          {s.reason && (
                            <p className="mt-1 text-[11px] text-text-muted">{s.reason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleApply(s)}
                          disabled={isApplied}
                          className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                            isApplied
                              ? "bg-success/15 text-success"
                              : "bg-primary/15 text-primary hover:bg-primary/25"
                          }`}
                        >
                          {isApplied ? (
                            <>
                              <Check className="h-3 w-3" />
                              已应用
                            </>
                          ) : (
                            "应用"
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Footer */}
              {suggestions.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-white/5 px-5 py-3">
                  <button
                    onClick={handleApplyAll}
                    className="flex-1 rounded-xl bg-primary/15 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    一键应用全部
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadFreshPlan}
                      disabled={loading}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      重新规划
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 rounded-xl bg-white/5 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
