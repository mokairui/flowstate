"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Info, X, Undo2 } from "lucide-react";
import { useFlowState } from "@/lib/store";

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colorMap = {
  success: "text-success border-success/20 bg-success/10",
  error: "text-danger border-danger/20 bg-danger/10",
  info: "text-accent border-accent/20 bg-accent/10",
};

export default function ToastContainer() {
  const toasts = useFlowState((s) => s.toasts);
  const dismissToast = useFlowState((s) => s.dismissToast);

  return (
    <div className="fixed top-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`glass flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium shadow-glass ${colorMap[toast.type]}`}
              role="alert"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.onClick();
                  }}
                  className="ml-1 flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-text-primary transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  aria-label={toast.action.label}
                >
                  <Undo2 className="h-3 w-3" />
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismissToast(toast.id)}
                className="ml-1 rounded-md p-0.5 opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label="关闭提示"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
