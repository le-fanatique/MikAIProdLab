"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listChatModels, listChatSystemPrompts, sendChatMessage } from "@/actions/llm/chat";
import type { ChatMessage, ChatSystemPrompt } from "@/types/llm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

let _msgId = 0;
function nextId(): string {
  return `msg-${++_msgId}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Minimal Markdown renderer (no packages, no dangerouslySetInnerHTML)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;

  function peek(n = 1): string {
    return text.slice(i, i + n) || "";
  }

  function tryCodeBlock(): boolean {
    if (peek(3) !== "```") return false;
    const end = text.indexOf("\n```", i + 3);
    if (end === -1) return false;
    const langEnd = text.indexOf("\n", i + 3);
    const lang = langEnd >= 0 && langEnd < end ? text.slice(i + 3, langEnd).trim() : "";
    const codeStart = langEnd >= 0 && langEnd < end ? langEnd + 1 : i + 3;
    const code = text.slice(codeStart, end);
    nodes.push(
      <pre
        key={`cb-${i}`}
        className="bg-[#0d0e10] border border-[#232629] rounded px-2 py-1 my-1 overflow-x-auto text-[10px] text-[#a4abb2] font-mono whitespace-pre-wrap"
      >
        {lang ? <div className="text-[9px] text-[#4b5158] mb-0.5">{lang}</div> : null}
        <code>{code}</code>
      </pre>
    );
    i = end + 4;
    if (peek(1) === "\n") i++;
    return true;
  }

  function parseInline(raw: string, baseKey: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let j = 0;
    while (j < raw.length) {
      if (raw[j] === "`") {
        const endTick = raw.indexOf("`", j + 1);
        if (endTick !== -1) {
          const code = raw.slice(j + 1, endTick);
          parts.push(
            <code key={`${baseKey}-ic-${j}`} className="bg-[#1a1d20] text-[#c084fc] px-1 rounded text-[10px] font-mono">
              {code}
            </code>
          );
          j = endTick + 1;
          continue;
        }
      }
      if (raw[j] === "*" && raw[j + 1] === "*") {
        const endBold = raw.indexOf("**", j + 2);
        if (endBold !== -1) {
          parts.push(
            <strong key={`${baseKey}-b-${j}`} className="font-semibold text-[#e0e4e8]">
              {raw.slice(j + 2, endBold)}
            </strong>
          );
          j = endBold + 2;
          continue;
        }
      }
      if (raw[j] === "*" && raw[j + 1] !== "*") {
        const endIt = raw.indexOf("*", j + 1);
        if (endIt !== -1) {
          parts.push(
            <em key={`${baseKey}-i-${j}`} className="italic text-[#b0b8c0]">
              {raw.slice(j + 1, endIt)}
            </em>
          );
          j = endIt + 1;
          continue;
        }
      }
      if (raw[j] === "[") {
        const closeB = raw.indexOf("](", j);
        if (closeB !== -1) {
          const closeP = raw.indexOf(")", closeB + 2);
          if (closeP !== -1) {
            const label = raw.slice(j + 1, closeB);
            const href = raw.slice(closeB + 2, closeP);
            if (href.startsWith("http://") || href.startsWith("https://")) {
              parts.push(
                <a key={`${baseKey}-link-${j}`} href={href} target="_blank" rel="noopener noreferrer" className="text-[#7d8cf0] underline underline-offset-2">
                  {label}
                </a>
              );
              j = closeP + 1;
              continue;
            }
          }
        }
      }
      parts.push(raw[j]);
      j++;
    }
    return parts;
  }

  while (i < text.length) {
    if (peek(2) === "\n\n") { i += 2; continue; }
    if (tryCodeBlock()) continue;

    let lineEnd = text.indexOf("\n", i);
    if (lineEnd === -1) lineEnd = text.length;
    let line = text.slice(i, lineEnd);
    i = lineEnd + (lineEnd < text.length ? 1 : 0);
    if (line.endsWith("\r")) line = line.slice(0, -1);

    const key = `l-${i}`;

    if (/^[-*]\s/.test(line)) {
      const item = line.replace(/^[-*]\s+/, "");
      nodes.push(
        <div key={key} className="flex items-start gap-1.5 text-[11px] leading-relaxed my-0.5">
          <span className="text-[#4b5158] shrink-0">•</span>
          <span className="text-[#a4abb2]">{parseInline(item, key)}</span>
        </div>
      );
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const m = line.match(/^(#{1,3})\s+(.+)/);
      if (m) {
        const level = m[1].length;
        const sizes: Record<number, string> = { 1: "text-sm", 2: "text-[12px]", 3: "text-[11px]" };
        nodes.push(
          <div key={key} className={`font-semibold text-[#e0e4e8] ${sizes[level] ?? "text-[11px]"} mt-2 mb-0.5`}>
            {parseInline(m[2], key)}
          </div>
        );
        continue;
      }
    }

    if (line.trim()) {
      nodes.push(
        <p key={key} className="text-[11px] leading-relaxed text-[#a4abb2] my-0.5">
          {parseInline(line, key)}
        </p>
      );
    } else {
      nodes.push(<br key={key} />);
    }
  }

  return nodes.length > 0 ? nodes : [<span key="empty" className="text-[11px] text-[#4b5158] italic">(empty)</span>];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 640;

export default function SidebarLLMChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  // System prompt state
  const [systemPrompts, setSystemPrompts] = useState<ChatSystemPrompt[]>([]);
  const [selectedSystemPromptId, setSelectedSystemPromptId] = useState<string>("none");
  const [promptsError, setPromptsError] = useState<string | null>(null);

  // Resizable height
  const [chatHeight, setChatHeight] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mikai.sidebarChatHeight");
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= MIN_HEIGHT && n <= MAX_HEIGHT) return n;
      }
    }
    return DEFAULT_HEIGHT;
  });
  const dragRef = useRef<{ startY: number; startH: number; dragging: boolean }>({
    startY: 0,
    startH: DEFAULT_HEIGHT,
    dragging: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load models + system prompts on mount
  useEffect(() => {
    async function load() {
      const [modelsRes, promptsRes] = await Promise.all([
        listChatModels(),
        listChatSystemPrompts(),
      ]);

      if (modelsRes.ok) {
        setModels(modelsRes.models);
        if (modelsRes.defaultModel && modelsRes.models.includes(modelsRes.defaultModel)) {
          setSelectedModel(modelsRes.defaultModel);
        } else if (modelsRes.models.length > 0) {
          setSelectedModel(modelsRes.models[0]);
        }
      } else {
        setModelError(modelsRes.error);
      }

      if (promptsRes.ok) {
        setSystemPrompts(promptsRes.prompts);
      } else {
        setPromptsError(promptsRes.error);
      }
    }
    load();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Drag resize handlers
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: chatHeight, dragging: true };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [chatHeight]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const delta = dragRef.current.startY - e.clientY;
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startH + delta));
      setChatHeight(newH);
    };
    const onUp = () => {
      if (dragRef.current.dragging) {
        dragRef.current.dragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem("mikai.sidebarChatHeight", String(chatHeight));
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [chatHeight]);

  const selectedSystemPrompt = selectedSystemPromptId !== "none"
    ? systemPrompts.find((p) => p.id === selectedSystemPromptId) ?? null
    : null;

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || !selectedModel) return;

    setError(null);
    const userMsg: LocalMessage = { id: nextId(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Build API messages with system prompt if selected
    const apiMessages: ChatMessage[] = [];
    if (selectedSystemPrompt) {
      apiMessages.push({ role: "system", content: selectedSystemPrompt.prompt });
    }
    for (const m of messages) {
      apiMessages.push({ role: m.role as "user" | "assistant", content: m.content });
    }
    apiMessages.push({ role: "user" as const, content: trimmed });

    const res = await sendChatMessage({ model: selectedModel, messages: apiMessages });

    if (res.ok) {
      const assistantMsg: LocalMessage = { id: nextId(), role: "assistant", content: res.content };
      setMessages((prev) => [...prev, assistantMsg]);
    } else {
      setError(res.error);
    }

    setIsLoading(false);
  }, [input, isLoading, selectedModel, selectedSystemPrompt, messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return (
    <div className="border-t border-[#232629] px-4 pt-4 mt-4">
      {!isOpen ? (
        // ── Closed state ──────────────────────────────────────────────
        <button
          onClick={() => setIsOpen(true)}
          className="w-full text-left px-3 py-2 rounded hover:bg-[#1a1d20] transition-colors"
        >
          <div className="text-[11px] font-medium text-[#a4abb2]">Chat</div>
          <div className="text-[10px] text-[#6e767d]">Ask the local LLM</div>
        </button>
      ) : (
        // ── Open state ────────────────────────────────────────────────
        <div className="flex flex-col" style={{ height: chatHeight }}>
          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            className="flex items-center justify-center h-[6px] -mt-1 mb-1 cursor-row-resize group"
            title="Drag to resize chat"
          >
            <div className="w-8 h-[3px] rounded-full bg-[#2a2d31] group-hover:bg-[#4b5158] transition-colors" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[#e0e4e8]">LLM Chat</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[#4b5158] hover:text-[#a4abb2] text-sm leading-none"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {/* Model selector */}
          {modelError ? (
            <div className="text-[10px] text-[#e0556a] mb-1.5">{modelError}</div>
          ) : (
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-[9px] text-[#4b5158] uppercase tracking-wider shrink-0">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="flex-1 bg-[#0d0e10] border border-[#232629] rounded px-1.5 py-0.5 text-[10px] text-[#a4abb2] focus:outline-none focus:border-[#3a4046]"
              >
                {models.length === 0 && <option value="">No models found.</option>}
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* System Prompt selector */}
          {promptsError ? (
            <div className="text-[9px] text-[#4b5158] mb-1.5">{promptsError}</div>
          ) : (
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-[9px] text-[#4b5158] uppercase tracking-wider shrink-0">
                System Prompt
              </label>
              <select
                value={selectedSystemPromptId}
                onChange={(e) => setSelectedSystemPromptId(e.target.value)}
                className="flex-1 bg-[#0d0e10] border border-[#232629] rounded px-1.5 py-0.5 text-[10px] text-[#a4abb2] focus:outline-none focus:border-[#3a4046]"
              >
                <option value="none">None</option>
                {systemPrompts.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            </div>
          )}

          {selectedSystemPrompt && (
            <div className="text-[9px] text-[#4b5158] mb-1.5 truncate">
              Active: {selectedSystemPrompt.name}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto mb-2 space-y-1.5 min-h-[40px]">
            {messages.length === 0 && !error && (
              <div className="text-[10px] text-[#4b5158] italic">Ask anything...</div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`px-2 py-1 rounded text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1a1d20] text-[#a4abb2]"
                    : "bg-transparent text-[#a4abb2]"
                }`}
              >
                {msg.role === "user" ? (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                ) : (
                  <div>{renderMarkdown(msg.content)}</div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="px-2 py-1 text-[10px] text-[#6e767d] italic">Thinking...</div>
            )}
            {error && (
              <div className="px-2 py-1 rounded bg-[#2d1518] border border-[#5a1a1a] text-[10px] text-[#e0556a]">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !selectedModel}
            placeholder="Ask anything..."
            rows={2}
            className="w-full bg-[#0d0e10] border border-[#232629] rounded px-2 py-1 text-[11px] text-[#a4abb2] placeholder-[#4b5158] resize-none focus:outline-none focus:border-[#3a4046] disabled:opacity-50"
          />

          {/* Buttons */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim() || !selectedModel}
              className="px-3 py-1 rounded bg-[#1a1d20] border border-[#232629] text-[10px] text-[#a4abb2] hover:bg-[#252830] hover:text-[#e0e4e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="px-3 py-1 rounded text-[10px] text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}