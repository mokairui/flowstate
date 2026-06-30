"use client";

import { useEffect, useRef, useCallback } from "react";
import { useFlowState } from "./store";

const WORK_SECONDS = 25 * 60;
const SHORT_BREAK_SECONDS = 5 * 60;
const LONG_BREAK_SECONDS = 15 * 60;

export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

interface PomodoroState {
  todoId: string | null;
  phase: PomodoroPhase;
  remaining: number;
  isRunning: boolean;
  startedAt: number | null;
}

const STORAGE_KEY = "flowstate-pomodoro";

function loadPersistedState(): PomodoroState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PomodoroState;
    // Validate
    if (
      typeof parsed.todoId !== "string" ||
      typeof parsed.remaining !== "number" ||
      typeof parsed.isRunning !== "boolean"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedState(state: PomodoroState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function removePersistedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function phaseDuration(phase: PomodoroPhase): number {
  switch (phase) {
    case "work":
      return WORK_SECONDS;
    case "shortBreak":
      return SHORT_BREAK_SECONDS;
    case "longBreak":
      return LONG_BREAK_SECONDS;
  }
}

function phaseLabel(phase: PomodoroPhase): string {
  switch (phase) {
    case "work":
      return "专注中";
    case "shortBreak":
      return "短休息";
    case "longBreak":
      return "长休息";
  }
}

/** 播放轻柔提示音 */
function playCompletionSound() {
  try {
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3); // G5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // ignore
  }
}

/** 全局番茄钟 Hook。每个组件调用时传入自己的 todoId，但只有一个全局计时器在运行。 */
export function usePomodoro(todoId: string) {
  const {
    pomodoroTodoId,
    pomodoroPhase,
    pomodoroRemaining,
    pomodoroIsRunning,
    setPomodoro,
    updateTodo: updateInStore,
    showToast,
  } = useFlowState();

  const isActive = pomodoroTodoId === todoId;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleCompleteRef = useRef<() => void>(() => {});

  handleCompleteRef.current = () => {
    const state = useFlowState.getState();
    const { pomodoroTodoId: completedId, pomodoroPhase: completedPhase } = state;
    if (!completedId) return;

    playCompletionSound();

    if (completedPhase === "work") {
      // Update pomodoro count and total focus time
      const todo = state.todos.find((t) => t.id === completedId);
      const newPomodoros = (todo?.pomodoros ?? 0) + 1;
      const newTotalFocusTime = (todo?.totalFocusTime ?? 0) + WORK_SECONDS;

      import("./db").then(({ updateTodo }) => {
        updateTodo(completedId, {
          pomodoros: newPomodoros,
          totalFocusTime: newTotalFocusTime,
        }).catch(() => {});
      });
      state.updateTodo(completedId, {
        pomodoros: newPomodoros,
        totalFocusTime: newTotalFocusTime,
      });

      // Auto switch to break
      const nextPhase: PomodoroPhase =
        newPomodoros % 4 === 0 ? "longBreak" : "shortBreak";
      const nextRemaining = phaseDuration(nextPhase);
      state.setPomodoro({
        pomodoroTodoId: completedId,
        pomodoroPhase: nextPhase,
        pomodoroRemaining: nextRemaining,
        pomodoroIsRunning: false,
      });
      savePersistedState({
        todoId: completedId,
        phase: nextPhase,
        remaining: nextRemaining,
        isRunning: false,
        startedAt: null,
      });
      state.showToast(
        `专注完成！累计 ${newPomodoros} 个番茄 🍅`,
        "success"
      );
    } else {
      // Break completed
      state.setPomodoro({
        pomodoroTodoId: null,
        pomodoroPhase: "work",
        pomodoroRemaining: WORK_SECONDS,
        pomodoroIsRunning: false,
      });
      removePersistedState();
      state.showToast("休息结束，准备开始新的专注", "info");
    }
  };

  // Global tick interval — only runs on the active task component
  useEffect(() => {
    if (!isActive || !pomodoroIsRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      const state = useFlowState.getState();
      if (!state.pomodoroIsRunning || state.pomodoroRemaining <= 0) return;

      const newRemaining = state.pomodoroRemaining - 1;
      state.setPomodoro({
        pomodoroTodoId: state.pomodoroTodoId,
        pomodoroPhase: state.pomodoroPhase,
        pomodoroRemaining: newRemaining,
        pomodoroIsRunning: true,
      });
      savePersistedState({
        todoId: state.pomodoroTodoId,
        phase: state.pomodoroPhase,
        remaining: newRemaining,
        isRunning: true,
        startedAt: null,
      });

      if (newRemaining <= 0) {
        // Timer completed
        handleCompleteRef.current();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, pomodoroIsRunning, todoId]);

  const start = useCallback(
    (phase?: PomodoroPhase) => {
      const targetPhase = phase || pomodoroPhase || "work";
      const remaining =
        isActive && pomodoroRemaining > 0
          ? pomodoroRemaining
          : phaseDuration(targetPhase);
      setPomodoro({
        pomodoroTodoId: todoId,
        pomodoroPhase: targetPhase,
        pomodoroRemaining: remaining,
        pomodoroIsRunning: true,
      });
      savePersistedState({
        todoId,
        phase: targetPhase,
        remaining,
        isRunning: true,
        startedAt: Date.now(),
      });
    },
    [todoId, isActive, pomodoroPhase, pomodoroRemaining, setPomodoro]
  );

  const pause = useCallback(() => {
    setPomodoro({
      ...useFlowState.getState(),
      pomodoroIsRunning: false,
    });
    savePersistedState({
      todoId: pomodoroTodoId,
      phase: pomodoroPhase,
      remaining: pomodoroRemaining,
      isRunning: false,
      startedAt: null,
    });
  }, [pomodoroTodoId, pomodoroPhase, pomodoroRemaining, setPomodoro]);

  const stop = useCallback(() => {
    setPomodoro({
      pomodoroTodoId: null,
      pomodoroPhase: "work",
      pomodoroRemaining: WORK_SECONDS,
      pomodoroIsRunning: false,
    });
    removePersistedState();
  }, [setPomodoro]);

  const switchPhase = useCallback(
    (newPhase: PomodoroPhase) => {
      const remaining = phaseDuration(newPhase);
      setPomodoro({
        pomodoroTodoId: todoId,
        pomodoroPhase: newPhase,
        pomodoroRemaining: remaining,
        pomodoroIsRunning: false,
      });
      savePersistedState({
        todoId,
        phase: newPhase,
        remaining,
        isRunning: false,
        startedAt: null,
      });
    },
    [todoId, setPomodoro]
  );

  // Restore from localStorage on mount
  useEffect(() => {
    const persisted = loadPersistedState();
    if (!persisted) return;

    // If was running, calculate elapsed time
    let remaining = persisted.remaining;
    if (persisted.isRunning && persisted.startedAt) {
      const elapsed = Math.floor((Date.now() - persisted.startedAt) / 1000);
      remaining = Math.max(0, persisted.remaining - elapsed);
    }

    setPomodoro({
      pomodoroTodoId: persisted.todoId,
      pomodoroPhase: persisted.phase,
      pomodoroRemaining: remaining,
      pomodoroIsRunning: persisted.isRunning && remaining > 0,
    });

    if (remaining <= 0 && persisted.isRunning) {
      // Timer already expired while away
      handleCompleteRef.current();
    }
  }, [setPomodoro]);

  return {
    isActive,
    isRunning: pomodoroIsRunning && isActive,
    phase: isActive ? pomodoroPhase : "work",
    remaining: isActive ? pomodoroRemaining : WORK_SECONDS,
    phaseLabel: phaseLabel(isActive ? pomodoroPhase : "work"),
    start,
    pause,
    stop,
    switchPhase,
    pomodoros: useFlowState.getState().todos.find((t) => t.id === todoId)?.pomodoros ?? 0,
  };
}

/** Format seconds as mm:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
