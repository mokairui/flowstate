"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "default";
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-[91] w-full max-w-sm -translate-x-1/2 -translate-y-1/2"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
          >
            <div className="glass-strong rounded-2xl p-6 shadow-glass">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    variant === "danger"
                      ? "bg-danger/15 text-danger"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3
                    id="confirm-title"
                    className="text-base font-semibold text-text-primary"
                  >
                    {title}
                  </h3>
                  <p
                    id="confirm-desc"
                    className="mt-1 text-sm text-text-secondary"
                  >
                    {message}
                  </p>
                </div>
                <button
                  onClick={onCancel}
                  className="rounded-lg p-1 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={onCancel}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-base ${
                    variant === "danger"
                      ? "bg-danger hover:bg-danger/90 focus:ring-danger"
                      : "bg-primary hover:bg-primary/90 focus:ring-primary"
                  }`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
