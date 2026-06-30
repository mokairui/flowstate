"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Moon,
  Sun,
  Monitor,
  Keyboard,
  Download,
  Upload,
  Trash2,
  Bot,
  TestTube,
  Mic,
  Volume2,
  FolderOpen,
  Plus,
  Minus,
} from "lucide-react";
import { useFlowState } from "@/lib/store";
import { exportTodos, importTodos, deleteAllTodos } from "@/lib/db";
import { loadSettings, saveSettings } from "@/lib/settings";
import { testAiConnection } from "@/lib/ai";
import { useScrollLock } from "@/lib/useScrollLock";
import type { AppSettings } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

export default function SettingsPanel() {
  const { isSettingsOpen, closeSettings, todos, setTodos, showToast, settings, setSettings, projects, setProjects, addProject, updateProject, removeProject } =
    useFlowState();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Project management local state
  const [newProjectName, setNewProjectName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useScrollLock(isSettingsOpen);

  // AI settings local state
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [autoParse, setAutoParse] = useState(settings.autoParse);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Speech settings local state
  const [speechEnabled, setSpeechEnabled] = useState(settings.speechEnabled);
  const [speechLang, setSpeechLang] = useState(settings.speechLang);

  // TTS settings local state
  const [ttsEnabled, setTtsEnabled] = useState(settings.ttsEnabled);
  const [ttsLang, setTtsLang] = useState(settings.ttsLang);

  // Ambient motion local state
  const [ambientMotionEnabled, setAmbientMotionEnabled] = useState(
    settings.ambientMotionEnabled
  );

  // F-1 AI 每日规划 local state
  const [autoOpenDailyPlan, setAutoOpenDailyPlan] = useState(
    settings.autoOpenDailyPlan ?? true
  );
  const [dailyAvailableMinutes, setDailyAvailableMinutes] = useState(
    settings.dailyAvailableMinutes ?? 480
  );

  // ESC to close settings (only when confirm dialog is not open)
  useEffect(() => {
    if (!isSettingsOpen || showClearConfirm) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSettings();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isSettingsOpen, showClearConfirm, closeSettings]);

  // Check browser support
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const ttsSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  // Sync local state when settings panel opens
  useEffect(() => {
    if (isSettingsOpen) {
      const s = loadSettings();
      const timer = setTimeout(() => {
        setAiEnabled(s.aiEnabled);
        setApiBaseUrl(s.apiBaseUrl);
        setApiKey(s.apiKey);
        setModel(s.model);
        setAutoParse(s.autoParse);
        setSpeechEnabled(s.speechEnabled);
        setSpeechLang(s.speechLang);
        setTtsEnabled(s.ttsEnabled);
        setTtsLang(s.ttsLang);
        setAmbientMotionEnabled(s.ambientMotionEnabled);
        setAutoOpenDailyPlan(s.autoOpenDailyPlan ?? true);
        setDailyAvailableMinutes(s.dailyAvailableMinutes ?? 480);
        setTestResult(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isSettingsOpen]);

  const persistAiSettings = (changes: Partial<AppSettings>) => {
    const next = { ...settings, ...changes };
    saveSettings(next);
    setSettings(next);
  };

  const handleAddProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    try {
      const { v4: uuidv4 } = await import("uuid");
      const { addProject: addDbProject } = await import("@/lib/db");
      const maxOrder = projects.length > 0 ? Math.max(...projects.map((p) => p.order)) : -1;
      const newProject = {
        id: uuidv4(),
        name: trimmed,
        color: "#7C3AED",
        order: maxOrder + 1,
        createdAt: Date.now(),
      };
      await addDbProject(newProject);
      addProject(newProject);
      setNewProjectName("");
      showToast("项目已创建", "success");
    } catch {
      showToast("创建项目失败", "error");
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testAiConnection({
      ...settings,
      aiEnabled,
      apiBaseUrl,
      apiKey,
      model,
    });
    setTestResult(result);
    setTesting(false);
  };

  const handleExport = async () => {
    try {
      const data = await exportTodos();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flowstate-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("数据已导出", "success");
    } catch {
      showToast("导出失败", "error");
    }
  };

  const handleImportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setPendingImportFile(file);
    setShowImportConfirm(true);
    e.target.value = "";
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;
    try {
      const text = await pendingImportFile.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("格式错误");
      await importTodos(data);
      const fresh = await exportTodos();
      setTodos(fresh);
      showToast(`成功导入 ${data.length} 条任务`, "success");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "导入失败");
      showToast("导入失败", "error");
    } finally {
      setPendingImportFile(null);
      setShowImportConfirm(false);
    }
  };

  const handleCancelImport = () => {
    setPendingImportFile(null);
    setShowImportConfirm(false);
  };

  const handleClearAll = async () => {
    try {
      await deleteAllTodos();
      setTodos([]);
      setShowClearConfirm(false);
      showToast("所有数据已清除", "info");
    } catch {
      showToast("清除失败", "error");
    }
  };

  return (
    <>
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm"
              onClick={closeSettings}
              aria-hidden="true"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-[86] w-full max-w-3xl border-l border-glass-border glass-strong shadow-glass sm:w-[48rem]"
              role="dialog"
              aria-modal="true"
              aria-label="设置"
            >
              <div className="flex h-full flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                  <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                    设置
                  </span>
                  <button
                    onClick={closeSettings}
                    className="rounded-lg p-1.5 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                  {/* Theme */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-text-muted" />
                      <h3 className="text-sm font-medium text-text-primary">
                        主题
                      </h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { value: "system" as const, label: "跟随系统", icon: Monitor },
                          { value: "dark" as const, label: "深色", icon: Moon },
                          { value: "light" as const, label: "浅色", icon: Sun },
                        ] as const
                      ).map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => persistAiSettings({ theme: value })}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                            settings.theme === value
                              ? "border-primary/30 bg-primary/10 text-text-primary"
                              : "border-white/5 bg-white/[0.02] text-text-secondary hover:bg-white/5"
                          }`}
                          aria-label={label}
                          aria-pressed={settings.theme === value}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    {/* Ambient motion toggle */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-text-secondary">
                        动态背景光斑
                      </span>
                      <button
                        onClick={() => {
                          const next = !ambientMotionEnabled;
                          setAmbientMotionEnabled(next);
                          persistAiSettings({ ambientMotionEnabled: next });
                        }}
                        className={`relative h-4 w-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                          ambientMotionEnabled ? "bg-primary" : "bg-white/10"
                        }`}
                        aria-label={
                          ambientMotionEnabled
                            ? "关闭动态背景"
                            : "启用动态背景"
                        }
                      >
                        <span
                          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                            ambientMotionEnabled
                              ? "left-[14px]"
                              : "left-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Shortcut */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Keyboard className="h-4 w-4 text-text-muted" />
                      <h3 className="text-sm font-medium text-text-primary">
                        快捷键
                      </h3>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">
                          快速记录
                        </span>
                        <kbd className="rounded-md bg-white/5 px-2 py-1 font-mono text-xs text-text-muted">
                          Cmd/Ctrl + K
                        </kbd>
                      </div>
                    </div>
                  </div>

                  {/* Projects */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-text-muted" />
                      <h3 className="text-sm font-medium text-text-primary">
                        项目管理
                      </h3>
                    </div>

                    <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      {projects.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2"
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: p.color ?? "#7C3AED" }}
                          />
                          {editingProjectId === p.id ? (
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={async () => {
                                if (editingName.trim() && editingName !== p.name) {
                                  try {
                                    const { updateProject: updateDbProject } = await import("@/lib/db");
                                    await updateDbProject(p.id, { name: editingName.trim() });
                                    updateProject(p.id, { name: editingName.trim() });
                                  } catch {
                                    showToast("更新失败", "error");
                                  }
                                }
                                setEditingProjectId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                                if (e.key === "Escape") {
                                  setEditingProjectId(null);
                                }
                              }}
                              autoFocus
                              className="flex-1 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-xs text-text-primary focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          ) : (
                            <span
                              className="flex-1 cursor-pointer text-xs text-text-secondary hover:text-text-primary"
                              onClick={() => {
                                setEditingProjectId(p.id);
                                setEditingName(p.name);
                              }}
                            >
                              {p.name}
                            </span>
                          )}
                          {p.id !== "default" && (
                            <button
                              onClick={async () => {
                                try {
                                  const { deleteProject: deleteDbProject } = await import("@/lib/db");
                                  await deleteDbProject(p.id);
                                  removeProject(p.id);
                                  showToast("项目已删除", "info");
                                } catch {
                                  showToast("删除失败", "error");
                                }
                              }}
                              className="rounded p-1 text-text-muted transition-colors hover:text-danger focus:outline-none"
                              aria-label={`删除项目 ${p.name}`}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Add new project */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddProject();
                            }
                          }}
                          placeholder="新项目名称"
                          className="flex-1 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <button
                          onClick={handleAddProject}
                          disabled={!newProjectName.trim()}
                          className="flex h-7 items-center gap-1 rounded-md bg-primary/15 px-2 text-[10px] font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <Plus className="h-3 w-3" />
                          添加
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* AI */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-text-muted" />
                      <h3 className="text-sm font-medium text-text-primary">
                        AI 整理
                      </h3>
                    </div>

                    <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      {/* Enable AI */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">
                          启用 AI 整理
                        </span>
                        <button
                          onClick={() => {
                            const next = !aiEnabled;
                            setAiEnabled(next);
                            persistAiSettings({ aiEnabled: next });
                          }}
                          className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            aiEnabled ? "bg-primary" : "bg-white/10"
                          }`}
                          aria-label={aiEnabled ? "关闭 AI" : "启用 AI"}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                              aiEnabled ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>

                      <AnimatePresence>
                        {aiEnabled && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3 overflow-hidden"
                          >
                            {/* API Base URL */}
                            <div className="space-y-1">
                              <label className="text-xs text-text-muted">
                                API 地址
                              </label>
                              <input
                                type="text"
                                value={apiBaseUrl}
                                onChange={(e) => {
                                  setApiBaseUrl(e.target.value);
                                  persistAiSettings({ apiBaseUrl: e.target.value });
                                }}
                                placeholder="https://api.openai.com/v1"
                                className="w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                            </div>

                            {/* API Key */}
                            <div className="space-y-1">
                              <label className="text-xs text-text-muted">
                                API Key
                              </label>
                              <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => {
                                  setApiKey(e.target.value);
                                  persistAiSettings({ apiKey: e.target.value });
                                }}
                                placeholder="sk-..."
                                className="w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                              <p className="text-[11px] text-text-muted">
                                Key 仅保存在本地浏览器中
                              </p>
                            </div>

                            {/* Model */}
                            <div className="space-y-1">
                              <label className="text-xs text-text-muted">
                                模型
                              </label>
                              <input
                                type="text"
                                value={model}
                                onChange={(e) => {
                                  setModel(e.target.value);
                                  persistAiSettings({ model: e.target.value });
                                }}
                                placeholder="gpt-4o-mini"
                                className="w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                            </div>

                            {/* Auto parse */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-text-secondary">
                                自动整理新任务
                              </span>
                              <button
                                onClick={() => {
                                  const next = !autoParse;
                                  setAutoParse(next);
                                  persistAiSettings({ autoParse: next });
                                }}
                                className={`relative h-4 w-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                                  autoParse ? "bg-primary" : "bg-white/10"
                                }`}
                                aria-label={autoParse ? "关闭自动整理" : "启用自动整理"}
                              >
                                <span
                                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                                    autoParse ? "left-[14px]" : "left-0.5"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* F-1 · Auto-open daily plan */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-text-secondary">
                                每日自动打开 AI 规划
                              </span>
                              <button
                                onClick={() => {
                                  const next = !autoOpenDailyPlan;
                                  setAutoOpenDailyPlan(next);
                                  persistAiSettings({ autoOpenDailyPlan: next });
                                }}
                                className={`relative h-4 w-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                                  autoOpenDailyPlan ? "bg-primary" : "bg-white/10"
                                }`}
                                aria-label={
                                  autoOpenDailyPlan
                                    ? "关闭每日自动规划"
                                    : "启用每日自动规划"
                                }
                              >
                                <span
                                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                                    autoOpenDailyPlan ? "left-[14px]" : "left-0.5"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* F-1 · Daily available minutes */}
                            <div className="space-y-1">
                              <label className="text-xs text-text-muted">
                                今日可用时间（分钟）
                              </label>
                              <input
                                type="number"
                                min={30}
                                max={1440}
                                step={30}
                                value={dailyAvailableMinutes}
                                onChange={(e) => {
                                  const raw = parseInt(e.target.value, 10);
                                  const clamped = isNaN(raw)
                                    ? 480
                                    : Math.max(30, Math.min(1440, raw));
                                  setDailyAvailableMinutes(clamped);
                                  persistAiSettings({ dailyAvailableMinutes: clamped });
                                }}
                                className="w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                              <p className="text-[11px] text-text-muted">
                                约 {(dailyAvailableMinutes / 60).toFixed(1)} 小时 · 用于
                                AI 规划安排今日任务时长
                              </p>
                            </div>

                            {/* Test connection */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={handleTestConnection}
                                disabled={testing || !apiBaseUrl || !apiKey}
                                className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                <TestTube className="h-3.5 w-3.5" />
                                {testing ? "测试中…" : "测试连接"}
                              </button>
                              {testResult && (
                                <span
                                  className={`text-xs ${
                                    testResult.success ? "text-success" : "text-danger"
                                  }`}
                                >
                                  {testResult.message}
                                </span>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Speech */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-text-muted" />
                      <h3 className="text-sm font-medium text-text-primary">
                        语音输入
                      </h3>
                    </div>

                    <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      {/* Enable speech */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">
                          启用语音输入
                        </span>
                        <button
                          onClick={() => {
                            if (!speechSupported) return;
                            const next = !speechEnabled;
                            setSpeechEnabled(next);
                            persistAiSettings({ speechEnabled: next });
                          }}
                          disabled={!speechSupported}
                          className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            speechEnabled && speechSupported
                              ? "bg-primary"
                              : "bg-white/10"
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                          aria-label={speechEnabled ? "关闭语音输入" : "启用语音输入"}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                              speechEnabled && speechSupported
                                ? "left-[18px]"
                                : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>

                      {!speechSupported && (
                        <p className="text-[11px] text-text-muted">
                          当前浏览器不支持语音输入
                        </p>
                      )}

                      <AnimatePresence>
                        {speechSupported && speechEnabled && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3 overflow-hidden"
                          >
                            {/* Language */}
                            <div className="space-y-1">
                              <label className="text-xs text-text-muted">
                                语音识别语言
                              </label>
                              <select
                                value={speechLang}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setSpeechLang(next);
                                  persistAiSettings({ speechLang: next });
                                }}
                                className="w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-text-primary focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              >
                                <option value="zh-CN">中文（普通话）</option>
                                <option value="zh-TW">中文（台湾）</option>
                                <option value="en-US">English (US)</option>
                                <option value="en-GB">English (UK)</option>
                                <option value="ja-JP">日本語</option>
                                <option value="ko-KR">한국어</option>
                                <option value="fr-FR">Français</option>
                                <option value="de-DE">Deutsch</option>
                                <option value="es-ES">Español</option>
                              </select>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* TTS */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-text-muted" />
                      <h3 className="text-sm font-medium text-text-primary">
                        任务朗读
                      </h3>
                    </div>

                    <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      {/* Enable TTS */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">
                          启用任务朗读
                        </span>
                        <button
                          onClick={() => {
                            if (!ttsSupported) return;
                            const next = !ttsEnabled;
                            setTtsEnabled(next);
                            persistAiSettings({ ttsEnabled: next });
                          }}
                          disabled={!ttsSupported}
                          className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            ttsEnabled && ttsSupported
                              ? "bg-primary"
                              : "bg-white/10"
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                          aria-label={ttsEnabled ? "关闭朗读" : "启用朗读"}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                              ttsEnabled && ttsSupported
                                ? "left-[18px]"
                                : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>

                      {!ttsSupported && (
                        <p className="text-[11px] text-text-muted">
                          当前浏览器不支持语音朗读
                        </p>
                      )}

                      <AnimatePresence>
                        {ttsSupported && ttsEnabled && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3 overflow-hidden"
                          >
                            {/* Language */}
                            <div className="space-y-1">
                              <label className="text-xs text-text-muted">
                                朗读语言
                              </label>
                              <select
                                value={ttsLang}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setTtsLang(next);
                                  persistAiSettings({ ttsLang: next });
                                }}
                                className="w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-text-primary focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              >
                                <option value="zh-CN">中文（普通话）</option>
                                <option value="zh-TW">中文（台湾）</option>
                                <option value="en-US">English (US)</option>
                                <option value="en-GB">English (UK)</option>
                                <option value="ja-JP">日本語</option>
                                <option value="ko-KR">한국어</option>
                                <option value="fr-FR">Français</option>
                                <option value="de-DE">Deutsch</option>
                                <option value="es-ES">Español</option>
                              </select>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Data */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-text-muted" />
                      <h3 className="text-sm font-medium text-text-primary">
                        数据管理
                      </h3>
                    </div>

                    <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">
                          当前任务数
                        </span>
                        <span className="text-sm font-medium text-text-primary">
                          {todos.length}
                        </span>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleExport}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <Download className="h-3.5 w-3.5" />
                          导出
                        </button>
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          导入
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleImportSelect}
                            className="sr-only"
                          />
                        </label>
                      </div>

                      {importError && (
                        <p className="text-xs text-danger">{importError}</p>
                      )}
                    </div>

                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-danger/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      清除所有数据
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={showClearConfirm}
        title="清除所有数据"
        message="确定要删除所有任务数据吗？此操作不可撤销，建议先导出备份。"
        confirmLabel="清除全部"
        cancelLabel="取消"
        variant="danger"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showImportConfirm}
        title="导入数据"
        message={`导入将合并到现有 ${todos.length} 条任务中。重复的任务可能会被覆盖。确定要继续吗？`}
        confirmLabel="确认导入"
        cancelLabel="取消"
        variant="default"
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
      />
    </>
  );
}
