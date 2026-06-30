"use client";

import { useMemo } from "react";
import type { TodoItem } from "./types";

export type AgeCategory = "fresh" | "aging" | "stale";

export interface TaskAgeInfo {
  ageDays: number;
  ageCategory: AgeCategory;
  ageLabel: string;
}

/**
 * 计算任务在 Inbox/Today 中滞留的年龄。
 *
 * - fresh:   < 3 天 — 正常，无提示
 * - aging:   3–7 天 — 琥珀色提醒
 * - stale:   > 7 天 — 红色提醒
 */
export function useTaskAge(todo: TodoItem): TaskAgeInfo {
  return useMemo(() => {
    const now = Date.now();
    const ageMs = now - todo.createdAt;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    let ageCategory: AgeCategory;
    if (ageDays > 7) {
      ageCategory = "stale";
    } else if (ageDays >= 3) {
      ageCategory = "aging";
    } else {
      ageCategory = "fresh";
    }

    let ageLabel: string;
    if (ageDays === 0) {
      ageLabel = "今天";
    } else if (ageDays === 1) {
      ageLabel = "昨天";
    } else {
      ageLabel = `${ageDays} 天前`;
    }

    return { ageDays, ageCategory, ageLabel };
  }, [todo.createdAt]);
}

/**
 * 非 Hook 版本，用于组件外或事件处理中计算。
 */
export function getTaskAge(todo: TodoItem): TaskAgeInfo {
  const now = Date.now();
  const ageMs = now - todo.createdAt;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  let ageCategory: AgeCategory;
  if (ageDays > 7) {
    ageCategory = "stale";
  } else if (ageDays >= 3) {
    ageCategory = "aging";
  } else {
    ageCategory = "fresh";
  }

  let ageLabel: string;
  if (ageDays === 0) {
    ageLabel = "今天";
  } else if (ageDays === 1) {
    ageLabel = "昨天";
  } else {
    ageLabel = `${ageDays} 天前`;
  }

  return { ageDays, ageCategory, ageLabel };
}
