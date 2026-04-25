"use client";

import React, { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lang";
import { Film, Image as ImageIcon, Mic, Plus, SendHorizontal } from "lucide-react";
import { getCurrentUser } from "@/services/AuthService";
import {
  GatewayMessageItem,
  getGatewayHistory,
  getGatewaySkills,
  getGatewayStatus,
  getGatewayThreads,
  resetGatewayThread,
  sendGatewayMessage,
  switchGatewayThread,
} from "@/services/GatewayService";

const THREAD_STORAGE_KEY = "mira_web_thread_id";
const THREAD_LIST_STORAGE_KEY = "mira_web_thread_list";

const MAX_ATTACHMENTS = 12;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MIN_VOICE_BYTES = 400;

type PendingAttachment = {
  id: string;
  kind: "image" | "video" | "audio";
  file: File;
  previewUrl: string;
};

function pickAudioRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function classifyMediaFile(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const n = file.name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg|heic|avif)$/i.test(n)) return "image";
  if (/\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(n)) return "video";
  return null;
}

function filesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = [];
  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) out.push(dt.files[i]);
  }
  return out;
}

function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  if (data.files?.length) {
    for (let i = 0; i < data.files.length; i++) out.push(data.files[i]);
    if (out.length) return out;
  }
  if (data.items?.length) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}

export default function ChatPage() {
  const { t } = useLang();
  const [messages, setMessages] = useState<GatewayMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [statusData, setStatusData] = useState<any>(null);
  const [skillsData, setSkillsData] = useState<any>(null);
  const [username, setUsername] = useState("User");
  const [threadOptions, setThreadOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [showTyping, setShowTyping] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordMimeRef = useRef<string>("");
  const discardVoiceRef = useRef(false);
  const voiceBusyRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);

  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  pendingAttachmentsRef.current = pendingAttachments;

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = attachMenuRef.current;
      if (el && !el.contains(e.target as Node)) setAttachMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setAttachMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachMenuOpen]);

  useEffect(() => {
    const storedThreadList = localStorage.getItem(THREAD_LIST_STORAGE_KEY);
    if (storedThreadList) {
      try {
        const parsed = JSON.parse(storedThreadList) as string[];
        if (Array.isArray(parsed)) {
          setThreadOptions(parsed.filter((item) => typeof item === "string"));
        }
      } catch {
        setThreadOptions([]);
      }
    }
  }, []);

  const persistThreadOptions = (ids: string[]) => {
    const next = [...new Set(ids.filter(Boolean))].slice(0, 50);
    localStorage.setItem(THREAD_LIST_STORAGE_KEY, JSON.stringify(next));
    return next;
  };

  const upsertThreadOption = (value: string) => {
    if (!value) return;
    setThreadOptions((prev) => persistThreadOptions([value, ...prev.filter((item) => item !== value)]));
  };

  const mergeThreadIds = (...groups: (string | undefined)[][]) => {
    const out: string[] = [];
    for (const g of groups) {
      for (const id of g) {
        if (id && !out.includes(id)) out.push(id);
        if (out.length >= 50) break;
      }
      if (out.length >= 50) break;
    }
    return out;
  };

  /** Align server active thread (GET /gateway/history is for active thread only), then load UI. */
  const ensureActiveThread = async (preferredThreadId: string | null) => {
    if (!preferredThreadId) return;
    try {
      await switchGatewayThread(preferredThreadId);
    } catch {
      sessionStorage.removeItem(THREAD_STORAGE_KEY);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    setError("");
    const preferred = sessionStorage.getItem(THREAD_STORAGE_KEY);
    try {
      await ensureActiveThread(preferred);
      const [historyRes, statusRes, skillsRes, threadsRes] = await Promise.all([
        getGatewayHistory(50),
        getGatewayStatus(),
        getGatewaySkills(),
        getGatewayThreads().catch(() => ({ data: { items: [] as const } })),
      ]);
      setMessages(historyRes.data.messages || []);
      const resolvedId = historyRes.data.threadId || "";
      setThreadId(resolvedId);
      if (resolvedId) {
        sessionStorage.setItem(THREAD_STORAGE_KEY, resolvedId);
      }
      const serverIds =
        threadsRes.data?.items?.map((it) => it.threadId).filter((id): id is string => Boolean(id)) ?? [];
      setThreadOptions((prev) =>
        persistThreadOptions(mergeThreadIds(serverIds, [resolvedId], prev)),
      );
      setStatusData(statusRes.data);
      setSkillsData(skillsRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || tr("chat.loadError", "Could not load chat history."));
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser();
        setUsername(me.data.uname || me.data.identifier || "User");
      } catch {
        setUsername("User");
      }
    })();
  }, []);

  const canSend = useMemo(
    () =>
      (input.trim().length > 0 || pendingAttachments.length > 0) && !sending && !isRecording,
    [input, pendingAttachments.length, sending, isRecording],
  );

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  /** Same queue as picker: paste, drop on input or message list, or + menu. */
  const enqueueMediaFiles = (files: File[], options?: { only?: "image" | "video" }) => {
    if (!files.length) return;
    const only = options?.only;
    const filtered = files.filter((f) => {
      const k = classifyMediaFile(f);
      if (!k) return false;
      if (only && k !== only) return false;
      return true;
    });
    if (!filtered.length) return;

    setError("");
    let limitHit = false;
    let sizeRejected = false;
    setPendingAttachments((prev) => {
      const next = [...prev];
      for (const file of filtered) {
        const kind = classifyMediaFile(file)!;
        const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
        if (next.length >= MAX_ATTACHMENTS) {
          limitHit = true;
          break;
        }
        if (file.size > maxBytes) {
          sizeRejected = true;
          continue;
        }
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
          kind,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      return next;
    });
    if (limitHit) setError(tr("chat.tooManyAttachments", "Up to 12 attachments per message."));
    else if (sizeRejected) setError(tr("chat.mediaTooLarge", "File exceeds size limit."));
  };

  const addFilesFromPicker = (fileList: FileList | null, kind: "image" | "video") => {
    if (!fileList?.length) return;
    enqueueMediaFiles(Array.from(fileList), { only: kind });
    setAttachMenuOpen(false);
  };

  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = filesFromClipboard(e.clipboardData);
    const media = files.filter((f) => classifyMediaFile(f));
    if (!media.length) return;
    e.preventDefault();
    enqueueMediaFiles(media);
  };

  const handleFileDrop = (e: React.DragEvent, options?: { only?: "image" | "video" }) => {
    const files = filesFromDataTransfer(e.dataTransfer);
    let media = files.filter((f) => classifyMediaFile(f));
    if (options?.only) media = media.filter((f) => classifyMediaFile(f) === options.only);
    if (!media.length) return false;
    e.preventDefault();
    enqueueMediaFiles(media, options?.only ? { only: options.only } : undefined);
    return true;
  };

  const cancelVoiceRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      discardVoiceRef.current = true;
      try {
        rec.requestData?.();
      } catch {
        /* ignore */
      }
      rec.stop();
    }
  }, []);

  const toggleVoiceRecording = async () => {
    if (sending) return;
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      setError(tr("chat.voiceUnsupported", "Voice recording is not supported in this browser."));
      return;
    }
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      discardVoiceRef.current = false;
      try {
        rec.requestData?.();
      } catch {
        /* ignore */
      }
      rec.stop();
      return;
    }
    if (voiceBusyRef.current) return;
    voiceBusyRef.current = true;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      recordChunksRef.current = [];
      recordStreamRef.current = stream;
      const mime = pickAudioRecorderMime();
      recordMimeRef.current = mime;
      const opts: MediaRecorderOptions = MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : {};
      const mr = new MediaRecorder(stream, opts);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const streamNow = recordStreamRef.current;
        recordStreamRef.current = null;
        streamNow?.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setIsRecording(false);
        const mimeType = recordMimeRef.current || "audio/webm";
        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];
        if (discardVoiceRef.current) {
          discardVoiceRef.current = false;
          return;
        }
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < MIN_VOICE_BYTES) {
          setError(tr("chat.voiceTooShort", "Recording is too short."));
          return;
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          setError(tr("chat.mediaTooLarge", "File exceeds size limit."));
          return;
        }
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || mimeType });
        const previewUrl = URL.createObjectURL(blob);
        setPendingAttachments((prev) => {
          if (prev.length >= MAX_ATTACHMENTS) {
            URL.revokeObjectURL(previewUrl);
            setError(tr("chat.tooManyAttachments", "Up to 12 attachments per message."));
            return prev;
          }
          return [
            ...prev,
            {
              id: `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              kind: "audio" as const,
              file,
              previewUrl,
            },
          ];
        });
      };
      mr.start(400);
      setIsRecording(true);
    } catch {
      setError(tr("chat.voicePermission", "Microphone access was denied or is unavailable."));
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;
    } finally {
      voiceBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (!isRecording) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") cancelVoiceRecording();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRecording, cancelVoiceRecording]);

  useEffect(() => {
    return () => {
      discardVoiceRef.current = true;
      const r = mediaRecorderRef.current;
      if (r && (r.state === "recording" || r.state === "paused")) {
        try {
          r.requestData?.();
        } catch {
          /* ignore */
        }
        r.stop();
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;
      mediaRecorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = "0px";
    const nextHeight = el.scrollHeight;
    el.style.height = `${nextHeight}px`;
  }, [input, pendingAttachments.length]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }, [messages, showTyping, pendingAttachments.length]);

  useEffect(() => {
    return () => {
      if (typingDelayRef.current) {
        clearTimeout(typingDelayRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!infoOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infoOpen]);

  useEffect(() => {
    if (!infoOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [infoOpen]);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || sending) return;

    const snap = [...pendingAttachments];
    let mediaPayload: { mediaUrl?: string; mediaPaths?: string[] } = {};
    let attachmentViews: GatewayMessageItem["attachments"] | undefined;

    if (snap.length > 0) {
      try {
        const dataUrls: string[] = [];
        const kinds: ("image" | "video" | "audio")[] = [];
        for (const a of snap) {
          const maxBytes =
            a.kind === "image" ? MAX_IMAGE_BYTES : a.kind === "video" ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES;
          if (a.file.size > maxBytes) {
            setError(tr("chat.mediaTooLarge", "File exceeds size limit."));
            return;
          }
          dataUrls.push(await readFileAsDataUrl(a.file));
          kinds.push(a.kind);
        }
        attachmentViews = dataUrls.map((url, i) => ({ kind: kinds[i], url }));
        if (dataUrls.length === 1) {
          mediaPayload = { mediaUrl: dataUrls[0] };
        } else if (dataUrls.length > 1) {
          mediaPayload = { mediaUrl: dataUrls[0], mediaPaths: dataUrls.slice(1) };
        }
      } catch {
        setError(tr("chat.mediaReadError", "Could not read an attachment."));
        return;
      }
      for (const a of snap) {
        URL.revokeObjectURL(a.previewUrl);
      }
      setPendingAttachments([]);
    }

    const contentToSend = text || (snap.length > 0 ? " " : "");
    const displayContent =
      text || (snap.length > 0 ? tr("chat.mediaOnlyPlaceholder", "(Media attached)") : "");

    const userMessage: GatewayMessageItem = {
      id: `local-${Date.now()}`,
      role: "user",
      content: displayContent,
      createdAt: new Date().toISOString(),
      ...(attachmentViews?.length ? { attachments: attachmentViews } : {}),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    setShowTyping(false);
    setError("");
    if (typingDelayRef.current) {
      clearTimeout(typingDelayRef.current);
    }
    typingDelayRef.current = setTimeout(
      () => setShowTyping(true),
      Math.floor(1000 + Math.random() * 500),
    );

    try {
      const response = await sendGatewayMessage({
        content: contentToSend,
        threadId: threadId || undefined,
        ...mediaPayload,
      });

      const nextThreadId = response.data.threadId;
      setThreadId(nextThreadId);
      sessionStorage.setItem(THREAD_STORAGE_KEY, nextThreadId);
      upsertThreadOption(nextThreadId);

      const assistantMessage: GatewayMessageItem = {
        id: response.data.runId || `assistant-${Date.now()}`,
        role: "assistant",
        content: response.data.response,
        tokensUsed: response.data.tokensUsed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || tr("chat.sendError", "Could not send message."));
    } finally {
      if (typingDelayRef.current) {
        clearTimeout(typingDelayRef.current);
      }
      setShowTyping(false);
      setSending(false);
    }
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        void onSend(e);
      }
    }
  };

  const onResetThread = async () => {
    setError("");
    try {
      const response = await resetGatewayThread("manual_reset_from_web_ui");
      const nextThreadId = response.data.threadId;
      setThreadId(nextThreadId);
      sessionStorage.setItem(THREAD_STORAGE_KEY, nextThreadId);
      upsertThreadOption(nextThreadId);
      setMessages([]);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || tr("chat.resetError", "Could not reset thread."));
    }
  };

  const formatMessageTime = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const onChangeThread = async (nextThreadId: string) => {
    if (!nextThreadId || nextThreadId === threadId) return;
    setLoadingHistory(true);
    setError("");
    try {
      await switchGatewayThread(nextThreadId);
      sessionStorage.setItem(THREAD_STORAGE_KEY, nextThreadId);
      upsertThreadOption(nextThreadId);
      const historyRes = await getGatewayHistory(50);
      setMessages(historyRes.data.messages || []);
      const resolvedId = historyRes.data.threadId || nextThreadId;
      setThreadId(resolvedId);
      if (resolvedId) sessionStorage.setItem(THREAD_STORAGE_KEY, resolvedId);
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          e?.message ||
          tr("chat.switchThreadError", "Could not switch to this thread."),
      );
    } finally {
      setLoadingHistory(false);
    }
  };
  const activeSkills = useMemo(() => {
    if (!skillsData) return [];
    if (Array.isArray(skillsData)) return skillsData;
    if (Array.isArray(skillsData.skills)) return skillsData.skills;
    if (Array.isArray(skillsData.data)) return skillsData.data;
    if (Array.isArray(skillsData.items)) return skillsData.items;
    if (typeof skillsData === "object" && skillsData !== null) {
      if (skillsData.installed) return skillsData.installed;
      return Object.keys(skillsData).map((k) => ({ name: k }));
    }
    return [];
  }, [skillsData]);


  const infoSections = (
    <>
      <section className="rounded-2xl border border-red-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[rgb(173,8,8)]">{tr("chat.status", "Agent Information")}</h2>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
            {statusData?.status === "ok" ? "Online" : "Active"}
          </div>
        </div>

        <div className="flex flex-col gap-3 text-xs text-zinc-600">
          <div className="flex items-center justify-between rounded-lg border border-red-50 bg-white/50 p-2">
            <span className="font-medium text-zinc-500">Cốt lõi</span>
            <span className="font-semibold text-zinc-800">{statusData?.name || "Mira Multi-Agent"}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-red-50 bg-white/50 p-2">
            <span className="font-medium text-zinc-500">Phiên bản</span>
            <span className="font-semibold text-zinc-800">{statusData?.version || "1.0.0"}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-red-50 bg-white/50 p-2">
            <span className="font-medium text-zinc-500">Bảo mật</span>
            <span className="font-semibold text-zinc-800">{statusData?.auth === "required" ? "Đã xác thực" : "Chế độ mở"}</span>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-2xl border border-red-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[rgb(173,8,8)]"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <h2 className="text-sm font-bold text-[rgb(173,8,8)]">{tr("chat.skills", "Công cụ tích hợp")}</h2>
        </div>

        <div className="flex flex-wrap gap-2 overflow-y-auto">
          {activeSkills.length > 0 ? (
            activeSkills.map((skill: any, idx: number) => {
              const name = typeof skill === "string" ? skill : skill.name || skill.id || "Skill";
              const code = typeof skill === "object" && skill.code ? skill.code : name;
              const desc = typeof skill === "object" && skill.description ? skill.description : undefined;
              return (
                <span
                  key={idx}
                  draggable
                  title={desc}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", `/${code} `);
                  }}
                  className="inline-flex cursor-grab active:cursor-grabbing items-center rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50"
                >
                  {name}
                </span>
              );
            })
          ) : (
            <p className="w-full py-4 text-center text-xs italic text-zinc-400">
              {tr("chat.skillsEmpty", "Không có công cụ nào khả dụng.")}
            </p>
          )}
        </div>
      </section>
    </>
  );

  return (
    <div className="flex w-full min-w-0 flex-1 min-h-0 flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[1fr_320px]">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-red-200 bg-white">
        <header className="flex flex-col gap-2 border-b border-red-200 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-[rgb(173,8,8)] sm:text-xl">{tr("chat.title", "Agent Chat")}</h1>
              <p className="truncate text-[11px] text-zinc-500 sm:text-xs" title={threadId || tr("chat.notReady", "resolving...")}>
                {tr("chat.thread", "Thread")}: {threadId || tr("chat.notReady", "resolving...")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 lg:hidden"
              aria-label={tr("chat.openInfo", "Open agent info")}
              title={tr("chat.openInfo", "Open agent info")}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 10.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="12" cy="8" r="0.9" fill="currentColor" />
              </svg>
              <span>{tr("chat.info", "Info")}</span>
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <select
              value={threadId || ""}
              onChange={(e) => void onChangeThread(e.target.value)}
              className="min-w-0 max-w-full flex-1 rounded-lg border border-red-300 bg-white px-2 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 focus:ring-0 min-[640px]:max-w-[260px] min-[640px]:flex-none"
            >
              {!threadId && <option value="">{tr("chat.notReady", "resolving...")}</option>}
              {threadOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onResetThread}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-100 px-2.5 py-2 text-sm text-red-700 hover:bg-red-200"
              aria-label={tr("chat.resetThread", "Reset thread")}
              title={tr("chat.resetThread", "Reset thread")}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M4 11a8 8 0 0 1 14-5.3M20 13a8 8 0 0 1-14 5.3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{tr("chat.resetThread", "Reset thread")}</span>
            </button>
          </div>
        </header>

        <div
          ref={messagesContainerRef}
          onDragOver={(e) => {
            const types = e.dataTransfer.types;
            const hasFiles = types ? [...types].includes("Files") : false;
            if (hasFiles) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const files = filesFromDataTransfer(e.dataTransfer);
            if (files.length) {
              e.preventDefault();
              handleFileDrop(e);
            }
          }}
          className="flex-1 min-h-0 space-y-3 overflow-auto p-2 sm:p-4"
        >
          {loadingHistory && (
            <p className="text-sm text-zinc-500">{tr("chat.loading", "Loading conversation...")}</p>
          )}
          {!loadingHistory && messages.length === 0 && threadId && (
            <p className="text-xs text-zinc-500">
              {tr(
                "chat.threadHint",
                "Selected thread is ready. Send a message to continue this conversation.",
              )}
            </p>
          )}
          {!loadingHistory && messages.length === 0 && !threadId && (
            <p className="text-sm text-zinc-500">{tr("chat.empty", "No messages yet. Start chatting with your agent.")}</p>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[min(92%,24rem)] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "ml-auto bg-[rgb(173,8,8)] text-white"
                  : "border border-red-200 bg-red-50 text-zinc-800"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-[11px] opacity-70">
                <span className="uppercase tracking-wide">
                  {msg.role === "user" ? username : "Agent"}
                </span>
                <span>{formatMessageTime(msg.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-2 space-y-2">
                  {msg.attachments.map((att, idx) =>
                    att.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={att.url}
                        alt=""
                        className="max-h-52 max-w-full rounded-lg object-contain ring-1 ring-black/10"
                      />
                    ) : att.kind === "video" ? (
                      <video
                        key={idx}
                        src={att.url}
                        controls
                        className="max-h-52 max-w-full rounded-lg ring-1 ring-black/10"
                      />
                    ) : (
                      <audio
                        key={idx}
                        src={att.url}
                        controls
                        className="max-w-full rounded-lg ring-1 ring-white/30"
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          ))}

          {sending && showTyping && (
            <div className="max-w-[min(92%,24rem)] rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-zinc-800">
              <div className="mb-1 flex items-center justify-between gap-3 text-[11px] opacity-70">
                <span className="uppercase tracking-wide">Agent</span>
                <span>{tr("chat.typing", "typing...")}</span>
              </div>
              <div className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:240ms]" />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={onSend} className="shrink-0 border-t border-red-200 p-2 sm:p-4">
          {error && (
            <p className="mb-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {isRecording && (
            <p className="mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-600" aria-hidden />
              {tr("chat.voiceRecording", "Recording…")}
            </p>
          )}
          {pendingAttachments.length > 0 && (
            <div className="mb-2 rounded-xl border border-zinc-200/90 bg-zinc-50 px-2 py-2 shadow-inner">
              <div className="flex max-h-[5.5rem] gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300">
                {pendingAttachments.map((a) => (
                  <div
                    key={a.id}
                    className={`relative h-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm ${
                      a.kind === "audio" ? "min-w-[9.5rem] w-[9.5rem] px-1.5 py-1" : "w-[4.5rem]"
                    }`}
                  >
                    {a.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : a.kind === "video" ? (
                      <video src={a.previewUrl} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                      <div className="relative flex h-full flex-col items-stretch justify-end gap-0.5 pb-1 pt-5">
                        <div className="pointer-events-none flex items-center justify-center gap-1 text-red-600">
                          <Mic size={14} strokeWidth={2.5} />
                          <span className="text-[10px] font-semibold uppercase tracking-wide">
                            {tr("chat.voiceBadge", "Voice")}
                          </span>
                        </div>
                        <audio src={a.previewUrl} controls className="relative z-0 h-8 w-full max-w-full" />
                      </div>
                    )}
                    {a.kind === "video" && (
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium uppercase text-white">
                        {tr("chat.videoBadge", "Video")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(a.id)}
                      className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-[11px] font-bold leading-none text-white shadow-sm hover:bg-black/80"
                      aria-label={tr("chat.removeAttachment", "Remove file")}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="relative shrink-0 pb-0.5" ref={attachMenuRef}>
              <button
                type="button"
                disabled={sending || isRecording}
                onClick={() => setAttachMenuOpen((o) => !o)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-300 bg-white text-red-700 outline-none transition hover:bg-red-50 focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={tr("chat.addAttachment", "Attach")}
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
              >
                <Plus size={20} strokeWidth={2.25} />
              </button>
              {attachMenuOpen && (
                <div
                  className="absolute bottom-full left-0 z-20 mb-1 min-w-[10rem] overflow-hidden rounded-xl border border-red-200 bg-white py-1 shadow-lg"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-red-50"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImageIcon size={16} className="text-red-600" />
                    {tr("chat.addImage", "Image")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-red-50"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Film size={16} className="text-red-600" />
                    {tr("chat.addVideo", "Video")}
                  </button>
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFilesFromPicker(e.target.files, "image");
                  e.target.value = "";
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFilesFromPicker(e.target.files, "video");
                  e.target.value = "";
                }}
              />
            </div>
            <button
              type="button"
              disabled={sending}
              onClick={() => void toggleVoiceRecording()}
              title={
                isRecording
                  ? tr("chat.voiceStopHint", "Tap again to finish and attach")
                  : tr("chat.voiceRecordHint", "Tap to record voice; Esc to cancel while recording")
              }
              aria-pressed={isRecording}
              aria-label={
                isRecording
                  ? tr("chat.voiceStopHint", "Tap again to finish and attach")
                  : tr("chat.voiceRecordHint", "Tap to record voice")
              }
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border outline-none transition focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                isRecording
                  ? "animate-pulse border-red-500 bg-red-600 text-white shadow-md"
                  : "border-red-300 bg-white text-red-700 hover:bg-red-50"
              }`}
            >
              <Mic size={20} strokeWidth={2.25} />
            </button>
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onInputKeyDown}
                onPaste={handleComposerPaste}
                onDragOver={(e) => {
                  const types = e.dataTransfer.types;
                  if (types && [...types].includes("Files")) e.dataTransfer.dropEffect = "copy";
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (handleFileDrop(e)) return;
                  e.preventDefault();
                  const text = e.dataTransfer.getData("text/plain");
                  if (text) {
                    const target = e.target as HTMLTextAreaElement;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    if (start !== null && end !== null) {
                      const next = input.slice(0, start) + text + input.slice(end);
                      setInput(next);
                    } else {
                      setInput((prev) => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + text);
                    }
                  }
                }}
                placeholder={tr("chat.placeholder", "Type your message to the Mira agent...")}
                className="min-h-11 w-full resize-none overflow-hidden rounded-xl border border-red-300 bg-white px-4 py-3 pr-14 font-sans text-sm leading-normal tracking-tight text-zinc-800 outline-none focus:border-red-300 focus:ring-0"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 appearance-none items-center justify-center rounded-full border border-transparent bg-zinc-200 text-zinc-600 outline-none ring-0 transition hover:bg-zinc-300 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                aria-label={tr("chat.send", "Send")}
              >
                <SendHorizontal size={15} />
              </button>
            </div>
          </div>
        </form>
      </section>

      <aside className="hidden min-w-0 space-y-3 sm:space-y-4 lg:block lg:min-h-0 lg:overflow-y-auto">
        {infoSections}
      </aside>

      {infoOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setInfoOpen(false)}
          role="presentation"
        >
          <div
            className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={tr("chat.info", "Info")}
          >
            <div className="flex items-center justify-between border-b border-red-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-[rgb(173,8,8)]">
                {tr("chat.info", "Info")}
              </h2>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={tr("chat.closeInfo", "Close")}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:space-y-4 sm:p-4">
              {infoSections}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
