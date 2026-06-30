"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CheckCircle2,
  Circle,
  Archive,
  Trash2,
  Copy,
  Tag,
  Calendar,
  Clock,
  AlertCircle,
  Plus,
  Minus,
  Sparkles,
  Loader2,
  RefreshCw,
  FileCode2,
  Terminal,
  Lightbulb,
  BookOpen,
  Volume2,
  Timer,
  Play,
  Pause,
  Square,
  Zap,
  BatteryMedium,
  Coffee,
} from "lucide-react";
import { useFlowState } from "@/lib/store";
import { updateTodo, addTodo } from "@/lib/db";
import { generateInstance } from "@/lib/recurrence";
import { parseTodoWithAi, applyAiResultToTodo, truncateError } from "@/lib/ai";
import { useSpeechSynthesis } from "@/lib/useSpeechSynthesis";
import { useScrollLock } from "@/lib/useScrollLock";
import { useDebounce } from "@/lib/useDebounce";
import {
  TODO_STATUSES,
  PRIORITY_CONFIG,
  ENERGY_CONFIG,
} from "@/lib/types";
import type { TodoItem, TodoStatus, TodoPriority, EnergyLevel } from "@/lib/types";
import { formatRelativeDate, isOverdue } from "@/lib/date-utils";
import DatePicker from "./DatePicker";
import RecurrencePicker from "./RecurrencePicker";
import TimeBlockPicker from "./TimeBlockPicker";
import { usePomodoro, formatTime } from "@/lib/usePomodoro";
import ConfirmDialog from "./ConfirmDialog";
import SubtaskList from "./SubtaskList";

const statusLabels: Record<TodoStatus, string> = {
  inbox: "Inbox",
  today: "Today",
  doing: "进行中",
  done: "已完成",
  archived: "已归档",
  error: "错误",
};

export default function TodoDetail() {
  const {
    todos,
    selectedTodoId,
    isDetailOpen,
    closeDetail,
    updateTodo: updateInStore,
    addTodo: addToStore,
    showToast,
    softDelete,
    settings,
    pomodoroTodoId,
    pomodoroIsRunning,
  } = useFlowState();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useScrollLock(isDetailOpen);

  const {
    isSupported: ttsSupported,
    isSpeaking,
    speak,
    cancel: cancelTts,
  } = useSpeechSynthesis({
    lang: settings.ttsLang || "zh-CN",
    onError: (error) => showToast(error, "error"),
  });

  const handleSpeak = () => {
    if (isSpeaking) {
      cancelTts();
    } else if (todo) {
      const text = todo.aiSummary?.action
        ? `${todo.title}。${todo.aiSummary.action}`
        : todo.title;
      speak(text);
    }
  };

  // ESC to close detail (only when confirm dialog is not open)
  useEffect(() => {
    if (!isDetailOpen || showDeleteConfirm) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDetail();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isDetailOpen, showDeleteConfirm, closeDetail]);

  const todo = useMemo(
    () => todos.find((t) => t.id === selectedTodoId) ?? null,
    [todos, selectedTodoId]
  );

  const pomo = usePomodoro(todo?.id ?? "");
  const hasOtherPomodoroRunning = pomodoroIsRunning && pomodoroTodoId !== todo?.id;

  // Debounced persistence for title and note
  const currentTodoId = todo?.id ?? "";

  const { debouncedFn: debouncedTitleSave, cancel: cancelTitleSave } = useDebounce(
    async (title: string) => {
      if (!currentTodoId) return;
      try {
        await updateTodo(currentTodoId, { title });
      } catch {
        showToast("更新失败", "error");
      }
    },
    400
  );

  const { debouncedFn: debouncedNoteSave, cancel: cancelNoteSave } = useDebounce(
    async (note: string) => {
      if (!currentTodoId) return;
      try {
        await updateTodo(currentTodoId, { note: note || undefined });
      } catch {
        showToast("更新失败", "error");
      }
    },
    400
  );

  // Cancel pending saves when switching todos or unmounting
  useEffect(() => {
    return () => {
      cancelTitleSave();
      cancelNoteSave();
    };
  }, [currentTodoId, cancelTitleSave, cancelNoteSave]);

  const handleStatusChange = async (status: TodoStatus) => {
    if (!todo) return;
    const changes: Partial<TodoItem> = { status };
    if (status === "done") changes.completedAt = Date.now();
    if (status === "archived") changes.archivedAt = Date.now();
    try {
      await updateTodo(todo.id, changes);
      updateInStore(todo.id, changes);
      showToast(`状态已改为 ${statusLabels[status]}`, "success");
    } catch {
      showToast("更新失败", "error");
    }
  };

  const handlePriorityChange = async (priority: TodoPriority) => {
    if (!todo) return;
    try {
      await updateTodo(todo.id, { priority });
      updateInStore(todo.id, { priority });
    } catch {
      showToast("更新失败", "error");
    }
  };

  const handleEnergyLevelChange = async (energyLevel: EnergyLevel) => {
    if (!todo) return;
    try {
      await updateTodo(todo.id, { energyLevel });
      updateInStore(todo.id, { energyLevel });
    } catch {
      showToast("更新精力等级失败", "error");
    }
  };

  const handleDueDateChange = async (dueAt: number | undefined) => {
    if (!todo) return;
    try {
      await updateTodo(todo.id, { dueAt });
      updateInStore(todo.id, { dueAt });
    } catch {
      showToast("更新截止日期失败", "error");
    }
  };

  const handleTitleChange = (title: string) => {
    if (!todo) return;
    updateInStore(todo.id, { title });
    debouncedTitleSave(title);
  };

  const handleNoteChange = (note: string) => {
    if (!todo) return;
    updateInStore(todo.id, { note: note || undefined });
    debouncedNoteSave(note);
  };

  const handleAddTag = async () => {
    if (!todo) return;
    const trimmed = newTag.trim();
    if (!trimmed || todo.tags.includes(trimmed)) return;
    const newTags = [...todo.tags, trimmed];
    try {
      await updateTodo(todo.id, { tags: newTags });
      updateInStore(todo.id, { tags: newTags });
      setNewTag("");
      setSelectedSuggestionIndex(0);
    } catch {
      showToast("添加标签失败", "error");
    }
  };

  // Tag autocomplete
  const availableTags = useMemo(() => {
    const all = new Set<string>();
    for (const t of todos) {
      if (t.id === todo?.id) continue;
      for (const tag of t.tags) {
        all.add(tag);
      }
    }
    return Array.from(all).sort();
  }, [todos, todo?.id]);

  const tagSuggestions = useMemo(() => {
    const query = newTag.trim().toLowerCase();
    if (!query || !todo) return [];
    return availableTags.filter(
      (tag) => !todo.tags.includes(tag) && tag.toLowerCase().includes(query)
    );
  }, [newTag, availableTags, todo]);

  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  useEffect(() => {
    if (tagSuggestions.length === 0) return;
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current?.contains(e.target as Node) ||
        tagInputRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setNewTag("");
      setSelectedSuggestionIndex(0);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tagSuggestions.length]);

  const handleSuggestionSelect = (tag: string) => {
    setNewTag(tag);
    setSelectedSuggestionIndex(0);
    tagInputRef.current?.focus();
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (tagSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex((i) =>
          Math.min(i + 1, tagSuggestions.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && tagSuggestions.length > 0) {
        e.preventDefault();
        setNewTag(tagSuggestions[selectedSuggestionIndex]);
        setSelectedSuggestionIndex(0);
        return;
      }
      if (e.key === "Escape") {
        setNewTag("");
        setSelectedSuggestionIndex(0);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!todo) return;
    const newTags = todo.tags.filter((t) => t !== tag);
    try {
      await updateTodo(todo.id, { tags: newTags });
      updateInStore(todo.id, { tags: newTags });
    } catch {
      showToast("移除标签失败", "error");
    }
  };

  const handleDelete = () => {
    if (!todo) return;
    softDelete(todo);
    setShowDeleteConfirm(false);
  };

  const handleCopy = () => {
    if (!todo) return;
    const text = `${todo.title}\n${todo.rawInput}${todo.note ? "\n备注: " + todo.note : ""}`;
    navigator.clipboard.writeText(text).then(() => {
      showToast("已复制到剪贴板", "success");
    });
  };

  const handleReparse = async () => {
    if (!todo || aiProcessing) return;
    setAiProcessing(true);
    abortControllerRef.current = new AbortController();
    try {
      await updateTodo(todo.id, { aiStatus: "processing" });
      updateInStore(todo.id, { aiStatus: "processing" });
      const result = await parseTodoWithAi(todo.rawInput, settings, abortControllerRef.current.signal);
      if (result.items.length > 0) {
        const applied = applyAiResultToTodo(result.items[0]);
        const changes: Partial<TodoItem> = {
          title: applied.title,
          tags: applied.tags,
          priority: applied.priority,
          dueAt: applied.dueAt ?? todo.dueAt,
          estimatedMinutes: applied.estimatedMinutes ?? todo.estimatedMinutes,
          aiSummary: applied.aiSummary,
          aiStatus: "success",
          errorMessage: undefined,
        };
        // F-2: 重新整理时不覆盖已有子任务（含完成态/手工添加项），
        // 仅在原本没有子任务、且 AI 给出非空结果时写入 subtasks。
        const existing = todo.subtasks ?? [];
        if (existing.length === 0 && applied.subtasks.length > 0) {
          changes.subtasks = applied.subtasks;
        }
        await updateTodo(todo.id, changes);
        updateInStore(todo.id, changes);
        showToast("AI 整理完成", "success");
      }
    } catch (err) {
      const errorMsg = truncateError(err instanceof Error ? err.message : "AI 整理失败");
      const isCancelled = errorMsg === "已取消";
      await updateTodo(todo.id, {
        aiStatus: isCancelled ? "idle" : "error",
        errorMessage: isCancelled ? undefined : errorMsg,
      });
      updateInStore(todo.id, {
        aiStatus: isCancelled ? "idle" : "error",
        errorMessage: isCancelled ? undefined : errorMsg,
      });
      if (!isCancelled) {
        showToast(errorMsg, "error");
      } else {
        showToast("已取消 AI 整理", "info");
      }
    } finally {
      setAiProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelAi = () => {
    if (!todo) return;
    abortControllerRef.current?.abort();
    // 立即重置 UI 状态，提供即时反馈（即使请求中断有延迟）
    updateInStore(todo.id, { aiStatus: "idle", errorMessage: undefined });
    updateTodo(todo.id, { aiStatus: "idle", errorMessage: undefined }).catch(() => {});
  };

  const handleArchive = async () => {
    if (!todo) return;
    try {
      await updateTodo(todo.id, { status: "archived", archivedAt: Date.now() });
      updateInStore(todo.id, { status: "archived", archivedAt: Date.now() });
      showToast("已归档", "success");
    } catch {
      showToast("归档失败", "error");
    }
  };

  const isDone = todo?.status === "done";

  return (
    <>
      <AnimatePresence>
        {isDetailOpen && todo && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm"
              onClick={closeDetail}
              aria-hidden="true"
            />

            {/* Drawer */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-[86] w-full max-w-3xl border-l border-glass-border glass-strong shadow-glass sm:w-[48rem]"
              role="dialog"
              aria-modal="true"
              aria-label="任务详情"
            >
              <div className="flex h-full flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                  <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                    任务详情
                  </span>
                  <button
                    onClick={closeDetail}
                    className="rounded-lg p-1.5 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  {/* Status toggle */}
                  <button
                    onClick={() =>
                      handleStatusChange(isDone ? "inbox" : "done")
                    }
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      isDone
                        ? "border-success/20 bg-success/5 text-success"
                        : "border-white/5 bg-white/[0.02] text-text-secondary hover:bg-white/5"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                    <span className="text-sm font-medium">
                      {isDone ? "已完成" : "标记为完成"}
                    </span>
                  </button>

                  {/* Title */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-text-muted">
                        标题
                      </label>
                      {ttsSupported && settings.ttsEnabled && (
                        <button
                          onClick={handleSpeak}
                          className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                            isSpeaking
                              ? "bg-primary/20 text-primary animate-pulse"
                              : "text-text-muted hover:text-text-primary hover:bg-white/5"
                          }`}
                          aria-label={isSpeaking ? "停止朗读" : "朗读任务"}
                          title={isSpeaking ? "停止朗读" : "朗读任务"}
                        >
                          <Volume2 className="h-3 w-3" />
                          {isSpeaking ? "朗读中…" : "朗读"}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={todo.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>

                  {/* Raw input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      原始输入
                    </label>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">
                        {todo.rawInput}
                      </p>
                    </div>
                  </div>

                  {/* Note */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      备注
                    </label>
                    <textarea
                      value={todo.note || ""}
                      onChange={(e) => handleNoteChange(e.target.value)}
                      placeholder="添加备注…"
                      rows={3}
                      className="w-full resize-none rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      状态
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {TODO_STATUSES.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => handleStatusChange(value)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                            todo.status === value
                              ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                              : "bg-white/5 text-text-secondary hover:bg-white/8"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Due Date */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-text-muted">
                        截止日期
                      </label>
                      {todo.dueAt && isOverdue(todo.dueAt) && (
                        <span className="text-[10px] font-medium text-danger">
                          已逾期
                        </span>
                      )}
                    </div>
                    <DatePicker
                      value={todo.dueAt}
                      onChange={handleDueDateChange}
                      placeholder="选择截止日期"
                    />
                  </div>

                  {/* Recurrence */}
                  <RecurrencePicker
                    value={todo.recurrenceRule}
                    onChange={async (rule) => {
                      if (!todo) return;
                      try {
                        const changes: Partial<TodoItem> = {
                          recurrenceRule: rule,
                          isRecurringTemplate: !!rule,
                        };
                        if (rule) {
                          changes.status = "archived";
                          changes.archivedAt = Date.now();
                        }
                        await updateTodo(todo.id, changes);
                        updateInStore(todo.id, changes);
                        if (rule) {
                          // Immediately generate first instance so the task doesn't disappear
                          const instance = generateInstance({ ...todo, ...changes } as TodoItem);
                          await addTodo(instance);
                          // Update template's lastGenerated
                          const now = Date.now();
                          const updatedRule = { ...rule, lastGenerated: now };
                          await updateTodo(todo.id, { recurrenceRule: updatedRule });
                          updateInStore(todo.id, { recurrenceRule: updatedRule });
                          // Add instance to store
                          addToStore(instance);
                          showToast("已设为循环任务，已生成今日实例", "info");
                        }
                      } catch {
                        showToast("更新重复规则失败", "error");
                      }
                    }}
                  />

                  {/* Estimated Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      预计耗时（分钟）
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={todo.estimatedMinutes ?? ""}
                        onChange={async (e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          if (val !== undefined && (isNaN(val) || val < 0)) return;
                          try {
                            await updateTodo(todo.id, { estimatedMinutes: val });
                            updateInStore(todo.id, { estimatedMinutes: val });
                          } catch {
                            showToast("更新失败", "error");
                          }
                        }}
                        placeholder="未估算"
                        className="flex-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                      {todo.estimatedMinutes !== undefined && todo.estimatedMinutes > 0 && (
                        <span className="text-xs text-text-muted">
                          ≈ {todo.estimatedMinutes >= 60
                            ? `${(todo.estimatedMinutes / 60).toFixed(1)}h`
                            : `${todo.estimatedMinutes}m`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Time Blocking */}
                  <TimeBlockPicker
                    dueAt={todo.dueAt}
                    startTime={todo.startTime}
                    endTime={todo.endTime}
                    estimatedMinutes={todo.estimatedMinutes}
                    onChange={async (start, end) => {
                      if (!todo) return;
                      try {
                        await updateTodo(todo.id, { startTime: start, endTime: end });
                        updateInStore(todo.id, { startTime: start, endTime: end });
                      } catch {
                        showToast("更新时段失败", "error");
                      }
                    }}
                  />

                  {/* Priority */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      优先级
                    </label>
                    <div className="flex gap-2">
                      {(
                        ["low", "medium", "high"] as TodoPriority[]
                      ).map((p) => {
                        const cfg = PRIORITY_CONFIG[p];
                        return (
                          <button
                            key={p}
                            onClick={() => handlePriorityChange(p)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                              todo.priority === p
                                ? "bg-white/10 text-text-primary ring-1 ring-white/10"
                                : "bg-white/5 text-text-secondary hover:bg-white/8"
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${cfg.color} ${cfg.glow}`}
                            />
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Energy Level */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      精力等级
                    </label>
                    <div className="flex gap-2">
                      {(
                        [
                          { key: "high" as EnergyLevel, icon: Zap, label: "高精力" },
                          { key: "medium" as EnergyLevel, icon: BatteryMedium, label: "中等" },
                          { key: "low" as EnergyLevel, icon: Coffee, label: "低精力" },
                        ] as const
                      ).map(({ key, icon: Icon, label }) => {
                        const cfg = ENERGY_CONFIG[key];
                        const isActive = todo.energyLevel === key;
                        return (
                          <button
                            key={key}
                            onClick={() => handleEnergyLevelChange(key)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                              isActive
                                ? `${cfg.bgColor} ${cfg.color} ring-1 ring-white/10`
                                : "bg-white/5 text-text-secondary hover:bg-white/8"
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      标签
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {todo.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs text-text-secondary"
                        >
                          <Tag className="h-3 w-3 text-text-muted" />
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-0.5 rounded p-0.5 text-text-muted hover:text-danger focus:outline-none"
                            aria-label={`移除标签 ${tag}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <div className="relative flex items-center gap-1">
                        <input
                          ref={tagInputRef}
                          type="text"
                          value={newTag}
                          onChange={(e) => {
                            setNewTag(e.target.value);
                            setSelectedSuggestionIndex(0);
                          }}
                          onKeyDown={handleTagKeyDown}
                          placeholder="新标签"
                          className="w-20 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <button
                          onClick={handleAddTag}
                          disabled={!newTag.trim()}
                          className="rounded-lg p-1 text-text-muted transition-colors hover:text-primary disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          aria-label="添加标签"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>

                        {/* Tag autocomplete dropdown */}
                        {tagSuggestions.length > 0 && (
                          <div
                            ref={suggestionsRef}
                            className="absolute left-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-lg border border-white/5 bg-surface-solid shadow-glass"
                          >
                            {tagSuggestions.map((tag, i) => (
                              <button
                                key={tag}
                                onClick={() => handleSuggestionSelect(tag)}
                                className={`flex w-full items-center px-2 py-1.5 text-left text-xs transition-colors ${
                                  i === selectedSuggestionIndex
                                    ? "bg-primary/15 text-primary"
                                    : "text-text-secondary hover:bg-white/5"
                                }`}
                              >
                                <Tag className="mr-1.5 h-3 w-3 text-text-muted" />
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pomodoro */}
                  {(todo.status === "doing" || (todo.pomodoros ?? 0) > 0) && (
                    <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Timer className="h-3.5 w-3.5" />
                          番茄钟
                          {(todo.pomodoros ?? 0) > 0 && (
                            <span className="text-[10px] text-text-muted">
                              累计 {todo.pomodoros} 个 ·{" "}
                              {Math.floor((todo.totalFocusTime ?? 0) / 60)} 分钟
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted">{pomo.phaseLabel}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
                          <span className="font-mono text-lg font-medium text-text-primary">
                            {formatTime(pomo.remaining)}
                          </span>
                        </div>
                        {!pomo.isRunning ? (
                          <button
                            onClick={() => pomo.start()}
                            disabled={hasOtherPomodoroRunning}
                            className="flex h-9 items-center gap-1 rounded-lg bg-primary/15 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            aria-label="开始专注"
                            title={hasOtherPomodoroRunning ? "其他任务正在专注中" : "开始专注"}
                          >
                            <Play className="h-3.5 w-3.5" />
                            开始
                          </button>
                        ) : (
                          <button
                            onClick={() => pomo.pause()}
                            className="flex h-9 items-center gap-1 rounded-lg bg-warning/15 px-3 text-xs font-medium text-warning transition-colors hover:bg-warning/25 focus:outline-none focus:ring-2 focus:ring-warning/30"
                            aria-label="暂停"
                          >
                            <Pause className="h-3.5 w-3.5" />
                            暂停
                          </button>
                        )}
                        <button
                          onClick={() => pomo.stop()}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
                          aria-label="停止计时"
                          title="停止计时"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex gap-2">
                        {(
                          [
                            { key: "work", label: "专注" },
                            { key: "shortBreak", label: "短休" },
                            { key: "longBreak", label: "长休" },
                          ] as const
                        ).map((ph) => (
                          <button
                            key={ph.key}
                            onClick={() => pomo.switchPhase(ph.key)}
                            className={`flex-1 rounded-md py-1 text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                              pomo.phase === ph.key
                                ? "bg-white/10 text-text-primary"
                                : "text-text-muted hover:bg-white/5 hover:text-text-secondary"
                            }`}
                          >
                            {ph.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Times */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-muted">
                      时间信息
                    </label>
                    <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-text-muted">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        创建于 {formatFullDate(todo.createdAt)}
                      </div>
                      {todo.updatedAt !== todo.createdAt && (
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          更新于 {formatFullDate(todo.updatedAt)}
                        </div>
                      )}
                      {todo.completedAt && (
                        <div className="flex items-center gap-2 text-sm text-success">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          完成于 {formatFullDate(todo.completedAt)}
                        </div>
                      )}
                      {todo.archivedAt && (
                        <div className="flex items-center gap-2 text-sm text-warning">
                          <Archive className="h-3.5 w-3.5 shrink-0" />
                          归档于 {formatFullDate(todo.archivedAt)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Section */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Sparkles className="h-3.5 w-3.5" />
                        AI 整理
                      </div>
                      {todo.aiStatus === "idle" && settings.aiEnabled && (
                        <button
                          onClick={handleReparse}
                          disabled={aiProcessing}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-40"
                          aria-label="AI 整理"
                        >
                          <Sparkles className="h-3 w-3" />
                          整理
                        </button>
                      )}
                      {(todo.aiStatus === "success" || todo.aiStatus === "error") && settings.aiEnabled && (
                        <button
                          onClick={handleReparse}
                          disabled={aiProcessing}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-40"
                          aria-label="重新整理"
                        >
                          <RefreshCw className={`h-3 w-3 ${aiProcessing ? "animate-spin" : ""}`} />
                          {aiProcessing ? "整理中…" : "重新整理"}
                        </button>
                      )}
                    </div>

                    {/* Processing */}
                    {todo.aiStatus === "processing" && (
                      <div className="mt-2 flex items-center justify-between text-xs text-accent">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          AI 处理中…
                        </div>
                        <button
                          onClick={handleCancelAi}
                          className="rounded-md px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-white/5 hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
                          aria-label="取消 AI 整理"
                        >
                          取消
                        </button>
                      </div>
                    )}

                    {/* Error */}
                    {todo.aiStatus === "error" && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-danger">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {todo.errorMessage || "AI 整理失败"}
                        </div>
                        <p className="text-[11px] text-text-muted">
                          原始输入已保存，可点击「重新整理」重试。
                        </p>
                      </div>
                    )}

                    {/* AI Summary */}
                    {todo.aiStatus === "success" && todo.aiSummary && (
                      <div className="mt-2 space-y-2">
                        {todo.aiSummary.action && (
                          <div className="flex items-start gap-2">
                            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-text-muted">行动</span>
                              <p className="text-xs text-text-secondary">{todo.aiSummary.action}</p>
                            </div>
                          </div>
                        )}
                        {todo.aiSummary.context && (
                          <div className="flex items-start gap-2">
                            <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-text-muted">上下文</span>
                              <p className="text-xs text-text-secondary">{todo.aiSummary.context}</p>
                            </div>
                          </div>
                        )}
                        {todo.aiSummary.suggestedNextStep && (
                          <div className="flex items-start gap-2">
                            <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-text-muted">下一步</span>
                              <p className="text-xs text-text-secondary">{todo.aiSummary.suggestedNextStep}</p>
                            </div>
                          </div>
                        )}
                        {todo.aiSummary.relatedFiles && todo.aiSummary.relatedFiles.length > 0 && (
                          <div className="flex items-start gap-2">
                            <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-text-muted">相关文件</span>
                              <div className="flex flex-wrap gap-1">
                                {todo.aiSummary.relatedFiles.map((f) => (
                                  <code
                                    key={f}
                                    className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-accent"
                                  >
                                    {f}
                                  </code>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {todo.aiSummary.relatedSymbols && todo.aiSummary.relatedSymbols.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-text-muted">相关符号</span>
                              <div className="flex flex-wrap gap-1">
                                {todo.aiSummary.relatedSymbols.map((s) => (
                                  <code
                                    key={s}
                                    className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary"
                                  >
                                    {s}
                                  </code>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* F-2 子任务：实体化交互列表，独立于 AI Summary 渲染（手工添加也可见）。 */}
                    <div className="mt-2">
                      <SubtaskList todo={todo} />
                    </div>

                    {/* Not configured hint */}
                    {!settings.aiEnabled && (
                      <p className="mt-1 text-xs text-text-muted">
                        在设置中启用并配置 AI 后可使用整理功能
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex items-center gap-2 border-t border-white/5 px-5 py-3">
                  <button
                    onClick={handleCopy}
                    className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="复制内容"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                  {todo.status !== "archived" && (
                    <button
                      onClick={handleArchive}
                      className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-warning focus:outline-none focus:ring-2 focus:ring-primary/30"
                      aria-label="归档"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      归档
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-danger focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="删除任务"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {todo && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="删除任务"
          message={`确定要删除「${todo.title}」吗？此操作不可撤销。`}
          confirmLabel="删除"
          cancelLabel="取消"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

function formatFullDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
