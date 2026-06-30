"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Archive,
  Trash2,
  Tag,
  FolderOpen,
  X,
  CheckSquare,
} from "lucide-react";
import { useFlowState } from "@/lib/store";
import { updateTodo } from "@/lib/db";
import type { TodoStatus, TodoItem } from "@/lib/types";
import { useState } from "react";

const BULK_ACTIONS: { label: string; icon: typeof ArrowRight; status: TodoStatus }[] = [
  { label: "Inbox", icon: ArrowRight, status: "inbox" },
  { label: "Today", icon: ArrowRight, status: "today" },
  { label: "Doing", icon: ArrowRight, status: "doing" },
  { label: "Done", icon: ArrowRight, status: "done" },
];

export default function BulkActionBar() {
  const {
    selectedIds,
    setBulkMode,
    clearSelection,
    showToast,
    updateTodo: updateInStore,
    todos,
    projects,
    removeTodo,
    setTodos,
  } = useFlowState();

  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [newTag, setNewTag] = useState("");

  const count = selectedIds.size;
  if (count === 0) return null;

  const selectedTodos = todos.filter((t) => selectedIds.has(t.id));

  const handleMoveStatus = async (status: TodoStatus) => {
    const changes: Partial<TodoItem> = { status };
    if (status === "done") changes.completedAt = Date.now();
    if (status === "archived") changes.archivedAt = Date.now();

    try {
      for (const todo of selectedTodos) {
        await updateTodo(todo.id, changes);
        updateInStore(todo.id, changes);
      }
      showToast(`已移动 ${count} 个任务`, "success");
      clearSelection();
    } catch {
      showToast("批量移动失败", "error");
    }
  };

  const handleArchive = async () => {
    try {
      for (const todo of selectedTodos) {
        await updateTodo(todo.id, { status: "archived", archivedAt: Date.now() });
        updateInStore(todo.id, { status: "archived", archivedAt: Date.now() });
      }
      showToast(`已归档 ${count} 个任务`, "success");
      clearSelection();
    } catch {
      showToast("批量归档失败", "error");
    }
  };

  const handleDelete = async () => {
    try {
      const { deleteTodo } = await import("@/lib/db");
      for (const todo of selectedTodos) {
        await deleteTodo(todo.id);
        removeTodo(todo.id);
      }
      showToast(`已删除 ${count} 个任务`, "success");
      clearSelection();
    } catch {
      showToast("批量删除失败", "error");
    }
  };

  const handleAddTag = async () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    try {
      for (const todo of selectedTodos) {
        if (todo.tags.includes(trimmed)) continue;
        const newTags = [...todo.tags, trimmed];
        await updateTodo(todo.id, { tags: newTags });
        updateInStore(todo.id, { tags: newTags });
      }
      showToast(`已添加标签「${trimmed}」`, "success");
      setNewTag("");
      setShowTagMenu(false);
    } catch {
      showToast("批量添加标签失败", "error");
    }
  };

  const handleMoveProject = async (projectId: string | undefined) => {
    try {
      for (const todo of selectedTodos) {
        await updateTodo(todo.id, { projectId });
        updateInStore(todo.id, { projectId });
      }
      showToast(`已移动 ${count} 个任务`, "success");
      setShowProjectMenu(false);
      clearSelection();
    } catch {
      showToast("批量移动失败", "error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-surface-solid/95 px-4 py-2.5 shadow-glass backdrop-blur-xl"
    >
      <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <CheckSquare className="h-3.5 w-3.5 text-primary" />
        已选 {count}
      </span>

      <div className="mx-1 h-5 w-px bg-white/10" />

      {/* Move status */}
      {BULK_ACTIONS.map(({ label, icon: Icon, status }) => (
        <button
          key={status}
          onClick={() => handleMoveStatus(status)}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          title={`移动到 ${label}`}
          aria-label={`移动到 ${label}`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}

      {/* Move project */}
      <div className="relative">
        <button
          onClick={() => setShowProjectMenu(!showProjectMenu)}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="移动到项目"
        >
          <FolderOpen className="h-3 w-3" />
          项目
        </button>
        {showProjectMenu && (
          <div className="absolute bottom-full left-0 mb-2 w-40 overflow-hidden rounded-xl border border-white/5 bg-surface-solid shadow-glass">
            <button
              onClick={() => handleMoveProject(undefined)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-white/5"
            >
              默认（无项目）
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleMoveProject(p.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-white/5"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color ?? "#7C3AED" }}
                />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add tag */}
      <div className="relative">
        <button
          onClick={() => setShowTagMenu(!showTagMenu)}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="批量打标签"
        >
          <Tag className="h-3 w-3" />
          标签
        </button>
        {showTagMenu && (
          <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1 overflow-hidden rounded-xl border border-white/5 bg-surface-solid p-2 shadow-glass"
          >
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTag();
                if (e.key === "Escape") setShowTagMenu(false);
              }}
              placeholder="标签名"
              autoFocus
              className="w-24 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none"
            />
            <button
              onClick={handleAddTag}
              className="rounded-md bg-primary/15 px-2 py-1 text-[10px] text-primary hover:bg-primary/25"
            >
              添加
            </button>
          </div>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-white/10" />

      {/* Archive */}
      <button
        onClick={handleArchive}
        className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-warning focus:outline-none focus:ring-2 focus:ring-warning/30"
        aria-label="批量归档"
      >
        <Archive className="h-3 w-3" />
        归档
      </button>

      {/* Delete */}
      <button
        onClick={handleDelete}
        className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
        aria-label="批量删除"
      >
        <Trash2 className="h-3 w-3" />
        删除
      </button>

      <div className="mx-1 h-5 w-px bg-white/10" />

      {/* Close */}
      <button
        onClick={() => {
          clearSelection();
          setBulkMode(false);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="退出批量模式"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
