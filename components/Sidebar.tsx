"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import {
  Inbox,
  Sun,
  Play,
  CheckCircle2,
  Archive,
  Settings,
  Plus,
  AlertCircle,
  FolderOpen,
  ChevronDown,
  Zap,
  BatteryMedium,
  Coffee,
  X,
  Calendar,
  Sparkles,
} from "lucide-react";
import CapsuleLogo from "./CapsuleLogo";
import { useFlowState } from "@/lib/store";
import { TODO_STATUSES } from "@/lib/types";
import type { TodoStatus } from "@/lib/types";
import { getShortcutDisplay } from "@/lib/settings";
import { isDueToday } from "@/lib/date-utils";

const statusIcons: Record<TodoStatus, typeof Inbox> = {
  inbox: Inbox,
  today: Sun,
  doing: Play,
  done: CheckCircle2,
  archived: Archive,
  error: Inbox,
};

const statusColors: Record<TodoStatus, string> = {
  inbox: "",
  today: "text-warning",
  doing: "text-accent",
  done: "text-success",
  archived: "text-text-muted",
  error: "text-danger",
};

interface NavItemProps {
  value: TodoStatus;
  label: string;
  isActive: boolean;
  count: number;
  dueTodayCount?: number;
  onClick: () => void;
  currentStatus: TodoStatus;
}

function NavItem({ value, label, isActive, count, dueTodayCount, onClick, currentStatus }: NavItemProps) {
  const Icon = statusIcons[value];
  const { isOver, setNodeRef } = useDroppable({
    id: `sidebar-${value}`,
    disabled: currentStatus === value,
  });

  // Suppress the click event that fires immediately after a drag ends on top of
  // this nav item. dnd-kit clears its `active` state before the browser-synth
  // click fires, so checking `useDndContext().active` is too late — we instead
  // stamp a recent-drag timestamp via DndMonitor and ignore clicks within a
  // short window after dragEnd / dragCancel.
  const recentDragEndRef = useRef<number>(0);
  useDndMonitor({
    onDragEnd: () => {
      recentDragEndRef.current = Date.now();
    },
    onDragCancel: () => {
      recentDragEndRef.current = Date.now();
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-xl ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
    <button
      onClick={(e) => {
        // Within 300ms of a drag ending, treat any click on this button as the
        // tail of the drop gesture, not a real menu-switch click.
        if (Date.now() - recentDragEndRef.current < 300) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick();
      }}
      role="tab"
      aria-selected={isActive}
      className={`group relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
        isActive
          ? "bg-white/8 text-text-primary"
          : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
      } ${isOver ? "bg-primary/15 !text-primary" : ""}`}
    >
      {isActive && (
        <motion.div
          layoutId="active-nav"
          className="absolute inset-0 rounded-xl bg-white/[0.06]"
          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        />
      )}
      <Icon
        className={`relative z-10 h-4 w-4 ${
          isActive ? statusColors[value] || "text-text-primary" : "text-text-muted"
        }`}
      />
      <span className="relative z-10 flex-1 text-left">{label}</span>
      {dueTodayCount && dueTodayCount > 0 ? (
        <span
          className={`relative z-10 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs ${
            isActive
              ? "bg-danger/15 text-danger"
              : "bg-danger/10 text-danger"
          }`}
          title={`${dueTodayCount} 个任务今天截止`}
        >
          <AlertCircle className="h-3 w-3" />
          {dueTodayCount}
        </span>
      ) : count > 0 ? (
        <span
          className={`relative z-10 rounded-full px-2 py-0.5 text-xs ${
            isActive
              ? "bg-white/10 text-text-primary"
              : "bg-white/5 text-text-muted"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
    </div>
  );
}

export default function Sidebar() {
  const { currentStatus, setCurrentStatus, openQuickCapture, openSettings, todos, projects, currentProjectId, setCurrentProjectId, userEnergyMode, setUserEnergyMode, showToast, viewMode, setViewMode, setCalendarViewMode, openAiPlanning, settings } =
    useFlowState();

  const counts = todos.reduce(
    (acc, t) => {
      if (t.status !== "error" && !t.isRecurringTemplate) acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<TodoStatus, number>
  );

  const dueTodayCount = todos.filter(
    (t) =>
      !t.isRecurringTemplate &&
      (t.status === "today" || t.status === "doing") &&
      t.dueAt &&
      isDueToday(t.dueAt)
  ).length;

  const shortcut = getShortcutDisplay();

  // F-1 · Has a plan already been generated today?
  const plannedToday = (() => {
    if (!settings.lastPlanGeneratedAt) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return settings.lastPlanGeneratedAt >= today.getTime();
  })();

  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!projectMenuRef.current?.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <aside className="glass flex w-full flex-col gap-1 rounded-2xl p-2 sm:w-60">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
          <CapsuleLogo size={28} animate />
        </div>
        <span className="text-sm font-bold tracking-tight text-text-primary">
          FlowState
        </span>
      </div>

      {/* Project switcher */}
      <div ref={projectMenuRef} className="relative mx-1 mb-1">
        <button
          onClick={() => setShowProjectMenu(!showProjectMenu)}
          className="flex h-9 w-full items-center gap-2 rounded-xl bg-white/5 px-3 text-xs font-medium text-text-secondary transition-all hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="切换项目"
          aria-expanded={showProjectMenu}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: currentProject?.color ?? "#7C3AED" }} />
          <span className="flex-1 text-left truncate">{currentProject?.name ?? "全部项目"}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 text-text-muted transition-transform ${showProjectMenu ? "rotate-180" : ""}`} />
        </button>

        {showProjectMenu && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-white/5 bg-surface-solid shadow-glass">
            <button
              onClick={() => { setCurrentProjectId(null); setShowProjectMenu(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                !currentProjectId ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-white/5"
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              全部项目
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setCurrentProjectId(p.id); setShowProjectMenu(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  currentProjectId === p.id ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-white/5"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? "#7C3AED" }} />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Energy mode selector */}
      <div className="mx-1 mb-2 flex items-center gap-1 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => {
            setUserEnergyMode(null);
            showToast("已关闭能量过滤", "info");
          }}
          className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            userEnergyMode === null
              ? "bg-white/10 text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
          aria-label="关闭能量过滤"
          title="关闭能量过滤"
        >
          <X className="h-3 w-3" />
          关闭
        </button>
        <button
          onClick={() => {
            setUserEnergyMode("high");
            showToast("已切换为高能量模式，低精力任务已弱化", "info");
          }}
          className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            userEnergyMode === "high"
              ? "bg-danger/15 text-danger"
              : "text-text-muted hover:text-text-secondary"
          }`}
          aria-label="高能量模式"
          title="高能量模式"
        >
          <Zap className="h-3 w-3" />
          高能
        </button>
        <button
          onClick={() => {
            setUserEnergyMode("medium");
            showToast("已切换为正常能量模式", "info");
          }}
          className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            userEnergyMode === "medium"
              ? "bg-warning/15 text-warning"
              : "text-text-muted hover:text-text-secondary"
          }`}
          aria-label="正常能量模式"
          title="正常能量模式"
        >
          <BatteryMedium className="h-3 w-3" />
          正常
        </button>
        <button
          onClick={() => {
            setUserEnergyMode("low");
            showToast("已切换为低能量模式，高精力任务已弱化", "info");
          }}
          className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            userEnergyMode === "low"
              ? "bg-success/15 text-success"
              : "text-text-muted hover:text-text-secondary"
          }`}
          aria-label="低能量模式"
          title="低能量模式"
        >
          <Coffee className="h-3 w-3" />
          低能
        </button>
      </div>

      {/* Quick capture button */}
      <button
        onClick={openQuickCapture}
        className="mx-1 mb-2 flex h-10 items-center justify-center gap-2 rounded-xl bg-primary/10 text-sm font-medium text-primary transition-all hover:bg-primary/20 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="快速记录"
      >
        <Plus className="h-4 w-4" />
        快速记录
        <kbd className="ml-1 hidden rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          {shortcut}
        </kbd>
      </button>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5" role="tablist" aria-label="任务状态">
        {TODO_STATUSES.map(({ value, label }) => {
          const isActive = currentStatus === value;
          const count = counts[value] || 0;

          const navItem = (
            <NavItem
              key={value}
              value={value}
              label={label}
              isActive={isActive && viewMode === "list"}
              count={count}
              dueTodayCount={value === "today" ? dueTodayCount : undefined}
              onClick={() => {
                setViewMode("list");
                setCurrentStatus(value);
              }}
              currentStatus={currentStatus}
            />
          );

          // Inject AI Planning button to the right of Today
          if (value === "today") {
            return (
              <div key={value} className="flex items-center gap-1">
                <div className="flex-1">{navItem}</div>
                <button
                  onClick={openAiPlanning}
                  className={`group relative flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                    plannedToday
                      ? "bg-success/10 text-success hover:bg-success/20"
                      : "bg-accent/10 text-accent hover:bg-accent/20"
                  }`}
                  aria-label={plannedToday ? "AI 规划（今日已生成）" : "AI 规划"}
                  title={plannedToday ? "AI 规划（已规划）" : "AI 智能规划"}
                >
                  <Sparkles className="h-3 w-3" />
                  {plannedToday ? "已规划" : "AI 规划"}
                </button>
              </div>
            );
          }

          return navItem;
        })}
      </nav>

      {/* Calendar */}
      <button
        onClick={() => {
          setViewMode("calendar");
          setCalendarViewMode("month");
        }}
        className={`group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          viewMode === "calendar"
            ? "bg-white/8 text-text-primary"
            : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
        }`}
        aria-label="日历视图"
      >
        {viewMode === "calendar" && (
          <motion.div
            layoutId="active-nav"
            className="absolute inset-0 rounded-xl bg-white/[0.06]"
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
          />
        )}
        <Calendar className={`relative z-10 h-4 w-4 ${
          viewMode === "calendar" ? "text-accent" : "text-text-muted"
        }`} />
        <span className="relative z-10 flex-1 text-left">日历</span>
      </button>

      {/* Settings */}
      <button
        onClick={openSettings}
        className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-text-secondary transition-all hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="设置"
      >
        <Settings className="h-4 w-4 text-text-muted" />
        <span>设置</span>
      </button>
    </aside>
  );
}
