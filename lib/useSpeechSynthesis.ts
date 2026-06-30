"use client";

import { useRef, useCallback, useState, useEffect } from "react";

// ── Public types ────────────────────────────────────────────────────────────

export interface UseSpeechSynthesisOptions {
  lang: string;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface UseSpeechSynthesisReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => void;
  cancel: () => void;
  voices: SpeechSynthesisVoice[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return null;
  }
  return window.speechSynthesis;
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string
): SpeechSynthesisVoice | null {
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;

  const prefix = lang.split("-")[0];
  const prefixMatch = voices.find((v) => v.lang.startsWith(prefix));
  if (prefixMatch) return prefixMatch;

  return voices[0] || null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSpeechSynthesis(
  options: UseSpeechSynthesisOptions
): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  const isSupported =
    typeof window !== "undefined" &&
    !!window.speechSynthesis &&
    !!window.SpeechSynthesisUtterance;

  // Load voices (Chrome loads them asynchronously)
  useEffect(() => {
    if (!isSupported) return;

    const synth = getSynth();
    if (!synth) return;

    const loadVoices = () => {
      const vs = synth.getVoices();
      if (vs.length > 0) {
        setVoices(vs);
      }
    };

    loadVoices();

    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }

    const timer = setTimeout(loadVoices, 200);

    return () => {
      clearTimeout(timer);
      if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = null;
      }
    };
  }, [isSupported]);

  /** Cancel any ongoing speech. */
  const cancel = useCallback(() => {
    const synth = getSynth();
    if (synth) {
      synth.cancel();
    }
    setIsSpeaking(false);
  }, []);

  /** Speak the given text. */
  const speak = useCallback(
    (text: string) => {
      if (!isSupported) {
        optionsRef.current.onError?.("当前浏览器不支持语音朗读");
        return;
      }

      const synth = getSynth();
      if (!synth) {
        optionsRef.current.onError?.("语音朗读不可用");
        return;
      }

      // Cancel any previous speech
      synth.cancel();

      const lang = optionsRef.current.lang || "zh-CN";
      const voice = pickVoice(voices, lang);

      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.voice = voice;
      u.volume = 1;
      u.rate = 1;
      u.pitch = 1;

      u.onstart = () => {
        setIsSpeaking(true);
        optionsRef.current.onStart?.();
      };

      u.onend = () => {
        setIsSpeaking(false);
        optionsRef.current.onEnd?.();
      };

      u.onerror = (event: SpeechSynthesisErrorEvent) => {
        setIsSpeaking(false);
        const msg =
          event.error === "canceled"
            ? undefined
            : `朗读失败: ${event.error}`;
        if (msg) {
          optionsRef.current.onError?.(msg);
        }
      };

      synth.speak(u);
    },
    [isSupported, voices]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    isSupported,
    isSpeaking,
    speak,
    cancel,
    voices,
  };
}
