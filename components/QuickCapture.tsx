"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  CornerDownLeft,
  X,
  Loader2,
  Mic,
  MessageSquare,
  PenLine,
  Plus,
  Minus,
  Tag,
  Zap,
  BatteryMedium,
  Coffee,
  Timer,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useFlowState } from "@/lib/store";
import { addTodo, updateTodo } from "@/lib/db";
import { parseTodoWithAi, applyAiResultToTodo, truncateError, streamChat, generateSubtasksForTodo, type ChatMessage } from "@/lib/ai";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useScrollLock } from "@/lib/useScrollLock";
import { parseQuickDateShortcuts } from "@/lib/date-utils";
import {
  TODO_STATUSES,
  PRIORITY_CONFIG,
  ENERGY_CONFIG,
} from "@/lib/types";
import type { TodoItem, TodoStatus, TodoPriority, EnergyLevel } from "@/lib/types";
import DatePicker from "./DatePicker";
import ChatBubble from "./ChatBubble";

const STATUS_OPTIONS = TODO_STATUSES.filter(
  (s) => s.value !== "done" && s.value !== "archived" && s.value !== "error"
);

export default function QuickCapture() {
  const {
    isQuickCaptureOpen,
    closeQuickCapture,
    openQuickCapture,
    addTodo: addTodoToStore,
    updateTodo: updateInStore,
    showToast,
    quickCaptureDraft,
    setQuickCaptureDraft,
    settings,
    todos,
    projects,
    currentProjectId,
    selectedTodoId,
  } = useFlowState();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState(quickCaptureDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(
    currentProjectId ?? undefined
  );
  const voiceUsedRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const spacePressedRef = useRef(false);

  // Form fields (card-style, matching TodoDetail)
  const [status, setStatus] = useState<TodoStatus>("inbox");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [dueAt, setDueAt] = useState<number | undefined>(undefined);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | undefined>(undefined);

  // Chat mode state
  const [isChatMode, setIsChatMode] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendChatMessageRef = useRef<(content: string) => void>(() => {});

  useScrollLock(isQuickCaptureOpen);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px"; // 240px = 15rem
  }, []);

  const chatAutoResize = useCallback(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px"; // 128px = 8rem
  }, []);

  // Reset form when opening
  useEffect(() => {
    if (isQuickCaptureOpen) {
      const timer = setTimeout(() => {
        setInput(quickCaptureDraft);
        setSelectedProjectId(currentProjectId ?? undefined);
        inputRef.current?.focus();
        autoResize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isQuickCaptureOpen, quickCaptureDraft, autoResize, currentProjectId]);

  // Auto scroll chat to bottom
  useEffect(() => {
    if (isChatMode && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, streamingContent, isChatMode]);

  // Speech recognition
  const {
    isSupported: speechSupported,
    isListening,
    start: startSpeech,
    stop: stopSpeech,
  } = useSpeechRecognition({
    lang: settings.speechLang || "zh-CN",
    onResult: (transcript) => {
      if (isChatMode) {
        setChatInput(transcript);
      } else {
        setInput(transcript);
        voiceUsedRef.current = true;
        requestAnimationFrame(autoResize);
      }
    },
    onError: (error) => {
      showToast(error, "error");
      stopSpeech();
    },
  });

  const toggleSpeech = () => {
    if (isListening) {
      stopSpeech();
    } else {
      if (isChatMode) {
        setChatInput("");
      } else {
        voiceUsedRef.current = false;
        setInput("");
      }
      startSpeech();
    }
  };

  // Stop speech when overlay closes
  useEffect(() => {
    if (!isQuickCaptureOpen && isListening) {
      stopSpeech();
    }
  }, [isQuickCaptureOpen, isListening, stopSpeech]);

  // Send chat message
  const sendChatMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: content.trim() };
      const newMessages = [...chatMessages, userMsg];
      const contextMessages = newMessages.slice(-20);
      setChatMessages(newMessages);
      setChatInput("");
      setIsStreaming(true);
      setStreamingContent("");

      chatAbortRef.current = new AbortController();

      const selectedTodo = todos.find((t) => t.id === selectedTodoId);

      try {
        let accumulated = "";
        await streamChat(
          contextMessages,
          settings,
          {
            onChunk: (chunk, isDone) => {
              if (isDone) {
                setIsStreaming(false);
                setChatMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: accumulated },
                ]);
                setStreamingContent("");
              } else {
                accumulated += chunk;
                setStreamingContent(accumulated);
              }
            },
            onError: (error) => {
              setIsStreaming(false);
              showToast(error, "error");
            },
          },
          chatAbortRef.current.signal,
          {
            todos: todos
              .filter((t) => t.status === "today" || t.status === "doing")
              .map((t) => ({
                title: t.title,
                status: t.status,
                priority: t.priority,
                energyLevel: t.energyLevel,
              })),
            selectedTodoTitle: selectedTodo?.title,
            energyMode: settings.userEnergyMode,
          }
        );
      } catch {
        setIsStreaming(false);
      } finally {
        chatAbortRef.current = null;
      }
    },
    [chatMessages, isStreaming, settings, todos, selectedTodoId, showToast]
  );

  // Keep ref in sync for space-to-talk handler
  useEffect(() => {
    sendChatMessageRef.current = sendChatMessage;
  });

  const handleChatAction = useCallback(
    async (action: string) => {
      if (!selectedTodoId) return;
      const todo = todos.find((t) => t.id === selectedTodoId);
      if (!todo) return;

      if (action === "set_doing") {
        try {
          await updateTodo(todo.id, { status: "doing" });
          updateInStore(todo.id, { status: "doing" });
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: `已将「${todo.title}」设置为进行中。` },
          ]);
          showToast("已设置为进行中", "success");
        } catch {
          showToast("操作失败", "error");
        }
      } else if (action === "generate_subtasks") {
        if (!settings.aiEnabled || !settings.apiBaseUrl || !settings.apiKey) {
          showToast("请先配置 AI", "error");
          return;
        }
        try {
          const { added } = await generateSubtasksForTodo(todo, settings);
          if (added.length > 0) {
            const existing = todo.subtasks ?? [];
            const baseOrder =
              existing.length > 0 ? Math.max(...existing.map((s) => s.order)) + 1 : 0;
            const nextSubtasks = [
              ...existing,
              ...added.map((s, i) => ({ ...s, order: baseOrder + i })),
            ];
            await updateTodo(todo.id, { subtasks: nextSubtasks });
            updateInStore(todo.id, { subtasks: nextSubtasks });
            setChatMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `已为「${todo.title}」生成 ${added.length} 个子任务：\n${added
                  .map((s, i) => `${i + 1}. ${s.text}`)
                  .join("\n")}`,
              },
            ]);
            showToast("子任务已生成", "success");
          } else {
            showToast("未生成新子任务", "info");
          }
        } catch (err) {
          showToast(truncateError(err instanceof Error ? err.message : "生成失败"), "error");
        }
      }
    },
    [selectedTodoId, todos, settings, updateInStore, showToast]
  );

  // Space-to-talk in quick-capture mode
  useEffect(() => {
    if (!isQuickCaptureOpen || isChatMode) return;

    const isInputFocused = () => {
      const active = document.activeElement;
      return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isInputFocused() && !spacePressedRef.current) {
        e.preventDefault();
        spacePressedRef.current = true;
        voiceUsedRef.current = false;
        setInput("");
        startSpeech();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && spacePressedRef.current) {
        spacePressedRef.current = false;
        stopSpeech();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isQuickCaptureOpen, isChatMode, startSpeech, stopSpeech]);

  // Space-to-talk in chat mode
  useEffect(() => {
    if (!isQuickCaptureOpen || !isChatMode) return;

    const isInputFocused = () => {
      const active = document.activeElement;
      return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isInputFocused() && !spacePressedRef.current) {
        e.preventDefault();
        spacePressedRef.current = true;
        setChatInput("");
        startSpeech();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && spacePressedRef.current) {
        spacePressedRef.current = false;
        stopSpeech();
        setTimeout(() => {
          setChatInput((prev) => {
            if (prev.trim()) {
              sendChatMessageRef.current(prev.trim());
            }
            return prev;
          });
        }, 800);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isQuickCaptureOpen, isChatMode, startSpeech, stopSpeech]);

  // Restore draft when opening + focus trap + mobile keyboard
  useEffect(() => {
    if (isQuickCaptureOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;

      const timer = setTimeout(() => {
        setInput(quickCaptureDraft);
        inputRef.current?.focus();
        autoResize();
      }, 50);

      // Focus trap: cycle Tab within the modal
      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== "Tab" || !containerRef.current) return;
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      window.addEventListener("keydown", handleTab);

      // Mobile keyboard: adjust position when visual viewport changes
      const handleViewportResize = () => {
        if (!containerRef.current || !window.visualViewport) return;
        const vv = window.visualViewport;
        const keyboardHeight = window.innerHeight - vv.height;
        if (keyboardHeight > 100) {
          containerRef.current.style.top = `${Math.max(8, vv.offsetTop + 16)}px`;
          containerRef.current.style.transform = "translateX(-50%) translateY(0)";
        } else {
          containerRef.current.style.top = "";
          containerRef.current.style.transform = "";
        }
      };
      window.visualViewport?.addEventListener("resize", handleViewportResize);

      return () => {
        clearTimeout(timer);
        window.removeEventListener("keydown", handleTab);
        window.visualViewport?.removeEventListener("resize", handleViewportResize);
        previousFocusRef.current?.focus();
      };
    }
  }, [isQuickCaptureOpen, quickCaptureDraft, autoResize]);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!isQuickCaptureOpen) {
          openQuickCapture();
        } else {
          closeQuickCapture();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQuickCaptureOpen, openQuickCapture, closeQuickCapture]);

  // Esc to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isQuickCaptureOpen) {
        setQuickCaptureDraft(input);
        closeQuickCapture();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isQuickCaptureOpen, input, setQuickCaptureDraft, closeQuickCapture]);

  // Tag handlers
  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
    if (e.key === "Escape") {
      setNewTag("");
    }
  };

  const handleSave = useCallback(
    async (withAi = false) => {
      const trimmed = input.trim();
      if (!trimmed || isSubmitting) return;

      setIsSubmitting(true);

      const now = Date.now();
      const shouldAi =
        settings.aiEnabled &&
        settings.apiBaseUrl &&
        settings.apiKey &&
        (withAi || settings.autoParse);

      const source = voiceUsedRef.current ? "voice" : "text";

      const { text: parsedText, dueAt: quickDueAt } = parseQuickDateShortcuts(trimmed);
      const rawInput = parsedText || trimmed;
      const finalDueAt = dueAt ?? quickDueAt;

      const maxOrder = Math.max(
        0,
        ...todos.filter((t) => t.status === status).map((t) => t.order ?? 0)
      );

      const todo: TodoItem = {
        id: uuidv4(),
        title: rawInput.length > 50 ? rawInput.slice(0, 50) + "…" : rawInput,
        rawInput,
        status,
        priority,
        tags,
        source,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
        dueAt: finalDueAt,
        estimatedMinutes,
        energyLevel,
        projectId: selectedProjectId,
        aiStatus: shouldAi ? "processing" : "idle",
      };

      try {
        await addTodo(todo);
        addTodoToStore(todo);
        setInput("");
        setQuickCaptureDraft("");
        voiceUsedRef.current = false;
        // Reset form
        setStatus("inbox");
        setPriority("medium");
        setEnergyLevel(undefined);
        setTags([]);
        setNewTag("");
        setDueAt(undefined);
        setEstimatedMinutes(undefined);
        closeQuickCapture();
        showToast(shouldAi ? "已保存，AI 整理中…" : "已加入 Inbox", "success");

        if (shouldAi) {
          try {
            const result = await parseTodoWithAi(trimmed, settings);

            if (result.items.length === 1) {
              const applied = applyAiResultToTodo(result.items[0]);
              const changes: Partial<TodoItem> = {
                title: applied.title,
                tags: applied.tags,
                priority: applied.priority,
                dueAt: applied.dueAt ?? todo.dueAt,
                estimatedMinutes: applied.estimatedMinutes ?? todo.estimatedMinutes,
                energyLevel: applied.energyLevel ?? todo.energyLevel,
                aiSummary: applied.aiSummary,
                aiStatus: "success",
                // F-2: AI 生成的子任务以实体形式存入顶层 subtasks
                ...(applied.subtasks.length > 0 ? { subtasks: applied.subtasks } : {}),
              };
              await updateTodo(todo.id, changes);
              updateInStore(todo.id, changes);
              showToast("AI 整理完成", "success");
            } else if (result.items.length > 1) {
              const [first, ...rest] = result.items;
              const applied = applyAiResultToTodo(first);
              const changes: Partial<TodoItem> = {
                title: applied.title,
                tags: applied.tags,
                priority: applied.priority,
                dueAt: applied.dueAt ?? todo.dueAt,
                estimatedMinutes: applied.estimatedMinutes ?? todo.estimatedMinutes,
                energyLevel: applied.energyLevel ?? todo.energyLevel,
                aiSummary: applied.aiSummary,
                aiStatus: "success",
                source: "ai_split",
                ...(applied.subtasks.length > 0 ? { subtasks: applied.subtasks } : {}),
              };
              await updateTodo(todo.id, changes);
              updateInStore(todo.id, changes);

              for (let i = 0; i < rest.length; i++) {
                const item = rest[i];
                const extraApplied = applyAiResultToTodo(item);
                const extraMaxOrder = Math.max(
                  0,
                  ...todos.filter((t) => t.status === status).map((t) => t.order ?? 0),
                  todo.order,
                  ...rest.slice(0, i).map((_, idx) => todo.order + idx + 1)
                );
                const extraTodo: TodoItem = {
                  id: uuidv4(),
                  title: extraApplied.title,
                  rawInput: item.action
                    ? `${item.title}\n${item.action}`
                    : item.title,
                  status,
                  priority: extraApplied.priority,
                  tags: extraApplied.tags,
                  dueAt: extraApplied.dueAt,
                  estimatedMinutes: extraApplied.estimatedMinutes,
                  energyLevel: extraApplied.energyLevel,
                  source: "ai_split",
                  order: extraMaxOrder + 1,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  aiSummary: extraApplied.aiSummary,
                  aiStatus: "success",
                  subtasks: extraApplied.subtasks.length > 0 ? extraApplied.subtasks : undefined,
                };
                await addTodo(extraTodo);
                addTodoToStore(extraTodo);
              }
              showToast(`AI 拆分为 ${result.items.length} 条任务`, "success");
            }
          } catch (err) {
            console.error("AI parse failed:", err);
            const errorMsg = truncateError(err instanceof Error ? err.message : "AI 整理失败");
            await updateTodo(todo.id, {
              aiStatus: "error",
              errorMessage: errorMsg,
            });
            updateInStore(todo.id, {
              aiStatus: "error",
              errorMessage: errorMsg,
            });
            showToast(errorMsg, "error");
          }
        }
      } catch (err) {
        console.error("Save failed:", err);
        showToast("保存失败，请重试", "error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [input, isSubmitting, settings, todos, addTodoToStore, updateInStore, setQuickCaptureDraft, closeQuickCapture, showToast, status, priority, tags, dueAt, estimatedMinutes, energyLevel, selectedProjectId]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSave(true);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave(false);
    }
  };

  const handleClose = () => {
    setQuickCaptureDraft(input);
    voiceUsedRef.current = false;
    if (isListening) stopSpeech();
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setIsStreaming(false);
    setStreamingContent("");
    setIsChatMode(false);
    setChatMessages([]);
    setChatInput("");
    // Reset form fields
    setStatus("inbox");
    setPriority("medium");
    setEnergyLevel(undefined);
    setTags([]);
    setNewTag("");
    setDueAt(undefined);
    setEstimatedMinutes(undefined);
    closeQuickCapture();
  };

  const isEmpty = !input.trim();

  return (
    <AnimatePresence>
      {isQuickCaptureOpen && (
        <>
          {/* Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[6px]"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Floating Capsule */}
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[10vh] z-[81] w-full max-w-2xl -translate-x-1/2 px-4 sm:px-0"
            role="dialog"
            aria-modal="true"
            aria-label="快速记录"
          >
            <div
              className="glass-strong flex flex-col overflow-hidden rounded-2xl"
              style={{
                boxShadow:
                  "0 0 80px rgba(124, 58, 237, 0.2), 0 0 40px rgba(34, 211, 238, 0.1), 0 16px 48px rgba(0, 0, 0, 0.3)",
                animation: "capsule-breathe 4s ease-in-out infinite",
                maxHeight: "calc(90vh - 10vh)",
              }}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-7 py-4 sm:px-8">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
                  <button
                    onClick={() => setIsChatMode(false)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                      !isChatMode
                        ? "bg-white/10 text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                    aria-label="快速记录"
                  >
                    <PenLine className="h-3 w-3" />
                    快速记录
                  </button>
                  <button
                    onClick={() => setIsChatMode(true)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                      isChatMode
                        ? "bg-white/10 text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                    aria-label="AI 对话"
                  >
                    <MessageSquare className="h-3 w-3" />
                    AI 对话
                  </button>
                </div>
                <button
                  onClick={handleClose}
                  className="ml-auto rounded-xl p-1.5 text-text-muted hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!isChatMode ? (
                <>
                  {/* Scrollable content */}
                  <div className="flex-1 overflow-y-auto">
                    {/* Input area */}
                    <div className="px-7 py-5 sm:px-8">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          autoResize();
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={isListening ? "正在听…" : "想记录点什么…"}
                        rows={1}
                        className="w-full resize-none bg-transparent text-lg leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none"
                        style={{
                          minHeight: "3rem",
                          maxHeight: "15rem",
                        }}
                      />
                    </div>

                    {/* Card-style params */}
                    <div className="px-7 sm:px-8 py-4">
                      <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        {/* Status */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-medium text-text-muted">
                            状态
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {STATUS_OPTIONS.map(({ value, label }) => (
                              <button
                                key={value}
                                onClick={() => setStatus(value)}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                                  status === value
                                    ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                                    : "bg-white/5 text-text-secondary hover:bg-white/8"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Priority + Energy */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-text-muted">
                              优先级
                            </label>
                            <div className="flex gap-1.5">
                              {(["low", "medium", "high"] as TodoPriority[]).map((p) => {
                                const cfg = PRIORITY_CONFIG[p];
                                return (
                                  <button
                                    key={p}
                                    onClick={() => setPriority(p)}
                                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                                      priority === p
                                        ? "bg-white/10 text-text-primary ring-1 ring-white/10"
                                        : "bg-white/5 text-text-secondary hover:bg-white/8"
                                    }`}
                                  >
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${cfg.color} ${cfg.glow}`}
                                    />
                                    {cfg.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-text-muted">
                              精力等级
                            </label>
                            <div className="flex gap-1.5">
                              {([
                                { key: "high" as EnergyLevel, icon: Zap, label: "高" },
                                { key: "medium" as EnergyLevel, icon: BatteryMedium, label: "中" },
                                { key: "low" as EnergyLevel, icon: Coffee, label: "低" },
                              ] as const).map(({ key, icon: Icon, label }) => {
                                const cfg = ENERGY_CONFIG[key];
                                const isActive = energyLevel === key;
                                return (
                                  <button
                                    key={key}
                                    onClick={() =>
                                      setEnergyLevel(isActive ? undefined : key)
                                    }
                                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
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
                        </div>

                        {/* Due Date + Estimated Time */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-text-muted">
                              截止日期
                            </label>
                            <DatePicker
                              value={dueAt}
                              onChange={setDueAt}
                              placeholder="选择日期"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-text-muted">
                              预计耗时（分钟）
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                value={estimatedMinutes ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value
                                    ? parseInt(e.target.value, 10)
                                    : undefined;
                                  if (val !== undefined && (isNaN(val) || val < 0)) return;
                                  setEstimatedMinutes(val);
                                }}
                                placeholder="未估算"
                                className="flex-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                              {estimatedMinutes !== undefined && estimatedMinutes > 0 && (
                                <span className="text-[10px] text-text-muted whitespace-nowrap">
                                  ≈{" "}
                                  {estimatedMinutes >= 60
                                    ? `${(estimatedMinutes / 60).toFixed(1)}h`
                                    : `${estimatedMinutes}m`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-medium text-text-muted">
                            标签
                          </label>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-text-secondary"
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
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                                placeholder="新标签"
                                className="w-16 rounded-md border border-white/5 bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                              <button
                                onClick={handleAddTag}
                                disabled={!newTag.trim()}
                                className="rounded-md p-0.5 text-text-muted transition-colors hover:text-primary disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                aria-label="添加标签"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Project selector */}
                    {projects.length > 0 && (
                      <div className="flex items-center gap-2 border-t border-white/5 px-7 py-2.5 sm:px-8">
                        <span className="text-[10px] text-text-muted shrink-0">项目</span>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => setSelectedProjectId(undefined)}
                            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              !selectedProjectId
                                ? "bg-primary/15 text-primary"
                                : "bg-white/5 text-text-muted hover:bg-white/8"
                            }`}
                          >
                            默认
                          </button>
                          {projects.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setSelectedProjectId(p.id)}
                              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                selectedProjectId === p.id
                                  ? "bg-primary/15 text-primary"
                                  : "bg-white/5 text-text-muted hover:bg-white/8"
                              }`}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: p.color ?? "#7C3AED" }}
                              />
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer hints */}
                  <div className="flex shrink-0 items-center justify-between border-t border-white/5 px-7 py-3 sm:px-8">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {settings.aiEnabled && settings.apiBaseUrl && settings.apiKey && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-text-muted leading-none">
                          <kbd className="rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] leading-none">
                            Win+↵
                          </kbd>
                          <span className="text-accent">AI 整理</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted leading-none">
                        <kbd className="rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] leading-none">
                          Enter
                        </kbd>
                        <span>
                          {settings.aiEnabled && settings.autoParse ? "保存并整理" : "保存"}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted leading-none">
                        <kbd className="rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] leading-none">
                          Esc
                        </kbd>
                        <span>关闭</span>
                      </span>
                      {speechSupported && settings.speechEnabled && (
                        <button
                          onClick={toggleSpeech}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            isListening
                              ? "bg-danger/15 text-danger animate-pulse"
                              : "bg-white/5 text-text-muted hover:text-text-secondary"
                          }`}
                          aria-label={isListening ? "停止语音输入" : "开始语音输入"}
                        >
                          <Mic className="h-3 w-3" />
                          {isListening ? "停止" : "语音"}
                          <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] leading-none ml-0.5">
                            Space
                          </kbd>
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => handleSave(false)}
                      disabled={isEmpty || isSubmitting}
                      className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CornerDownLeft className="h-3 w-3" />
                      )}
                      {isSubmitting ? "保存中…" : "保存"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Chat messages */}
                  <div className="flex-1 overflow-hidden px-7 py-4 sm:px-8">
                    <div className="h-full overflow-y-auto">
                      <ChatBubble
                        messages={chatMessages}
                        isStreaming={isStreaming}
                        streamingContent={streamingContent}
                        selectedTodoId={selectedTodoId}
                        onAction={handleChatAction}
                      />
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  {/* Chat input */}
                  <div className="shrink-0 border-t border-white/5 px-7 py-3 sm:px-8">
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={chatInputRef}
                        value={chatInput}
                        onChange={(e) => {
                          setChatInput(e.target.value);
                          chatAutoResize();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendChatMessage(chatInput);
                          }
                        }}
                        placeholder={
                          isListening
                            ? "正在听…"
                            : speechSupported && settings.speechEnabled
                            ? "按住空格说话，或输入消息…"
                            : "输入消息…"
                        }
                        rows={1}
                        className="flex-1 resize-none rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        style={{ minHeight: "2.5rem", maxHeight: "8rem" }}
                      />
                      {speechSupported && settings.speechEnabled && (
                        <button
                          onClick={toggleSpeech}
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            isListening
                              ? "bg-danger/15 text-danger animate-pulse"
                              : "bg-white/5 text-text-muted hover:bg-white/8 hover:text-text-secondary"
                          }`}
                          aria-label={isListening ? "停止语音输入" : "开始语音输入"}
                        >
                          <Mic className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => sendChatMessage(chatInput)}
                        disabled={!chatInput.trim() || isStreaming}
                        className="flex h-9 shrink-0 items-center justify-center rounded-xl bg-primary px-3 text-xs font-medium text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/50"
                        aria-label="发送"
                      >
                        {isStreaming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CornerDownLeft className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-text-muted">
                        {isListening ? "松开空格发送" : "Shift + Enter 换行"}
                      </span>
                      {selectedTodoId && (
                        <span className="text-[10px] text-text-muted">
                          当前任务: {(() => {
                            const t = todos.find((t) => t.id === selectedTodoId);
                            if (!t) return null;
                            const title = t.title.slice(0, 20) + (t.title.length > 20 ? "…" : "");
                            return title;
                          })()}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
