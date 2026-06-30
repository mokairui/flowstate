"use client";

import { useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Circle,
  CheckCircle2,
  Archive,
  Trash2,
  Tag,
  ArrowRight,
  Clock,
  FileCode,
  Sigma,
  Sparkles,
  Zap,
  Target,
  ChevronRight,
  Calendar,
  Timer,
  Play,
  Pause,
  Square,
  CheckSquare,
  BatteryMedium,
  Coffee,
} from "lucide-react";
import { useFlowState } from "@/lib/store";
import { updateTodo } from "@/lib/db";
import { PRIORITY_CONFIG, ENERGY_CONFIG } from "@/lib/types";
import type { TodoItem, TodoStatus, EnergyLevel, SubtaskItem } from "@/lib/types";
import { useTaskAge } from "@/lib/useTaskAge";
import { formatRelativeDate, isOverdue } from "@/lib/date-utils";
import { usePomodoro, formatTime } from "@/lib/usePomodoro";
import HighlightText from "./HighlightText";

interface TodoCardProps {
  todo: TodoItem;
  index: number;
  isSelected?: boolean;
  highlightQuery?: string;
  isSortable?: boolean;
}

const nextStatusMap: Record<TodoStatus, TodoStatus | null> = {
  inbox: "today",
  today: "doing",
  doing: "done",
  done: null,
  archived: null,
  error: null,
};

/** 老化提示只在这几个状态下显示 */
const AGING_STATUSES: TodoStatus[] = ["inbox", "today"];

export default function TodoCard({
  todo,
  index,
  isSelected = false,
  highlightQuery = "",
  isSortable = false,
}: TodoCardProps) {
  const {
    updateTodo: updateInStore,
    openDetail,
    showToast,
    softDelete,
    bulkMode,
    selectedIds,
    toggleSelected,
    selectRange,
    setBulkMode,
    userEnergyMode,
  } = useFlowState();

  // For range select, we need the visible todo IDs in this status
  const { todos, currentStatus, currentProjectId, searchAllProjects, searchQuery } = useFlowState();
  const visibleIds = useMemo(() => {
    let result = todos.filter((t) => t.status === currentStatus);
    if (!searchAllProjects && currentProjectId) {
      result = result.filter((t) => t.projectId === currentProjectId || !t.projectId);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.rawInput.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          (t.note?.toLowerCase().includes(q) ?? false)
      );
    }
    return result.sort((a, b) => b.order - a.order).map((t) => t.id);
  }, [todos, currentStatus, currentProjectId, searchAllProjects, searchQuery]);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastSelectedRef = useRef<string | null>(null);
  const freezeRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: todo.id,
    disabled: !isSortable,
    // 关闭 dnd-kit 在 sortable items 顺序变化后施加的 settle 过渡。
    // 原因：列表在 inbox/today/doing 用 CSS 多列瀑布流（TodoList.tsx 的 columns-* 类），
    // 而 SortableContext 用的是 verticalListSortingStrategy——它按"单一竖列"模型算 transform。
    // 跨视觉列交换释放时，被交换卡片的 DOM 位置被 CSS columns 重新分列，
    // 若此时 useSortable 又返回非空 transition，会把 transform 从"按竖列算出的错位偏移"
    // 用 200ms 动画滑回 identity，肉眼看到一次"闪/飘"。
    // 关掉 layout-change 过渡后，transform 在重渲染那帧直接复位，CSS 重新布局接管，
    // 没有中间帧；拖拽进行中的实时让位位移仍由 transform 直接驱动，手感不变。
    animateLayoutChanges: () => false,
  });

  // 源卡片淡出时加上短暂过渡，避免与 DragOverlay 出现产生“瞬切”观感。
  // 注意：必须始终用 `transition` 简写或始终用 `transition*` 长写，不能混用——
  // 否则 React 在 rerender 时会触发 “mix shorthand and non-shorthand” 警告。
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition:
      transition ?? "opacity 140ms cubic-bezier(0.25,0.46,0.45,0.94)",
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.35 : 1,
  };

  // Merge sortable listeners/attributes for the whole card
  const sortableProps = isSortable
    ? { ...attributes, ...listeners }
    : {};

  const { ageCategory, ageLabel } = useTaskAge(todo);
  const showAging = AGING_STATUSES.includes(todo.status) && ageCategory !== "fresh";

  const isMasonry = ["inbox", "today", "doing"].includes(todo.status);
  const overdue = todo.dueAt ? isOverdue(todo.dueAt) : false;
  const dueLabel = todo.dueAt ? formatRelativeDate(todo.dueAt) : null;

  // Pomodoro
  const pomodoro = usePomodoro(todo.id);
  const showPomodoro = todo.status === "doing" || (todo.pomodoros ?? 0) > 0;
  const isPomodoroRunningHere = pomodoro.isActive && pomodoro.isRunning;
  const hasOtherPomodoroRunning = useFlowState((s) => s.pomodoroIsRunning && s.pomodoroTodoId !== todo.id);

  // Bulk selection
  const isBulkSelected = selectedIds.has(todo.id);

  const handleCardClick = (e: React.MouseEvent) => {
    if (bulkMode) {
      if (e.shiftKey && lastSelectedRef.current) {
        // Range select
        const startIdx = visibleIds.indexOf(lastSelectedRef.current);
        const endIdx = visibleIds.indexOf(todo.id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
          selectRange(visibleIds.slice(min, max + 1));
        }
      } else {
        toggleSelected(todo.id);
        lastSelectedRef.current = todo.id;
      }
      return;
    }
    openDetail(todo.id);
  };

  // Scroll selected card into view
  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const newStatus: TodoStatus = todo.status === "done" ? "inbox" : "done";
    const changes: Partial<TodoItem> = {
      status: newStatus,
      completedAt: newStatus === "done" ? now : undefined,
    };
    try {
      await updateTodo(todo.id, changes);
      updateInStore(todo.id, changes);

      // Freeze flash animation on complete
      if (newStatus === "done" && freezeRef.current) {
        freezeRef.current.classList.remove("freeze-flash");
        // force reflow
        void freezeRef.current.offsetWidth;
        freezeRef.current.classList.add("freeze-flash");
      }

      showToast(newStatus === "done" ? "任务已完成" : "任务已恢复", "success");
    } catch {
      showToast("操作失败", "error");
    }
  };

  const handleMoveNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = nextStatusMap[todo.status];
    if (!next) return;
    try {
      await updateTodo(todo.id, { status: next });
      updateInStore(todo.id, { status: next });
      showToast(`已移动到 ${getStatusLabel(next)}`, "success");
    } catch {
      showToast("操作失败", "error");
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateTodo(todo.id, {
        status: "archived",
        archivedAt: Date.now(),
      });
      updateInStore(todo.id, {
        status: "archived",
        archivedAt: Date.now(),
      });
      showToast("已归档", "success");
    } catch {
      showToast("操作失败", "error");
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    softDelete(todo);
  };

  const priority = PRIORITY_CONFIG[todo.priority];
  const isDone = todo.status === "done";
  const canMoveNext = nextStatusMap[todo.status] !== null;

  // Energy dimming
  const isEnergyDimmed =
    userEnergyMode !== null &&
    todo.energyLevel &&
    Math.abs(
      (userEnergyMode === "high" ? 3 : userEnergyMode === "medium" ? 2 : 1) -
      (todo.energyLevel === "high" ? 3 : todo.energyLevel === "medium" ? 2 : 1)
    ) >= 2;

  const energyIconMap: Record<EnergyLevel, typeof Zap> = {
    high: Zap,
    medium: BatteryMedium,
    low: Coffee,
  };

  // ── Masonry rich card (inbox / today / doing) ──
  if (isMasonry) {
    const hasAi = todo.aiSummary && (
      todo.aiSummary.action ||
      todo.aiSummary.context ||
      todo.aiSummary.suggestedNextStep ||
      (todo.aiSummary.relatedFiles?.length ?? 0) > 0 ||
      (todo.aiSummary.relatedSymbols?.length ?? 0) > 0 ||
      (todo.aiSummary.subtasks?.length ?? 0) > 0
    );

    return (
      <div
        ref={(node) => {
          setNodeRef(node);
          (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={style}
        className={`break-inside-avoid mb-3 ${isSortable ? "touch-none" : ""}`}
        {...sortableProps}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, transition: { delay: index * 0.03, duration: 0.25 } }}
          animate={{
            opacity: isDone ? 0.6 : isEnergyDimmed ? 0.4 : 1,
            y: 0,
            transition: { duration: 0.25 },
          }}
          exit={{ opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.2 } }}
          whileTap={{ scale: bulkMode ? 0.98 : 0.96, transition: { duration: 0.1, ease: [0.4, 0, 0.2, 1] } }}
          onClick={handleCardClick}
          className={`group glass relative rounded-2xl p-4 transition-all duration-[400ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:-translate-y-1 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-primary/40 ${
            isSelected ? "ring-2 ring-primary/40 shadow-glow-purple" : ""
          } ${
            showAging ? `task-aging task-aging--${ageCategory}` : ""
          } ${overdue ? "ring-1 ring-danger/40 shadow-[0_0_12px_rgba(248,113,113,0.15)]" : ""} ${isPomodoroRunningHere ? "ring-1 ring-primary/50 shadow-[0_0_16px_rgba(124,58,237,0.2)] animate-pomodoro-pulse" : ""} ${bulkMode ? (isBulkSelected ? "ring-2 ring-primary/50 bg-primary/5" : "cursor-pointer") : "cursor-pointer"}`}
          tabIndex={0}
          role="option"
          aria-selected={isSelected}
          aria-label={`任务: ${todo.title}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openDetail(todo.id);
            }
          }}
        >
        {/* Freeze flash overlay */}
        <div
          ref={freezeRef}
          className="pointer-events-none absolute inset-0 rounded-2xl"
          aria-hidden="true"
        />

        {/* Header: Complete/Checkbox + Title + Pomodoro */}
        <div className="flex items-start gap-2.5">
          {bulkMode ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSelected(todo.id);
                lastSelectedRef.current = todo.id;
              }}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                isBulkSelected
                  ? "bg-primary/20 text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
              aria-label={isBulkSelected ? "取消选择" : "选择"}
            >
              {isBulkSelected ? (
                <CheckSquare className="h-5 w-5" />
              ) : (
                <Square className="h-5 w-5" />
              )}
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                isDone
                  ? "text-success"
                  : "text-text-muted hover:text-success hover:shadow-[0_0_8px_rgba(52,211,153,0.4)]"
              }`}
              aria-label={isDone ? "标记为未完成" : "标记为已完成"}
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>
          )}
          <h4
            className={`min-w-0 flex-1 text-sm font-medium leading-snug ${
              isDone ? "line-through text-text-muted" : "text-text-primary"
            }`}
          >
            <HighlightText text={todo.title} query={highlightQuery} />
          </h4>

          {/* Pomodoro mini UI for doing tasks */}
          {showPomodoro && (
            <div className="flex shrink-0 items-center gap-1">
              {isPomodoroRunningHere ? (
                <span className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary animate-pulse">
                  <Timer className="h-3 w-3" />
                  {formatTime(pomodoro.remaining)}
                </span>
              ) : todo.status === "doing" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    pomodoro.start();
                  }}
                  disabled={hasOtherPomodoroRunning}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="开始专注"
                  title={hasOtherPomodoroRunning ? "其他任务正在专注中" : "开始专注"}
                >
                  <Play className="h-3 w-3" />
                </button>
              ) : todo.pomodoros ? (
                <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
                  <Timer className="h-3 w-3" />
                  {todo.pomodoros}
                </span>
              ) : null}
            </div>
          )}

          {/* F-2 子任务进度：圆环 + done/total，仅当存在子任务时渲染 */}
          {(todo.subtasks?.length ?? 0) > 0 && <SubtaskProgressRing subtasks={todo.subtasks!} />}
        </div>

        {/* Raw input */}
        {todo.rawInput !== todo.title && (
          <div className="mt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">原始输入</span>
            <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">
              <HighlightText text={todo.rawInput} query={highlightQuery} />
            </p>
          </div>
        )}

        {/* Note */}
        {todo.note && (
          <div className="mt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">备注</span>
            <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">
              <HighlightText text={todo.note} query={highlightQuery} />
            </p>
          </div>
        )}

        {/* AI Summary */}
        {hasAi && (
          <div className="mt-3 rounded-xl bg-white/[0.03] p-3 space-y-2">
            {todo.aiSummary!.action && (
              <div className="flex items-start gap-1.5">
                <Zap className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Action</span>
                  <p className="text-xs leading-relaxed text-text-secondary">{todo.aiSummary!.action}</p>
                </div>
              </div>
            )}
            {todo.aiSummary!.context && (
              <div className="flex items-start gap-1.5">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">Context</span>
                  <p className="text-xs leading-relaxed text-text-secondary">{todo.aiSummary!.context}</p>
                </div>
              </div>
            )}
            {todo.aiSummary!.suggestedNextStep && (
              <div className="flex items-start gap-1.5">
                <Target className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">Next</span>
                  <p className="text-xs leading-relaxed text-text-secondary">{todo.aiSummary!.suggestedNextStep}</p>
                </div>
              </div>
            )}

            {/* Related files */}
            {(todo.aiSummary!.relatedFiles?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {todo.aiSummary!.relatedFiles!.slice(0, 3).map((file) => (
                  <span
                    key={file}
                    className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-text-muted"
                  >
                    <FileCode className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[80px]">{file}</span>
                  </span>
                ))}
                {(todo.aiSummary!.relatedFiles!.length ?? 0) > 3 && (
                  <span className="text-[10px] text-text-muted">
                    +{todo.aiSummary!.relatedFiles!.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Related symbols */}
            {(todo.aiSummary!.relatedSymbols?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {todo.aiSummary!.relatedSymbols!.slice(0, 3).map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                  >
                    <Sigma className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[80px]">{sym}</span>
                  </span>
                ))}
                {(todo.aiSummary!.relatedSymbols!.length ?? 0) > 3 && (
                  <span className="text-[10px] text-text-muted">
                    +{todo.aiSummary!.relatedSymbols!.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* F-2 子任务列表（实体）：与 AI 卡片解耦，手工添加也能在卡片上看到 */}
        {todo.status !== "inbox" && (todo.subtasks?.length ?? 0) > 0 && (
          <div className="mt-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-success">
              子任务{` · ${todo.subtasks!.filter((s) => s.done).length}/${todo.subtasks!.length}`}
            </span>
            <ul className="mt-1 space-y-1">
              {todo.subtasks!
                .slice()
                .sort((a, b) => a.order - b.order)
                .slice(0, 5)
                .map((sub) => (
                  <li key={sub.id} className="flex items-start gap-1.5 text-xs">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                        sub.done ? "bg-success" : "bg-success/40"
                      }`}
                    />
                    <span
                      className={`leading-relaxed ${
                        sub.done ? "text-text-muted line-through" : "text-text-secondary"
                      }`}
                    >
                      {sub.text}
                    </span>
                  </li>
                ))}
              {todo.subtasks!.length > 5 && (
                <li className="text-[10px] text-text-muted pl-3">
                  +{todo.subtasks!.length - 5} 更多
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Priority */}
          <span className="flex items-center gap-1">
            <span
              className={`h-2 w-2 rounded-full ${priority.color} ${priority.glow}`}
              title={`优先级: ${priority.label}`}
            />
          </span>

          {/* Energy */}
          {todo.energyLevel && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] ${ENERGY_CONFIG[todo.energyLevel].bgColor} ${ENERGY_CONFIG[todo.energyLevel].color}`}
              title={`精力: ${ENERGY_CONFIG[todo.energyLevel].label}`}
            >
              {(() => {
                const Icon = energyIconMap[todo.energyLevel!];
                return <Icon className="h-2.5 w-2.5" />;
              })()}
              {ENERGY_CONFIG[todo.energyLevel].label}
            </span>
          )}

          {/* Tags */}
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
            <span className="text-[10px] text-text-muted">+{todo.tags.length - 2}</span>
          )}

          {/* Due date */}
          {dueLabel && (
            <span
              className={`flex items-center gap-1 text-[10px] font-medium ${
                overdue ? "text-danger" : "text-text-muted"
              }`}
            >
              <Calendar className="h-2.5 w-2.5" />
              {dueLabel}
            </span>
          )}

          {/* Estimated time */}
          {todo.estimatedMinutes !== undefined && todo.estimatedMinutes > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-text-muted">
              <Timer className="h-2.5 w-2.5" />
              {todo.estimatedMinutes >= 60
                ? `${(todo.estimatedMinutes / 60).toFixed(1)}h`
                : `${todo.estimatedMinutes}m`}
            </span>
          )}

          {/* Date */}
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock className="h-2.5 w-2.5" />
            {formatDate(todo.createdAt)}
          </span>

          {/* Age indicator */}
          {showAging && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                ageCategory === "stale"
                  ? "bg-danger/10 text-danger"
                  : "bg-warning/10 text-warning"
              }`}
              title={`创建于 ${ageLabel}`}
            >
              {ageCategory === "stale" ? "已搁置" : "滞留"} {ageLabel}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-1">
          {canMoveNext && (
            <button
              onClick={handleMoveNext}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-accent focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="移动到下一状态"
              title="移动到下一状态"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          {todo.status !== "archived" && (
            <button
              onClick={handleArchive}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-warning focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="归档"
              title="归档"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-danger focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="删除"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
      </div>
    );
  }

  // ── Standard card shape (all other statuses) ──
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={style}
      className={isSortable ? "touch-none" : undefined}
      {...sortableProps}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, transition: { delay: index * 0.03, duration: 0.25 } }}
        animate={{
          opacity: isDone ? 0.6 : isEnergyDimmed ? 0.4 : 1,
          y: 0,
          transition: { duration: 0.25 },
        }}
        exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
        whileTap={{ scale: bulkMode ? 0.98 : 0.96, transition: { duration: 0.1, ease: [0.4, 0, 0.2, 1] } }}
        onClick={handleCardClick}
        className={`group glass relative rounded-2xl p-4 transition-all duration-[400ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          isSelected ? "ring-2 ring-primary/40 shadow-glow-purple" : ""
        } ${
          showAging ? `task-aging task-aging--${ageCategory}` : ""
        } ${overdue ? "ring-1 ring-danger/40 shadow-[0_0_12px_rgba(248,113,113,0.15)]" : ""} ${bulkMode ? (isBulkSelected ? "ring-2 ring-primary/50 bg-primary/5" : "cursor-pointer") : "cursor-pointer"}`}
        tabIndex={0}
        role="option"
        aria-selected={isSelected}
        aria-label={`任务: ${todo.title}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetail(todo.id);
          }
        }}
      >
      {/* Freeze flash overlay */}
      <div
        ref={freezeRef}
        className="pointer-events-none absolute inset-0 rounded-2xl"
        aria-hidden="true"
      />

      <div className="flex items-start gap-3">
        {/* Complete toggle / Bulk checkbox */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          {bulkMode ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSelected(todo.id);
                lastSelectedRef.current = todo.id;
              }}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                isBulkSelected
                  ? "bg-primary/20 text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
              aria-label={isBulkSelected ? "取消选择" : "选择"}
            >
              {isBulkSelected ? (
                <CheckSquare className="h-5 w-5" />
              ) : (
                <Square className="h-5 w-5" />
              )}
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                isDone
                  ? "text-success"
                  : "text-text-muted hover:text-success hover:shadow-[0_0_8px_rgba(52,211,153,0.4)]"
              }`}
              aria-label={isDone ? "标记为未完成" : "标记为已完成"}
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4
            className={`text-sm font-medium leading-snug ${
              isDone ? "line-through text-text-muted" : "text-text-primary"
            }`}
          >
            <HighlightText text={todo.title} query={highlightQuery} />
          </h4>

          {/* Raw input */}
          {todo.rawInput !== todo.title && (
            <div className="mt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">原始输入</span>
              <p className="line-clamp-2 text-xs text-text-secondary">
                <HighlightText text={todo.rawInput} query={highlightQuery} />
              </p>
            </div>
          )}

          {/* Note */}
          {todo.note && (
            <div className="mt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">备注</span>
              <p className="line-clamp-2 text-xs text-text-secondary">
                <HighlightText text={todo.note} query={highlightQuery} />
              </p>
            </div>
          )}

          {/* Meta row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {/* Priority dot */}
            <span className="flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${priority.color} ${priority.glow}`}
                title={`优先级: ${priority.label}`}
              />
            </span>

            {/* Energy */}
            {todo.energyLevel && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] ${ENERGY_CONFIG[todo.energyLevel].bgColor} ${ENERGY_CONFIG[todo.energyLevel].color}`}
                title={`精力: ${ENERGY_CONFIG[todo.energyLevel].label}`}
              >
                {(() => {
                  const Icon = energyIconMap[todo.energyLevel!];
                  return <Icon className="h-2.5 w-2.5" />;
                })()}
                {ENERGY_CONFIG[todo.energyLevel].label}
              </span>
            )}

            {/* Tags */}
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

            {/* Due date */}
            {dueLabel && (
              <span
                className={`flex items-center gap-1 text-[10px] font-medium ${
                  overdue ? "text-danger" : "text-text-muted"
                }`}
              >
                <Calendar className="h-2.5 w-2.5" />
                {dueLabel}
              </span>
            )}

            {/* Date */}
            <span className="flex items-center gap-1 text-[10px] text-text-muted">
              <Clock className="h-2.5 w-2.5" />
              {formatDate(todo.createdAt)}
            </span>

            {/* Age indicator */}
            {showAging && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  ageCategory === "stale"
                    ? "bg-danger/10 text-danger"
                    : "bg-warning/10 text-warning"
                }`}
                title={`创建于 ${ageLabel}`}
              >
                {ageCategory === "stale" ? "已搁置" : "滞留"} {ageLabel}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-row items-center gap-1">
          {canMoveNext && (
            <button
              onClick={handleMoveNext}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-accent focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="移动到下一状态"
              title="移动到下一状态"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
          {todo.status !== "archived" && (
            <button
              onClick={handleArchive}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-warning focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="归档"
              title="归档"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-danger focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="删除"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      </motion.div>
    </div>
  );
}

function getStatusLabel(status: TodoStatus): string {
  const labels: Record<TodoStatus, string> = {
    inbox: "Inbox",
    today: "Today",
    doing: "Doing",
    done: "Done",
    archived: "Archived",
    error: "Error",
  };
  return labels[status];
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

/**
 * F-2 子任务进度圆环：纯 SVG，依赖语义色（不引入新色值）。
 * 24×24 视图，14 半径，stroke 2，dasharray 表示完成度。
 */
function SubtaskProgressRing({ subtasks }: { subtasks: SubtaskItem[] }) {
  const total = subtasks.length;
  const done = subtasks.filter((s) => s.done).length;
  const ratio = total > 0 ? done / total : 0;
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const isAllDone = total > 0 && done === total;
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[10px] text-text-muted"
      title={`子任务 ${done}/${total}`}
      aria-label={`子任务完成 ${done} / 总 ${total}`}
    >
      <svg viewBox="0 0 18 18" width="14" height="14" className="shrink-0">
        <circle
          cx="9"
          cy="9"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
        <circle
          cx="9"
          cy="9"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 9 9)"
          className={isAllDone ? "text-success" : "text-accent"}
        />
      </svg>
      <span className={isAllDone ? "text-success" : undefined}>
        {done}/{total}
      </span>
    </span>
  );
}
