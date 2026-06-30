"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { updateTodo } from "@/lib/db";
import { useFlowState } from "@/lib/store";
import { generateSubtasksForTodo, truncateError } from "@/lib/ai";
import type { SubtaskItem, TodoItem } from "@/lib/types";

interface SubtaskListProps {
  todo: TodoItem;
}

/**
 * F-2 子任务交互列表：复选框 + 拖拽排序 + 内联编辑 + 删除 + 添加 + AI 拆分。
 * 写入严格走 "await Dexie → Zustand → 失败仅 Toast" 两步。
 */
export default function SubtaskList({ todo }: SubtaskListProps) {
  const {
    updateTodo: updateInStore,
    showToast,
    settings,
  } = useFlowState();

  const subtasks = useMemo<SubtaskItem[]>(
    () =>
      (todo.subtasks ?? [])
        .slice()
        .sort((a, b) => a.order - b.order),
    [todo.subtasks]
  );

  const [draft, setDraft] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const lastAllDoneRef = useRef(allDone(subtasks));
  const aiAbortRef = useRef<AbortController | null>(null);

  // 主任务自身在外部被改完成态后，重置 "全勾完成" 检测基线。
  useEffect(() => {
    if (todo.status === "done") {
      lastAllDoneRef.current = true;
    }
  }, [todo.status]);

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  /** 通用持久化：先 Dexie 再 Zustand，失败仅 Toast。 */
  const persist = async (next: SubtaskItem[]): Promise<boolean> => {
    try {
      await updateTodo(todo.id, { subtasks: next });
      updateInStore(todo.id, { subtasks: next, updatedAt: Date.now() });
      // 全部完成 → 询问是否标记主任务完成
      const nextAllDone = allDone(next);
      if (
        nextAllDone &&
        !lastAllDoneRef.current &&
        next.length > 0 &&
        todo.status !== "done" &&
        todo.status !== "archived"
      ) {
        showToast("🎉 全部子任务完成，是否将主任务标记为完成？", "success", {
          label: "标记完成",
          onClick: () => void markMainDone(),
        });
      }
      lastAllDoneRef.current = nextAllDone;
      return true;
    } catch (err) {
      showToast(
        truncateError(err instanceof Error ? err.message : "保存子任务失败"),
        "error"
      );
      return false;
    }
  };

  const markMainDone = async () => {
    try {
      const changes = { status: "done" as const, completedAt: Date.now() };
      await updateTodo(todo.id, changes);
      updateInStore(todo.id, changes);
      showToast("主任务已标记完成", "success");
    } catch {
      showToast("标记完成失败", "error");
    }
  };

  const handleToggle = async (id: string) => {
    const now = Date.now();
    const next = subtasks.map((s) =>
      s.id === id
        ? { ...s, done: !s.done, completedAt: !s.done ? now : undefined }
        : s
    );
    await persist(next);
  };

  const handleDelete = async (id: string) => {
    const next = subtasks
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, order: i }));
    await persist(next);
  };

  const handleAdd = async () => {
    const text = draft.trim().slice(0, 60);
    if (!text) return;
    const baseOrder = subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.order)) + 1 : 0;
    const newItem: SubtaskItem = {
      id: uuidv4(),
      text,
      done: false,
      order: baseOrder,
      createdAt: Date.now(),
      source: "manual",
    };
    const next = [...subtasks, newItem];
    const ok = await persist(next);
    if (ok) setDraft("");
  };

  const handleReorder = async (newOrderItems: SubtaskItem[]) => {
    const next = newOrderItems.map((s, i) => ({ ...s, order: i }));
    await persist(next);
  };

  const handleEditCommit = async (id: string) => {
    const text = editingText.trim().slice(0, 60);
    setEditingId(null);
    setEditingText("");
    if (!text) {
      // 空文本视为取消编辑，不修改也不删除
      return;
    }
    const target = subtasks.find((s) => s.id === id);
    if (!target || target.text === text) return;
    const next = subtasks.map((s) => (s.id === id ? { ...s, text } : s));
    await persist(next);
  };

  const handleAiSplit = async () => {
    if (!settings.aiEnabled || !settings.apiBaseUrl || !settings.apiKey) {
      showToast("请先在设置中启用并配置 AI", "error");
      return;
    }
    if (aiLoading) return;
    setAiLoading(true);
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      const { added } = await generateSubtasksForTodo(todo, settings, controller.signal);
      if (added.length === 0) {
        showToast("AI 未给出新子任务", "info");
        return;
      }
      const baseOrder =
        subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.order)) + 1 : 0;
      const next: SubtaskItem[] = [
        ...subtasks,
        ...added.map((s, i) => ({ ...s, order: baseOrder + i })),
      ];
      const ok = await persist(next);
      if (ok) showToast(`AI 追加了 ${added.length} 条子任务`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "已取消") {
        // 静默
      } else {
        showToast(truncateError(msg), "error");
      }
    } finally {
      setAiLoading(false);
      aiAbortRef.current = null;
    }
  };

  const total = subtasks.length;
  const doneCount = subtasks.filter((s) => s.done).length;
  const aiConfigured = settings.aiEnabled && !!settings.apiBaseUrl && !!settings.apiKey;

  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">
            子任务{total > 0 ? ` · ${doneCount}/${total}` : ""}
          </span>
          {aiConfigured && (
            <button
              type="button"
              onClick={handleAiSplit}
              disabled={aiLoading}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-40"
              aria-label="AI 拆分子任务"
            >
              {aiLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {aiLoading ? "拆分中…" : "AI 拆分"}
            </button>
          )}
        </div>

        {total > 0 && (
          <Reorder.Group
            axis="y"
            values={subtasks}
            onReorder={handleReorder}
            className="space-y-0.5"
          >
            <AnimatePresence initial={false}>
              {subtasks.map((s) => (
                <Reorder.Item
                  key={s.id}
                  value={s}
                  className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-white/[0.03]"
                  whileDrag={{ scale: 1.01 }}
                >
                  <button
                    type="button"
                    className="cursor-grab touch-none text-text-muted/40 opacity-0 transition-opacity hover:text-text-muted group-hover:opacity-100 active:cursor-grabbing"
                    aria-label="拖动排序"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggle(s.id)}
                    className="shrink-0 text-text-muted transition-colors hover:text-success focus:outline-none focus:ring-2 focus:ring-success/30 rounded"
                    aria-label={s.done ? "取消完成" : "标记完成"}
                  >
                    {s.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Circle className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={() => void handleEditCommit(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleEditCommit(s.id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingId(null);
                          setEditingText("");
                        }
                      }}
                      maxLength={60}
                      className="min-w-0 flex-1 bg-transparent text-xs text-text-secondary outline-none focus:ring-1 focus:ring-accent/40 rounded px-1"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(s.id);
                        setEditingText(s.text);
                      }}
                      className={`min-w-0 flex-1 truncate text-left text-xs transition-colors ${
                        s.done ? "text-text-muted line-through" : "text-text-secondary"
                      }`}
                      title="点击编辑"
                    >
                      {s.text}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(s.id)}
                    className="shrink-0 rounded p-0.5 text-text-muted/40 opacity-0 transition-colors hover:text-danger group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-danger/30"
                    aria-label="删除子任务"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}

        {/* 添加子任务输入框 */}
        <motion.div
          layout
          className="flex items-center gap-1.5 rounded-md border border-dashed border-white/10 px-1.5 py-1 focus-within:border-accent/30"
        >
          <Plus className="h-3 w-3 shrink-0 text-text-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
            maxLength={60}
            placeholder="添加子任务，回车保存"
            className="min-w-0 flex-1 bg-transparent text-xs text-text-secondary placeholder:text-text-muted/60 outline-none"
            aria-label="新建子任务"
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={() => void handleAdd()}
              className="rounded px-1.5 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/30"
              aria-label="确认添加"
            >
              添加
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function allDone(items: SubtaskItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((s) => s.done);
}
