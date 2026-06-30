"use client";

import { motion } from "framer-motion";
import { Sparkles, User, Copy, CheckCircle2, ListTodo, ArrowRight } from "lucide-react";
import type { ChatMessage } from "@/lib/ai";
import { useState } from "react";

interface ChatBubbleProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  selectedTodoId: string | null;
  onAction: (action: string) => void;
}

export default function ChatBubble({
  messages,
  isStreaming,
  streamingContent,
  selectedTodoId,
  onAction,
}: ChatBubbleProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(index);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-2 py-2">
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-text-muted">
          <Sparkles className="h-6 w-6 opacity-50" />
          <p className="text-xs">有什么可以帮你的？接住空格键说话</p>
        </div>
      )}

      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                isUser
                  ? "bg-primary/15 text-text-primary"
                  : "bg-white/5 text-text-secondary"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {isUser ? (
                  <User className="h-3 w-3 text-primary" />
                ) : (
                  <Sparkles className="h-3 w-3 text-accent" />
                )}
                <span className="text-[10px] font-medium text-text-muted">
                  {isUser ? "你" : "AI 助手"}
                </span>
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Actions for AI messages */}
              {!isUser && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handleCopy(msg.content, i)}
                    className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] text-text-muted transition-colors hover:bg-white/8 hover:text-text-secondary focus:outline-none"
                    aria-label="复制回复"
                  >
                    {copiedId === i ? (
                      <>
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="h-2.5 w-2.5" />
                        复制
                      </>
                    )}
                  </button>
                  {selectedTodoId && (
                    <>
                      <button
                        onClick={() => onAction("generate_subtasks")}
                        className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] text-text-muted transition-colors hover:bg-white/8 hover:text-text-secondary focus:outline-none"
                        aria-label="生成子任务"
                      >
                        <ListTodo className="h-2.5 w-2.5" />
                        生成子任务
                      </button>
                      <button
                        onClick={() => onAction("set_doing")}
                        className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] text-text-muted transition-colors hover:bg-white/8 hover:text-text-secondary focus:outline-none"
                        aria-label="设为进行中"
                      >
                        <ArrowRight className="h-2.5 w-2.5" />
                        设为进行中
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Streaming message */}
      {isStreaming && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-start"
        >
          <div className="max-w-[85%] rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm leading-relaxed text-text-secondary">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="h-3 w-3 text-accent animate-pulse" />
              <span className="text-[10px] font-medium text-text-muted">AI 助手</span>
            </div>
            <div className="whitespace-pre-wrap">
              {streamingContent}
              <span className="inline-block h-4 w-0.5 animate-pulse bg-accent align-middle" />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
