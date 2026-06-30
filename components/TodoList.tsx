"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, FolderOpen, CheckSquare, Clock, Sparkles } from "lucide-react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useFlowState } from "@/lib/store";
import { TODO_STATUSES } from "@/lib/types";
import TodoCard from "./TodoCard";
import EmptyState from "./EmptyState";
import BulkActionBar from "./BulkActionBar";
import TimeBlockTimeline from "./TimeBlockTimeline";
import DeadlineTimeline from "./DeadlineTimeline";

export default function TodoList() {
  const {
    todos,
    currentStatus,
    currentProjectId,
    searchQuery,
    setSearchQuery,
    selectedIndex,
    setSelectedIndex,
    openDetail,
    searchAllProjects,
    setSearchAllProjects,
    projects,
    bulkMode,
    setBulkMode,
    selectRange,
    clearSelection,
    userEnergyMode,
    openAiPlanning,
  } = useFlowState();

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Filter + search (sorted by order desc)
  const filteredTodos = useMemo(() => {
    let result = todos
      .filter((t) => t.status === currentStatus && !t.isRecurringTemplate)
      .sort((a, b) => b.order - a.order);

    // Filter by project (unless searching all projects)
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

    // Energy mode sorting for today/doing
    if ((currentStatus === "today" || currentStatus === "doing") && userEnergyMode) {
      const energyWeight = { high: 3, medium: 2, low: 1 };
      const modeW = energyWeight[userEnergyMode];
      result.sort((a, b) => {
        const diffA = Math.abs(energyWeight[a.energyLevel ?? "medium"] - modeW);
        const diffB = Math.abs(energyWeight[b.energyLevel ?? "medium"] - modeW);
        if (diffA !== diffB) return diffA - diffB;
        return b.order - a.order;
      });
    } else {
      result.sort((a, b) => b.order - a.order);
    }

    return result;
  }, [todos, currentStatus, searchQuery, currentProjectId, searchAllProjects, userEnergyMode]);

  const isSearching = searchQuery.trim().length > 0;

  // Clamp selected index when filter changes
  useEffect(() => {
    if (selectedIndex >= filteredTodos.length) {
      setSelectedIndex(filteredTodos.length > 0 ? 0 : -1);
    }
  }, [filteredTodos.length, selectedIndex, setSelectedIndex]);

  // Reset scroll position when status changes to prevent empty-state jumping
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [currentStatus]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bulk mode: Shift+A to select all visible
      if (e.shiftKey && e.key.toLowerCase() === "a" && !bulkMode) {
        e.preventDefault();
        setBulkMode(true);
        selectRange(filteredTodos.map((t) => t.id));
        return;
      }

      // Exit bulk mode on Esc
      if (e.key === "Escape" && bulkMode) {
        clearSelection();
        setBulkMode(false);
        return;
      }

      // `/` to focus search (when not typing in input/textarea)
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }

      // Arrow navigation when list is focused or search is focused
      const isNavContext =
        document.activeElement === searchRef.current ||
        document.activeElement === listRef.current ||
        listRef.current?.contains(document.activeElement as Node);

      if (!isNavContext) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(
          selectedIndex < filteredTodos.length - 1 ? selectedIndex + 1 : 0
        );
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          selectedIndex > 0 ? selectedIndex - 1 : filteredTodos.length - 1
        );
      }
      if (
        e.key === "Enter" &&
        selectedIndex >= 0 &&
        filteredTodos[selectedIndex]
      ) {
        e.preventDefault();
        openDetail(filteredTodos[selectedIndex].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredTodos, selectedIndex, setSelectedIndex, openDetail, bulkMode, setBulkMode, selectRange, clearSelection]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearchQuery("");
      searchRef.current?.blur();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredTodos.length > 0) {
        setSelectedIndex(0);
        listRef.current?.focus();
      }
    }
  };

  const currentLabel =
    TODO_STATUSES.find((s) => s.value === currentStatus)?.label ||
    currentStatus;

  const isMasonry = ["inbox", "today", "doing"].includes(currentStatus);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            {currentLabel}
          </h2>
          {currentProject && (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: `${currentProject.color ?? "#7C3AED"}18`,
                color: currentProject.color ?? "#7C3AED",
              }}
            >
              <FolderOpen className="h-3 w-3" />
              {currentProject.name}
            </span>
          )}
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-text-muted">
            {filteredTodos.length}
          </span>
          {currentStatus === "today" && (
            <span className="text-[10px] text-text-muted">
              {(() => {
                const total = filteredTodos.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);
                if (total === 0) return null;
                return `预计 ${total >= 60 ? `${(total / 60).toFixed(1)}h` : `${total}m`}`;
              })()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk mode toggle */}
          <button
            onClick={() => {
              if (bulkMode) {
                clearSelection();
                setBulkMode(false);
              } else {
                setBulkMode(true);
              }
            }}
            className={`flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
              bulkMode
                ? "bg-primary/15 text-primary"
                : "text-text-muted hover:bg-white/5"
            }`}
            aria-label={bulkMode ? "退出批量模式" : "进入批量模式"}
            title={bulkMode ? "退出批量模式 (Esc)" : "批量操作 (Shift+A 全选)"}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {bulkMode ? "退出" : "批量"}
          </button>

          {/* AI Planning button for today */}
          {currentStatus === "today" && (
            <button
              onClick={openAiPlanning}
              className="flex h-9 items-center gap-1 rounded-xl bg-accent/10 px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent/30"
              aria-label="AI 智能规划"
              title="AI 智能规划"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI 规划
            </button>
          )}

          {/* Timeline toggle for today/doing */}
          {(currentStatus === "today" || currentStatus === "doing") && (
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className={`flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                showTimeline
                  ? "bg-primary/15 text-primary"
                  : "text-text-muted hover:bg-white/5"
              }`}
              aria-label={showTimeline ? "隐藏时间线" : "显示时间线"}
              title="时段规划时间线"
            >
              <Clock className="h-3.5 w-3.5" />
              时间线
            </button>
          )}

          {/* Search all projects toggle */}
          {isSearching && currentProjectId && (
            <button
              onClick={() => setSearchAllProjects(!searchAllProjects)}
              className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                searchAllProjects
                  ? "bg-primary/15 text-primary"
                  : "text-text-muted hover:bg-white/5"
              }`}
            >
              {searchAllProjects ? "全部项目" : "当前项目"}
            </button>
          )}

          {/* Search */}
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索任务…"
              className="h-9 w-40 rounded-xl border border-white/5 bg-white/[0.02] pl-8 pr-7 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30 sm:w-56"
            />
            {isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 rounded p-0.5 text-text-muted hover:text-text-primary focus:outline-none"
                aria-label="清除搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {!isSearching && (
              <kbd className="pointer-events-none absolute right-2 hidden rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] text-text-muted sm:inline">
                /
              </kbd>
            )}
          </div>
        </div>
      </div>

      {/* Time Block Timeline */}
      {showTimeline && (currentStatus === "today" || currentStatus === "doing") && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4"
        >
          <TimeBlockTimeline
            todos={filteredTodos}
            onTodoClick={(id) => openDetail(id)}
          />
        </motion.div>
      )}

      {/* Deadline Timeline */}
      {currentStatus !== "archived" && currentStatus !== "error" && (
        <div className="mb-4">
          <DeadlineTimeline
            todos={todos}
            daysAhead={7}
            onTodoClick={(id) => openDetail(id)}
          />
        </div>
      )}

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto pl-1.5 pr-1 pt-3 outline-none"
        tabIndex={-1}
        role="listbox"
        aria-label={`${currentLabel} 任务列表`}
      >
        <AnimatePresence mode="wait">
          {filteredTodos.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState
                status={currentStatus}
                searchQuery={searchQuery}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {filteredTodos.length > 0 && (
          <SortableContext
            items={filteredTodos.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className={
                isMasonry
                  ? "columns-1 gap-x-3 pb-4 sm:columns-2 lg:columns-3"
                  : "flex flex-col gap-2 pb-4"
              }
            >
              {filteredTodos.map((todo, i) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  index={i}
                  isSelected={selectedIndex === i}
                  highlightQuery={searchQuery}
                  isSortable={true}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar />
    </div>
  );
}
