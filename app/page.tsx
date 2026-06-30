"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useFlowState } from "@/lib/store";
import { initDb, getAllTodos, updateTodo, getAllProjects, addTodo } from "@/lib/db";
import { loadSettings } from "@/lib/settings";
import { checkRecurringTemplates } from "@/lib/recurrence";
import Sidebar from "@/components/Sidebar";
import TodoList from "@/components/TodoList";
import CalendarView from "@/components/CalendarView";
import QuickCapture from "@/components/QuickCapture";
import TodoDetail from "@/components/TodoDetail";
import SettingsPanel from "@/components/SettingsPanel";
import ToastContainer from "@/components/Toast";
import DailyReview from "@/components/DailyReview";
import AiPlanningPanel from "@/components/AiPlanningPanel";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  useDndContext,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { TodoItem, TodoStatus } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";
import {
  Circle,
  CheckCircle2,
  Tag,
  Clock,
} from "lucide-react";

export default function Home() {
  const {
    setTodos,
    setProjects,
    setSettings,
    setDbError,
    showToast,
    dbError,
    settings,
    todos,
    currentStatus,
    reorderTodos,
    updateTodo: updateInStore,
    viewMode,
  } = useFlowState();

  const [activeTodo, setActiveTodo] = useState<TodoItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    async function bootstrap() {
      try {
        await initDb();
        const [todos, projects, settings] = await Promise.all([
          getAllTodos(),
          getAllProjects(),
          Promise.resolve(loadSettings()),
        ]);
        setTodos(todos);
        setProjects(projects.length > 0 ? projects : [{
          id: "default",
          name: "收件箱",
          color: "#7C3AED",
          order: 0,
          createdAt: Date.now(),
        }]);
        setSettings(settings);

        // Check recurring templates and generate instances
        const newInstances = checkRecurringTemplates(todos);
        if (newInstances.length > 0) {
          for (const instance of newInstances) {
            await addTodo(instance);
          }
          // Update templates' lastGenerated
          const now = Date.now();
          for (const template of todos.filter((t) => t.isRecurringTemplate && t.recurrenceRule)) {
            if (template.recurrenceRule) {
              await updateTodo(template.id, {
                recurrenceRule: { ...template.recurrenceRule, lastGenerated: now },
              });
            }
          }
          setTodos([...newInstances, ...todos]);
          showToast(`已生成 ${newInstances.length} 个循环任务`, "info");
        }
      } catch (err) {
        console.error("Bootstrap failed:", err);
        const message =
          err instanceof Error ? err.message : "应用初始化失败";
        setDbError(message);
        showToast(message, "error");
      }
    }
    bootstrap();
  }, [setTodos, setProjects, setSettings, setDbError, showToast]);

  // Toggle ambient motion class on body
  useEffect(() => {
    if (settings.ambientMotionEnabled) {
      document.body.classList.add("ambient-motion");
    } else {
      document.body.classList.remove("ambient-motion");
    }
    return () => {
      document.body.classList.remove("ambient-motion");
    };
  }, [settings.ambientMotionEnabled]);

  const handleDragStart = (event: DragStartEvent) => {
    const todo = todos.find((t) => t.id === event.active.id);
    if (todo) setActiveTodo(todo);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTodo(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // 跨 tab 拖拽到 sidebar
    if (
      typeof over.id === "string" &&
      over.id.startsWith("sidebar-")
    ) {
      const newStatus = over.id.replace("sidebar-", "") as TodoStatus;
      const todo = todos.find((t) => t.id === active.id);
      if (todo && todo.status !== newStatus) {
        try {
          await updateTodo(todo.id, { status: newStatus });
          updateInStore(todo.id, { status: newStatus });
          const statusLabels: Record<TodoStatus, string> = {
            inbox: "Inbox",
            today: "Today",
            doing: "Doing",
            done: "Done",
            archived: "Archived",
            error: "Error",
          };
          showToast(
            `已移动到 ${statusLabels[newStatus]}`,
            "success"
          );
        } catch {
          showToast("移动失败", "error");
        }
      }
      return;
    }

    // 日历拖拽：任务拖到日期格子
    if (
      typeof active.id === "string" &&
      active.id.startsWith("cal-") &&
      typeof over.id === "string" &&
      over.id.startsWith("day-")
    ) {
      const todoId = active.id.replace("cal-", "");
      const dayTs = parseInt(over.id.replace("day-", ""), 10);
      const todo = todos.find((t) => t.id === todoId);
      if (todo) {
        const newDueAt = new Date(dayTs);
        newDueAt.setHours(23, 59, 59, 999);
        try {
          await updateTodo(todoId, { dueAt: newDueAt.getTime() });
          updateInStore(todoId, { dueAt: newDueAt.getTime() });
          showToast("已调整截止日期", "success");
        } catch {
          showToast("调整截止日期失败", "error");
        }
      }
      return;
    }

    // 列表内排序
    const statusTodos = todos
      .filter((t) => t.status === currentStatus)
      .sort((a, b) => b.order - a.order);
    const oldIndex = statusTodos.findIndex(
      (t) => t.id === active.id
    );
    const newIndex = statusTodos.findIndex(
      (t) => t.id === over.id
    );
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderTodos(currentStatus, oldIndex, newIndex);
    }
  };

  if (dbError) {
    return (
      <div className="relative z-10 flex h-screen items-center justify-center p-4">
        <div className="glass-strong max-w-sm rounded-2xl p-6 text-center shadow-glass">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/15">
            <svg
              className="h-6 w-6 text-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-text-primary">
            应用初始化失败
          </h2>
          <p className="mt-2 text-sm text-text-secondary">{dbError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="relative z-10 flex h-screen flex-col gap-3 p-3 sm:flex-row">
        <Sidebar />
        <main className="glass flex flex-1 flex-col overflow-hidden rounded-2xl px-4 py-4 sm:px-6">
          {viewMode === "list" ? <TodoList /> : <CalendarView todos={todos} />}
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTodo ? <DragPreview todo={activeTodo} /> : null}
      </DragOverlay>

      <QuickCapture />
      <TodoDetail />
      <SettingsPanel />
      <DailyReview />
      <AiPlanningPanel />
      <ToastContainer />
    </DndContext>
  );
}

/* ─── Drag preview (shown under cursor during drag) ─── */
function DragPreview({ todo }: { todo: TodoItem }) {
  const { activatorEvent, activeNodeRect } = useDndContext();
  const priority = PRIORITY_CONFIG[todo.priority];
  const isDone = todo.status === "done";

  // Compute mouse offset relative to the original card so the preview
  // spawns at the click position instead of the card's top-left corner.
  const offset = useMemo(() => {
    if (!activatorEvent || !activeNodeRect) return null;

    let clientX = 0;
    let clientY = 0;
    if ("clientX" in activatorEvent) {
      clientX = (activatorEvent as MouseEvent).clientX;
      clientY = (activatorEvent as MouseEvent).clientY;
    } else if (
      "touches" in activatorEvent &&
      (activatorEvent as TouchEvent).touches.length > 0
    ) {
      clientX = (activatorEvent as TouchEvent).touches[0].clientX;
      clientY = (activatorEvent as TouchEvent).touches[0].clientY;
    } else {
      return null;
    }

    return {
      x: clientX - activeNodeRect.left,
      y: clientY - activeNodeRect.top,
    };
  }, [activatorEvent, activeNodeRect]);

  // Outer wrapper handles positioning (so mouse stays at preview center),
  // inner motion.div handles the scale/opacity entrance — separated so
  // framer-motion's transform doesn't override the centering translate.
  const wrapperStyle: React.CSSProperties = offset
    ? {
        marginLeft: offset.x,
        marginTop: offset.y,
        transform: "translate(-50%, -50%)",
      }
    : {};

  const previewStyle: React.CSSProperties = {
    boxShadow:
      "0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(124,58,237,0.3)",
  };

  // Masonry rich card preview (inbox / today / doing)
  if (["inbox", "today", "doing"].includes(todo.status)) {
    return (
      <div style={wrapperStyle}>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 0.95,
            scale: 1,
            transition: {
              opacity: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
            },
          }}
          className="glass pointer-events-none w-[260px] rounded-2xl p-4 shadow-glass-strong ring-2 ring-primary/30 will-change-transform"
          style={previewStyle}
        >
        <div className="flex items-start gap-2.5">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              isDone ? "text-success" : "text-text-muted"
            }`}
          >
            {isDone ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </div>
          <h4
            className={`min-w-0 flex-1 text-sm font-medium leading-snug ${
              isDone
                ? "text-text-muted line-through"
                : "text-text-primary"
            }`}
          >
            {todo.title}
          </h4>
        </div>

        {(todo.note || todo.rawInput !== todo.title) && (
          <p className="mt-2 line-clamp-2 text-xs text-text-secondary">
            {todo.note || todo.rawInput}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <span
              className={`h-2 w-2 rounded-full ${priority.color} ${priority.glow}`}
            />
          </span>
          {todo.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
          {todo.tags.length > 2 && (
            <span className="text-[10px] text-text-muted">
              +{todo.tags.length - 2}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock className="h-2.5 w-2.5" />
            {formatDate(todo.createdAt)}
          </span>
        </div>
      </motion.div>
      </div>
    );
  }

  // Standard card preview for other statuses
  return (
    <div style={wrapperStyle}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{
          opacity: 0.95,
          scale: 1.02,
          transition: {
            opacity: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
            scale: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="glass pointer-events-none w-[320px] rounded-2xl p-4 shadow-glass-strong ring-2 ring-primary/30 will-change-transform"
        style={previewStyle}
      >
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div
            className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
              isDone ? "text-success" : "text-text-muted"
            }`}
          >
            {isDone ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h4
            className={`text-sm font-medium leading-snug ${
              isDone
                ? "text-text-muted line-through"
                : "text-text-primary"
            }`}
          >
            {todo.title}
          </h4>

          {(todo.note || todo.rawInput !== todo.title) && (
            <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
              {todo.note || todo.rawInput}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${priority.color} ${priority.glow}`}
              />
            </span>

            {todo.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-text-muted"
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
            {todo.tags.length > 3 && (
              <span className="text-[10px] text-text-muted">
                +{todo.tags.length - 3}
              </span>
            )}

            <span className="flex items-center gap-1 text-[10px] text-text-muted">
              <Clock className="h-2.5 w-2.5" />
              {formatDate(todo.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
