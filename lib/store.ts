import { create } from "zustand";
import type { TodoItem, TodoStatus, AppSettings, Project, EnergyLevel, CalendarViewMode } from "./types";
import type { PomodoroPhase } from "./usePomodoro";
import { deleteTodo, updateTodosOrder } from "./db";

export interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface RecentlyDeletedItem {
  todo: TodoItem;
  timer: ReturnType<typeof setTimeout>;
}

interface PomodoroState {
  pomodoroTodoId: string | null;
  pomodoroPhase: PomodoroPhase;
  pomodoroRemaining: number;
  pomodoroIsRunning: boolean;
}

interface FlowState extends PomodoroState {
  // Data
  todos: TodoItem[];
  projects: Project[];
  selectedTodoId: string | null;
  settings: AppSettings;

  // UI State
  currentStatus: TodoStatus;
  currentProjectId: string | null;
  isQuickCaptureOpen: boolean;
  isSettingsOpen: boolean;
  isDetailOpen: boolean;
  isAiPlanningOpen: boolean;
  toasts: ToastMessage[];
  quickCaptureDraft: string;
  isLoading: boolean;
  dbError: string | null;
  searchQuery: string;
  selectedIndex: number;
  searchAllProjects: boolean;

  // Bulk operations
  bulkMode: boolean;
  selectedIds: Set<string>;

  // Energy mode
  userEnergyMode: EnergyLevel | null;

  // View mode
  viewMode: "list" | "calendar";
  calendarViewMode: CalendarViewMode;
  timelineDays: 7 | 14 | 30;

  // Recently deleted buffer (for undo)
  recentlyDeleted: Map<string, RecentlyDeletedItem>;

  // Actions
  setTodos: (todos: TodoItem[]) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, changes: Partial<Project>) => void;
  removeProject: (id: string) => void;
  addTodo: (todo: TodoItem) => void;
  updateTodo: (id: string, changes: Partial<TodoItem>) => void;
  removeTodo: (id: string) => void;
  setCurrentStatus: (status: TodoStatus) => void;
  setCurrentProjectId: (id: string | null) => void;
  openQuickCapture: () => void;
  closeQuickCapture: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openAiPlanning: () => void;
  closeAiPlanning: () => void;
  showToast: (message: string, type?: ToastMessage["type"], action?: ToastMessage["action"]) => void;
  dismissToast: (id: string) => void;
  setQuickCaptureDraft: (draft: string) => void;
  setSettings: (settings: AppSettings) => void;
  setIsLoading: (loading: boolean) => void;
  setDbError: (error: string | null) => void;
  setSearchQuery: (searchQuery: string) => void;
  setSelectedIndex: (selectedIndex: number) => void;
  setSearchAllProjects: (value: boolean) => void;
  setBulkMode: (bulkMode: boolean) => void;
  toggleSelected: (id: string) => void;
  selectRange: (ids: string[]) => void;
  clearSelection: () => void;
  setUserEnergyMode: (mode: EnergyLevel | null) => void;
  setViewMode: (mode: "list" | "calendar") => void;
  setCalendarViewMode: (mode: CalendarViewMode) => void;
  setTimelineDays: (days: 7 | 14 | 30) => void;
  softDelete: (todo: TodoItem) => void;
  undoDelete: (id: string) => void;
  confirmDelete: (id: string) => Promise<void>;
  reorderTodos: (status: TodoStatus, oldIndex: number, newIndex: number) => void;
  setPomodoro: (state: Partial<PomodoroState>) => void;
}

let toastIdCounter = 0;

export const useFlowState = create<FlowState>((set, get) => ({
  todos: [],
  selectedTodoId: null,
  settings: {
    theme: "dark",
    aiEnabled: true,
    apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4/",
    apiKey: "65f57363762f47b3a1e6845d6d915592.wp1woMWsg4PrhDMA",
    model: "glm-4.7",
    autoParse: true,
    quickCaptureShortcut: "Cmd/Ctrl + K",
    speechEnabled: true,
    speechLang: "zh-CN",
    ttsEnabled: false,
    ttsLang: "zh-CN",
    ambientMotionEnabled: true,
    lastPlanGeneratedAt: 0,
    dailyAvailableMinutes: 480,
    autoOpenDailyPlan: true,
  },
  projects: [],
  currentStatus: "inbox",
  currentProjectId: null,
  isQuickCaptureOpen: false,
  isSettingsOpen: false,
  isDetailOpen: false,
  isAiPlanningOpen: false,
  toasts: [],
  quickCaptureDraft: "",
  isLoading: false,
  dbError: null,
  searchQuery: "",
  selectedIndex: -1,
  searchAllProjects: false,
  bulkMode: false,
  selectedIds: new Set(),
  userEnergyMode: null,

  // View mode
  viewMode: "list",
  calendarViewMode: "month",
  timelineDays: 7,

  recentlyDeleted: new Map(),

  // Pomodoro
  pomodoroTodoId: null,
  pomodoroPhase: "work",
  pomodoroRemaining: 25 * 60,
  pomodoroIsRunning: false,

  setTodos: (todos) => set({ todos }),

  setProjects: (projects) => set({ projects }),

  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project],
    })),

  updateProject: (id, changes) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...changes } : p
      ),
    })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      // Unassign todos from deleted project
      todos: state.todos.map((t) =>
        t.projectId === id ? { ...t, projectId: undefined } : t
      ),
      currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
    })),

  addTodo: (todo) =>
    set((state) => ({
      todos: [todo, ...state.todos],
    })),

  updateTodo: (id, changes) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === id ? { ...t, ...changes, updatedAt: Date.now() } : t
      ),
    })),

  removeTodo: (id) =>
    set((state) => ({
      todos: state.todos.filter((t) => t.id !== id),
      selectedTodoId:
        state.selectedTodoId === id ? null : state.selectedTodoId,
      isDetailOpen: state.selectedTodoId === id ? false : state.isDetailOpen,
    })),

  setCurrentStatus: (status) => set({ currentStatus: status }),

  setCurrentProjectId: (id) => set({ currentProjectId: id, selectedIndex: -1 }),

  openQuickCapture: () => set({ isQuickCaptureOpen: true }),
  closeQuickCapture: () => set({ isQuickCaptureOpen: false }),

  openSettings: () => set({ isSettingsOpen: true, isDetailOpen: false, selectedTodoId: null }),
  closeSettings: () => set({ isSettingsOpen: false }),

  openDetail: (id) => set({ selectedTodoId: id, isDetailOpen: true, isSettingsOpen: false }),
  closeDetail: () => set({ isDetailOpen: false, selectedTodoId: null }),

  openAiPlanning: () => set({ isAiPlanningOpen: true }),
  closeAiPlanning: () => set({ isAiPlanningOpen: false }),

  showToast: (message, type = "info", action) => {
    const id = `toast-${++toastIdCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, action }],
    }));
    // Auto dismiss after 3s (or 5s if has action)
    const duration = action ? 5000 : 3000;
    setTimeout(() => {
      get().dismissToast(id);
    }, duration);
  },

  softDelete: (todo) => {
    // 1. Remove from UI
    set((state) => ({
      todos: state.todos.filter((t) => t.id !== todo.id),
      selectedTodoId:
        state.selectedTodoId === todo.id ? null : state.selectedTodoId,
      isDetailOpen: state.selectedTodoId === todo.id ? false : state.isDetailOpen,
    }));

    // 2. Clear any existing timer for this id
    const existing = get().recentlyDeleted.get(todo.id);
    if (existing) {
      clearTimeout(existing.timer);
    }

    // 3. Start 5s timer for permanent deletion
    const timer = setTimeout(() => {
      get().confirmDelete(todo.id);
    }, 5000);

    // 4. Save to buffer
    set((state) => {
      const next = new Map(state.recentlyDeleted);
      next.set(todo.id, { todo, timer });
      return { recentlyDeleted: next };
    });

    // 5. Show undo toast
    const toastId = `toast-${++toastIdCounter}`;
    const shortTitle = todo.title.slice(0, 20) + (todo.title.length > 20 ? "…" : "");
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id: toastId,
          message: `已删除「${shortTitle}」`,
          type: "info",
          action: {
            label: "撤销",
            onClick: () => {
              get().undoDelete(todo.id);
              get().dismissToast(toastId);
            },
          },
        },
      ],
    }));

    // 6. Auto dismiss toast after 5s
    setTimeout(() => {
      get().dismissToast(toastId);
    }, 5000);
  },

  undoDelete: (id) => {
    const item = get().recentlyDeleted.get(id);
    if (!item) return;

    clearTimeout(item.timer);

    set((state) => {
      const next = new Map(state.recentlyDeleted);
      next.delete(id);
      return {
        recentlyDeleted: next,
        todos: [item.todo, ...state.todos],
      };
    });

    get().showToast("已撤销删除", "success");
  },

  confirmDelete: async (id) => {
    const item = get().recentlyDeleted.get(id);
    if (!item) return;

    clearTimeout(item.timer);

    set((state) => {
      const next = new Map(state.recentlyDeleted);
      next.delete(id);
      return { recentlyDeleted: next };
    });

    try {
      await deleteTodo(id);
    } catch (err) {
      console.error("Permanent delete failed:", err);
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setQuickCaptureDraft: (draft) => set({ quickCaptureDraft: draft }),

  setSettings: (settings) => set({ settings }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setDbError: (dbError) => set({ dbError }),

  setSearchQuery: (searchQuery: string) => set({ searchQuery, selectedIndex: -1 }),

  setSelectedIndex: (selectedIndex: number) => set({ selectedIndex }),

  setSearchAllProjects: (searchAllProjects: boolean) => set({ searchAllProjects }),

  setBulkMode: (bulkMode: boolean) => set({ bulkMode, selectedIds: new Set() }),

  toggleSelected: (id: string) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),

  selectRange: (ids: string[]) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      ids.forEach((id) => next.add(id));
      return { selectedIds: next };
    }),

  clearSelection: () => set({ selectedIds: new Set() }),

  setUserEnergyMode: (mode) => set({ userEnergyMode: mode }),

  setPomodoro: (pomodoroState) => set((state) => ({ ...state, ...pomodoroState })),

  reorderTodos: (status, oldIndex, newIndex) => {
    const state = get();
    const statusTodos = state.todos
      .filter((t) => t.status === status)
      .sort((a, b) => b.order - a.order);

    if (
      oldIndex < 0 ||
      oldIndex >= statusTodos.length ||
      newIndex < 0 ||
      newIndex >= statusTodos.length ||
      oldIndex === newIndex
    ) {
      return;
    }

    const moved = [...statusTodos];
    const [removed] = moved.splice(oldIndex, 1);
    moved.splice(newIndex, 0, removed);

    const reorderedTodos = moved.map((t, i) => ({
      ...t,
      order: moved.length - 1 - i,
    }));

    const originalTodos = state.todos.map((t) => ({ ...t }));
    const reorderedMap = new Map(reorderedTodos.map((t) => [t.id, t]));

    set({
      todos: state.todos.map((t) =>
        t.status === status && reorderedMap.has(t.id)
          ? reorderedMap.get(t.id)!
          : t
      ),
    });

    updateTodosOrder(reorderedTodos).catch((err) => {
      console.error("Reorder persist failed:", err);
      set({ todos: originalTodos });
      get().showToast("排序保存失败，已恢复", "error");
    });
  },

  setViewMode: (viewMode) => set({ viewMode }),
  setCalendarViewMode: (calendarViewMode) => set({ calendarViewMode }),
  setTimelineDays: (timelineDays) => set({ timelineDays }),
}));
