"use client";

import { useRef, useCallback, useState, useEffect } from "react";

// ── Web Speech API types (not available in all browsers) ────────────────────

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative | null;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

// ── Public types ────────────────────────────────────────────────────────────

export interface UseSpeechRecognitionOptions {
  lang: string;
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  start: () => void;
  stop: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract transcript from a SpeechRecognitionResult. */
function getTranscript(result: SpeechRecognitionResult): string {
  if (!result || result.length === 0) return "";
  try {
    const alt = result.item(0);
    if (alt && typeof alt.transcript === "string") return alt.transcript;
  } catch {
    /* fallback below */
  }
  try {
    const alt = result[0];
    if (alt && typeof alt.transcript === "string") return alt.transcript;
  } catch {
    /* ignore */
  }
  return "";
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const optionsRef = useRef(options);
  const hasResultRef = useRef(false);
  const isStoppingRef = useRef(false);
  const finalTranscriptRef = useRef("");

  // Keep options ref up-to-date without re-creating handlers
  useEffect(() => {
    optionsRef.current = options;
  });

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  /** Destroy an old recognition instance (used before creating a new one). */
  const disposeOldInstance = useCallback(() => {
    const old = recognitionRef.current;
    if (!old) return;

    // Detach all handlers so async callbacks from this instance can't
    // interfere with anything we do afterwards.
    old.onresult = null;
    old.onerror = null;
    old.onend = null;
    old.onstart = null;

    try {
      old.abort();
    } catch {
      /* ignore */
    }

    recognitionRef.current = null;
  }, []);

  /** Stop the current recognition session gracefully. */
  const stop = useCallback(() => {
    isStoppingRef.current = true;

    const instance = recognitionRef.current;
    if (instance) {
      try {
        instance.stop();
      } catch {
        /* ignore */
      }
    }

    setIsListening(false);

    // Reset the stopping flag after enough time for all async callbacks
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 600);
  }, []);

  // ── Pre-flight mic check ──────────────────────────────────────────────────
  async function ensureMicAccess(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop all tracks immediately — we only needed permission
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      console.error("[Speech] getUserMedia failed:", err);
      return false;
    }
  }

  /** Start a new recognition session. */
  const start = useCallback(async () => {
    if (!isSupported) {
      optionsRef.current.onError("当前浏览器不支持语音识别");
      return;
    }

    // Pre-flight mic permission check
    const hasMic = await ensureMicAccess();
    if (!hasMic) {
      optionsRef.current.onError("无法访问麦克风，请检查浏览器权限设置");
      return;
    }

    // Fully dispose any previous instance first
    disposeOldInstance();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();

    recognition.lang = optionsRef.current.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Reset per-session state
    hasResultRef.current = false;
    isStoppingRef.current = false;
    finalTranscriptRef.current = "";

    console.log("[Speech] starting recognition, lang=", recognition.lang);

    recognition.onstart = () => {
      console.log("[Speech] onstart");
      setIsListening(true);
      optionsRef.current.onStart?.();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Use resultIndex so we only process *new* results that arrived in
      // this callback. Previous final results are immutable, so we
      // accumulate them in finalTranscriptRef.
      let currentInterim = "";
      let hasNewFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;

        const transcript = getTranscript(result);
        if (result.isFinal) {
          finalTranscriptRef.current += transcript;
          hasNewFinal = true;
          console.log("[Speech] final result:", transcript);
        } else {
          currentInterim = transcript;
        }
      }

      const fullTranscript =
        (finalTranscriptRef.current + currentInterim).trim();

      if (fullTranscript) {
        hasResultRef.current = true;
      }

      // isFinal = true only when there's nothing left to recognise
      const isAllFinal =
        hasNewFinal && currentInterim === "" && finalTranscriptRef.current !== "";

      optionsRef.current.onResult(fullTranscript, isAllFinal);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log("[Speech] onerror:", event.error, "hasResult=", hasResultRef.current, "isStopping=", isStoppingRef.current);
      // "aborted" fires when we call abort() during disposeOldInstance().
      if (event.error === "aborted") return;

      // If we're actively stopping, ignore all errors.
      if (isStoppingRef.current) return;

      // Only ignore "no-speech" when we already have results (user may just
      // be pausing between sentences). All other errors should be reported
      // so the user knows why recognition stopped working.
      if (hasResultRef.current && event.error === "no-speech") return;

      const errorMap: Record<string, string> = {
        "no-speech": "未检测到语音，请检查麦克风是否正常工作",
        "audio-capture": "无法访问麦克风设备",
        "not-allowed": "麦克风权限被拒绝，请在浏览器地址栏中允许麦克风权限",
        network: "网络错误，语音识别需要网络连接（中国大陆用户建议使用 Edge 浏览器）",
        "service-not-allowed": "语音服务在当前地区不可用",
      };
      const message =
        errorMap[event.error] || `语音识别错误: ${event.error}`;
      optionsRef.current.onError(message);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log("[Speech] onend, hasResult=", hasResultRef.current, "refMatch=", recognitionRef.current === recognition);
      // Only update state if this is STILL the current instance.
      // Prevents a stale callback from a previous stop() or dispose()
      // from nuking a newer, active session.
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setIsListening(false);
        optionsRef.current.onEnd?.();
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error("[Speech] start() failed:", err);
      recognitionRef.current = null;
      optionsRef.current.onError("启动语音识别失败，请检查麦克风权限");
      setIsListening(false);
    }
  }, [isSupported, disposeOldInstance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposeOldInstance();
    };
  }, [disposeOldInstance]);

  return {
    isSupported,
    isListening,
    start,
    stop,
  };
}
