"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { TodoItem } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";

interface CalendarTodoCardProps {
  todo: TodoItem;
  onClick?: () => void;
  compact?: boolean;
}

export default function CalendarTodoCard({ todo, onClick, compact = false }: CalendarTodoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `cal-${todo.id}`,
    data: { todo, type: "calendar-todo" },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const priority = PRIORITY_CONFIG[todo.priority];

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={onClick}
        style={style}
        className="flex cursor-grab items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.04] px-2 py-1 text-left transition-colors hover:bg-white/8 active:cursor-grabbing"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priority.color}`} />
        <span className="truncate text-[11px] text-text-primary">{todo.title}</span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={style}
      className="flex cursor-grab flex-col gap-0.5 rounded-lg border border-white/5 bg-white/[0.04] p-2 text-left transition-colors hover:bg-white/8 active:cursor-grabbing"
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${priority.color} ${priority.glow}`} />
        <span className="truncate text-xs font-medium text-text-primary">{todo.title}</span>
      </div>
      {todo.startTime && todo.endTime && (
        <span className="text-[10px] text-text-muted">
          {formatTime(todo.startTime)} – {formatTime(todo.endTime)}
        </span>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
