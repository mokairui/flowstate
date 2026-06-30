"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Calendar, Archive, Trash2 } from "lucide-react";
import { useFlowState } from "@/lib/store";
import { updateTodo } from "@/lib/db";
import { saveSettings } from "@/lib/settings";
import type { TodoItem } from "@/lib/types";

export default function DailyReview() {
  const {
    todos,
    settings,
    setSettings,
    updateTodo: updateInStore,
    showToast,
    closeDetail,
  } = useFlowState();

  const [isOpen, setIsOpen] = useState(false);
  const [staleTodos, setStaleTodos] = useState<TodoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    // Already reviewed today?
    if (settings.lastReviewedAt && settings.lastReviewedAt >= todayTs) {
      return;
    }

    // Find stale tasks (yesterday or earlier, status today/doing)
    const stale = todos.filter((t) => {
      if (t.status !== "today" && t.status !== "doing") return false;
      const created = new Date(t.createdAt);
      created.setHours(0, 0, 0, 0);
      return created.getTime() < todayTs;
    });

    if (stale.length > 0) {
      setStaleTodos(stale);
      setIsOpen(true);
    } else {
      // No stale tasks, mark as reviewed
      const next = { ...settings, lastReviewedAt: Date.now() };
      saveSettings(next);
      setSettings(next);
    }
  }, [todos, settings, setSettings]);

  const handlePushAllToToday = async () => {
    try {
      for (const todo of staleTodos) {
        await updateTodo(todo.id, { status: "today" });
        updateInStore(todo.id, { status: "today" });
      }
      showToast(`已推进 ${staleTodos.length} 个任务到 Today`, "success");
      closeAndMarkReviewed();
    } catch {
      showToast("推进失败", "error");
    }
  };

  const handlePostponeAll = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    const dueAt = tomorrow.getTime();

    try {
      for (const todo of staleTodos) {
        await updateTodo(todo.id, { status: "today", dueAt });
        updateInStore(todo.id, { status: "today", dueAt });
      }
      showToast(`已推迟 ${staleTodos.length} 个任务到明天`, "success");
      closeAndMarkReviewed();
    } catch {
      showToast("推迟失败", "error");
    }
  };

  const handleAction = async (action: "today" | "archive" | "delete", todo: TodoItem) => {
    try {
      if (action === "today") {
        await updateTodo(todo.id, { status: "today" });
        updateInStore(todo.id, { status: "today" });
      } else if (action === "archive") {
        await updateTodo(todo.id, { status: "archived", archivedAt: Date.now() });
        updateInStore(todo.id, { status: "archived", archivedAt: Date.now() });
      } else if (action === "delete") {
        const { deleteTodo } = await import("@/lib/db");
        await deleteTodo(todo.id);
        updateInStore(todo.id, {}); // trigger remove
      }
      setStaleTodos((prev) => prev.filter((t) => t.id !== todo.id));
      if (currentIndex >= staleTodos.length - 1) {
        setCurrentIndex(Math.max(0, staleTodos.length - 2));
      }
    } catch {
      showToast("操作失败", "error");
    }
  };

  const closeAndMarkReviewed = () => {
    const next = { ...settings, lastReviewedAt: Date.now() };
    saveSettings(next);
    setSettings(next);
    setIsOpen(false);
    closeDetail();
  };

  if (!isOpen || staleTodos.length === 0) return null;

  const current = staleTodos[currentIndex];
  const remaining = staleTodos.length - currentIndex;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[87] bg-black/50 backdrop-blur-sm"
            onClick={closeAndMarkReviewed}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[15vh] z-[88] w-full max-w-lg -translate-x-1/2 px-4"
          >
            <div className="glass-strong rounded-2xl p-5 shadow-glass">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-text-primary">每日回顾</h3>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-text-muted">
                    {remaining} 个滞留任务
                  </span>
                </div>
                <button
                  onClick={closeAndMarkReviewed}
                  className="rounded-lg p-1 text-text-muted hover:text-text-primary focus:outline-none"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-2 text-xs text-text-muted">
                以下任务已滞留，请决定如何处理。
              </p>

              {/* Batch actions */}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handlePushAllToToday}
                  className="flex-1 rounded-xl bg-primary/15 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                >
                  全部推进到今天
                </button>
                <button
                  onClick={handlePostponeAll}
                  className="flex-1 rounded-xl bg-white/5 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/8"
                >
                  全部推迟到明天
                </button>
              </div>

              {/* Current task */}
              {current && (
                <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-sm font-medium text-text-primary">{current.title}</p>
                  {current.rawInput !== current.title && (
                    <p className="mt-1 text-xs text-text-secondary">{current.rawInput}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleAction("today", current)}
                      className="flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-1.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/25"
                    >
                      <ArrowRight className="h-3 w-3" />
                      推进
                    </button>
                    <button
                      onClick={() => handleAction("archive", current)}
                      className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-medium text-text-secondary transition-colors hover:bg-white/8"
                    >
                      <Archive className="h-3 w-3" />
                      归档
                    </button>
                    <button
                      onClick={() => handleAction("delete", current)}
                      className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-medium text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" />
                      删除
                    </button>
                  </div>
                </div>
              )}

              {/* Progress */}
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${((staleTodos.length - remaining) / staleTodos.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-text-muted">
                  {staleTodos.length - remaining + 1} / {staleTodos.length}
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
