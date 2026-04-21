"use client";

import React, { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lang";
import { SendHorizontal } from "lucide-react";
import { getCurrentUser } from "@/services/AuthService";
import {
  GatewayMessageItem,
  getGatewayHistory,
  getGatewaySkills,
  getGatewayStatus,
  resetGatewayThread,
  sendGatewayMessage,
} from "@/services/GatewayService";

const THREAD_STORAGE_KEY = "mira_web_thread_id";
const THREAD_LIST_STORAGE_KEY = "mira_web_thread_list";

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

  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  useEffect(() => {
    const storedThreadId = sessionStorage.getItem(THREAD_STORAGE_KEY);
    if (storedThreadId) setThreadId(storedThreadId);

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

  const upsertThreadOption = (value: string) => {
    if (!value) return;
    setThreadOptions((prev) => {
      const next = [value, ...prev.filter((item) => item !== value)].slice(0, 50);
      localStorage.setItem(THREAD_LIST_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    setError("");
    try {
      const [historyRes, statusRes, skillsRes] = await Promise.all([
        getGatewayHistory(50),
        getGatewayStatus(),
        getGatewaySkills(),
      ]);
      setMessages(historyRes.data.messages || []);
      setThreadId(historyRes.data.threadId || "");
      if (historyRes.data.threadId) {
        sessionStorage.setItem(THREAD_STORAGE_KEY, historyRes.data.threadId);
        upsertThreadOption(historyRes.data.threadId);
      }
      setStatusData(statusRes.data);
      setSkillsData(skillsRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || tr("chat.loadError", "Could not load chat history."));
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
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

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = "0px";
    const nextHeight = el.scrollHeight;
    el.style.height = `${nextHeight}px`;
  }, [input]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }, [messages, showTyping]);

  useEffect(() => {
    return () => {
      if (typingDelayRef.current) {
        clearTimeout(typingDelayRef.current);
      }
    };
  }, []);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    const userMessage: GatewayMessageItem = {
      id: `local-${Date.now()}`,
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const contentToSend = input.trim();
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
    setThreadId(nextThreadId);
    sessionStorage.setItem(THREAD_STORAGE_KEY, nextThreadId);
    upsertThreadOption(nextThreadId);
    // Backend currently exposes history only for active thread.
    // We switch the local target thread for next sends.
    setMessages([]);
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


  return (
    <div className="grid h-[calc(100vh-3rem)] gap-4 lg:grid-cols-[1fr_320px]">
      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-red-200 bg-white">
        <header className="flex items-center justify-between border-b border-red-200 px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold text-[rgb(173,8,8)]">{tr("chat.title", "Agent Chat")}</h1>
            <p className="text-xs text-zinc-500">
              {tr("chat.thread", "Thread")}: {threadId || tr("chat.notReady", "resolving...")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={threadId || ""}
              onChange={(e) => void onChangeThread(e.target.value)}
              className="max-w-[260px] rounded-lg border border-red-300 bg-white px-2 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 focus:ring-0"
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
              className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 hover:bg-red-200"
            >
              {tr("chat.resetThread", "Reset thread")}
            </button>
          </div>
        </header>

        <div ref={messagesContainerRef} className="flex-1 min-h-0 space-y-3 overflow-auto p-4">
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
              className={`max-w-[46%] rounded-xl px-3 py-2 text-sm ${
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
            </div>
          ))}

          {sending && showTyping && (
            <div className="max-w-[46%] rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-zinc-800">
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

        <form onSubmit={onSend} className="border-t border-red-200 p-4">
          {error && (
            <p className="mb-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="relative">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const text = e.dataTransfer.getData("text/plain");
                if (text) {
                  // Attempt to insert at cursor
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
        </form>
      </section>

      <aside className="space-y-4">
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
              <p className="w-full py-4 text-center text-xs italic text-zinc-400">Không có công cụ nào khả dụng.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
