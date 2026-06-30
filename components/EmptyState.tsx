"use client";

import { Inbox, Plus, Command, Search } from "lucide-react";
import { useFlowState } from "@/lib/store";
import { getShortcutDisplay } from "@/lib/settings";
import type { TodoStatus } from "@/lib/types";
import CapsuleLogo from "./CapsuleLogo";

const emptyStateConfig: Record<
  TodoStatus,
  { icon: typeof Inbox; title: string; subtitle: string }
> = {
  inbox: {
    icon: Inbox,
    title: "Inbox 是空的",
    subtitle: "按快捷键快速记录第一条任务",
  },
  today: {
    icon: Inbox,
    title: "今天没有待办",
    subtitle: "从 Inbox 移入任务或快速记录",
  },
  doing: {
    icon: Inbox,
    title: "没有进行中的任务",
    subtitle: "从 Today 开始处理任务吧",
  },
  done: {
    icon: Inbox,
    title: "还没有已完成任务",
    subtitle: "完成任务后会出现在这里",
  },
  archived: {
    icon: Inbox,
    title: "归档箱是空的",
    subtitle: "归档的任务会暂存于此",
  },
  error: {
    icon: Inbox,
    title: "出错了",
    subtitle: "请刷新页面重试",
  },
};

export default function EmptyState({
  status,
  searchQuery = "",
}: {
  status: TodoStatus;
  searchQuery?: string;
}) {
  const openQuickCapture = useFlowState((s) => s.openQuickCapture);
  const config = emptyStateConfig[status];
  const Icon = config.icon;
  const shortcut = getShortcutDisplay();

  if (searchQuery.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
          <Search className="h-7 w-7 text-text-muted" />
        </div>
        <h3 className="mt-5 text-base font-semibold text-text-primary">
          未找到匹配任务
        </h3>
        <p className="mt-1.5 text-sm text-text-secondary">
          尝试其他关键词
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {status === "inbox" ? (
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5">
          <CapsuleLogo size={48} animate />
        </div>
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
          <Icon className="h-7 w-7 text-text-muted" />
        </div>
      )}
      <h3 className="mt-5 text-base font-semibold text-text-primary">
        {config.title}
      </h3>
      <p className="mt-1.5 flex items-center gap-1 text-sm text-text-secondary">
        {config.subtitle}
      </p>
      {status === "inbox" && (
        <>
          <div className="mt-3 flex items-center gap-1 text-xs text-text-muted">
            <Command className="h-3.5 w-3.5" />
            <span>{shortcut}</span>
          </div>
          <button
            onClick={openQuickCapture}
            className="mt-6 flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white shadow-glow-purple transition-all hover:bg-primary/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <Plus className="h-4 w-4" />
            快速记录
          </button>
        </>
      )}
    </div>
  );
}
