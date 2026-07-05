"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateChatImages, listChatModels, listChatSystemPrompts, sendChatMessage } from "@/actions/llm/chat";
import { listImageModels } from "@/actions/llm/imageGeneration";
import type { ChatGeneratedImage, ChatImageReference, ChatImageSize, ChatMessage, ChatMessageContentPart, ChatSystemPrompt, ImageModelInfo, LLMProvider } from "@/types/llm";
import ModelPickerWithFilter from "@/components/ModelPickerWithFilter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;          // displayed text (typed message, or "" if file/image-only)
  sentContent?: string;     // full merged text content sent to LLM (includes file body)
  attachmentLabel?: string; // "notes.md · 12 KB" — badge shown in message bubble
  imageLabel?: string;      // "photo.png · 200 KB" — image badge
  imageThumbnailDataUrl?: string; // data URL for thumbnail display in bubble
  images?: ChatGeneratedImage[]; // images returned by the assistant provider
};

let _msgId = 0;
function nextId(): string {
  return `msg-${++_msgId}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Text attachment validation
// ---------------------------------------------------------------------------

const ALLOWED_EXTS = new Set([
  ".txt", ".md", ".json", ".csv", ".log",
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".sh", ".yaml", ".yml", ".toml", ".xml",
]);

const BLOCKED_EXTS = new Set([
  ".pem", ".key", ".p12", ".pfx",
  ".db", ".sqlite", ".sqlite3", ".secret",
]);

const MAX_FILE_BYTES = 1 * 1024 * 1024;   // 1 MB hard limit
const WARN_FILE_BYTES = 256 * 1024;        // 256 KB soft warning

// ---------------------------------------------------------------------------
// Image attachment validation
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB hard limit

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isBlockedFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === ".env" || lower.startsWith(".env.")) return true;
  return BLOCKED_EXTS.has(fileExt(name));
}

function isAllowedFile(name: string): boolean {
  if (isBlockedFile(name)) return false;
  return ALLOWED_EXTS.has(fileExt(name));
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
]);

function isSafeImageSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("https://") || src.startsWith("http://")) return true;
  if (src.startsWith("data:")) {
    const mime = src.slice(5).split(";")[0]?.toLowerCase() ?? "";
    return SAFE_IMAGE_MIME_TYPES.has(mime);
  }
  return false;
}

function buildSentContent(
  fileName: string,
  sizeBytes: number,
  fileContent: string,
  userText: string
): string {
  const header = `Attached file: ${fileName}\nSize: ${fmtBytes(sizeBytes)}\n---\n${fileContent}\n---`;
  return userText.trim() ? `${header}\n\nUser message:\n${userText.trim()}` : header;
}

type AttachedFile = { name: string; sizeBytes: number; content: string };
type AttachedImage = { name: string; sizeBytes: number; dataUrl: string; mimeType: string };

// ---------------------------------------------------------------------------
// AssistantImage — renders an image received in an assistant response
// ---------------------------------------------------------------------------

function AssistantImage({ src, alt }: { src: string; alt: string }) {
  if (!isSafeImageSrc(src)) return null;

  function handleDownload() {
    if (src.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = src;
      const ext = src.slice(5).split(";")[0]?.split("/")[1] ?? "png";
      a.download = `image.${ext}`;
      a.click();
    } else if (src.startsWith("http://") || src.startsWith("https://")) {
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <span className="block my-1">
      <img
        src={src}
        alt={alt || "image"}
        className="w-full h-auto object-contain rounded border border-[#232629]"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <button
        type="button"
        onClick={handleDownload}
        className="text-[9px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors block mt-0.5"
      >
        {src.startsWith("data:") ? "Download image" : "Open image"}
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// AssistantGeneratedImage — renders a structured image from a provider response
// ---------------------------------------------------------------------------

function AssistantGeneratedImage({ image }: { image: ChatGeneratedImage }) {
  const src = image.dataUrl ?? image.url ?? "";
  if (!isSafeImageSrc(src)) return null;

  function handleAction() {
    if (src.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = src;
      const ext = src.slice(5).split(";")[0]?.split("/")[1] ?? "png";
      a.download = image.filename ?? `image.${ext}`;
      a.click();
    } else if (src.startsWith("http://") || src.startsWith("https://")) {
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }

  const isDataUrl = src.startsWith("data:");

  return (
    <div className="mt-1">
      <img
        src={src}
        alt={image.alt ?? "generated image"}
        className="w-full h-auto object-contain rounded border border-[#232629]"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      {image.filename && (
        <div className="text-[9px] text-[#4b5158] font-mono mt-0.5">{image.filename}</div>
      )}
      <button
        type="button"
        onClick={handleAction}
        className="text-[9px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors block mt-0.5"
      >
        {isDataUrl ? "Download image" : "Open image"}
      </button>
    </div>
  );
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
      // Markdown image: ![alt](url)
      if (raw[j] === "!" && raw[j + 1] === "[") {
        const closeB = raw.indexOf("](", j + 1);
        if (closeB !== -1) {
          const closeP = raw.indexOf(")", closeB + 2);
          if (closeP !== -1) {
            const alt = raw.slice(j + 2, closeB);
            const src = raw.slice(closeB + 2, closeP);
            if (isSafeImageSrc(src)) {
              parts.push(
                <AssistantImage key={`${baseKey}-img-${j}`} src={src} alt={alt} />
              );
              j = closeP + 1;
              continue;
            }
          }
        }
      }

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

const PROVIDER_DISPLAY: Record<LLMProvider, string> = {
  ollama: "Ollama",
  openrouter: "OpenRouter",
  "openai-compatible": "OpenAI-compatible",
};

export default function SidebarLLMChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [effectiveProvider, setEffectiveProvider] = useState<LLMProvider | null>(null);
  const [useSeparateProvider, setUseSeparateProvider] = useState(false);

  // System prompt state
  const [systemPrompts, setSystemPrompts] = useState<ChatSystemPrompt[]>([]);
  const [selectedSystemPromptId, setSelectedSystemPromptId] = useState<string>("none");
  const [promptsError, setPromptsError] = useState<string | null>(null);

  // Text file attachment state
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [attachedFileError, setAttachedFileError] = useState<string | null>(null);
  const [attachedFileWarning, setAttachedFileWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image attachment state
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [attachedImageError, setAttachedImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Mode state
  const [mode, setMode] = useState<"chat" | "image">("chat");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageSize, setImageSize] = useState<ChatImageSize>("square");

  // Image generation model state — separate from the text chat model
  const [imageModels, setImageModels] = useState<ImageModelInfo[]>([]);
  const [selectedImageModel, setSelectedImageModel] = useState("");
  const [imageModelsError, setImageModelsError] = useState<string | null>(null);
  const [imageModelsLoading, setImageModelsLoading] = useState(false);
  const [imageModelsLoaded, setImageModelsLoaded] = useState(false);
  const [numImages, setNumImages] = useState(1);

  // Reference images for Generate Image mode (separate from chat attachments)
  const [imageGenAttachments, setImageGenAttachments] = useState<AttachedImage[]>([]);
  const [imageGenAttachError, setImageGenAttachError] = useState<string | null>(null);
  const imageGenAttachInputRef = useRef<HTMLInputElement>(null);

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
        setEffectiveProvider(modelsRes.effectiveProvider);
        setUseSeparateProvider(modelsRes.useSeparate);
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

  // Load image generation models when the Image tab is opened (OpenRouter only)
  useEffect(() => {
    if (mode !== "image" || effectiveProvider !== "openrouter") return;
    if (imageModelsLoaded) return;

    let cancelled = false;
    setImageModelsLoading(true);
    setImageModelsError(null);

    (async () => {
      try {
        const res = await listImageModels();
        if (cancelled) return;
        if (res.ok) {
          setImageModels(res.models);
          if (res.models.length > 0) {
            setSelectedImageModel((prev) =>
              prev && res.models.some((m) => m.id === prev) ? prev : res.models[0].id
            );
          }
        } else {
          setImageModelsError(res.error);
        }
        setImageModelsLoaded(true);
      } catch {
        if (!cancelled) {
          setImageModelsError("Failed to load image models.");
          setImageModelsLoaded(true);
        }
      } finally {
        // Always clear loading — even when cancelled — so the UI can never
        // stay stuck on "Loading image models..."
        setImageModelsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // imageModelsLoading is intentionally NOT a dependency: this effect sets it,
    // and including it re-triggers the cleanup which cancels the in-flight load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, effectiveProvider, imageModelsLoaded]);

  const selectedImageModelInfo =
    imageModels.find((m) => m.id === selectedImageModel) ?? null;
  const imageMaxImages = selectedImageModelInfo?.maxImages;
  const referencesUnsupported = selectedImageModelInfo?.supportsReferences === false;

  // Clamp numImages when switching to a model with a lower limit
  useEffect(() => {
    const limit = imageMaxImages && imageMaxImages > 1 ? imageMaxImages : 1;
    setNumImages((prev) => Math.min(prev, limit));
  }, [imageMaxImages]);

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

  // Text file selection handler
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    setAttachedFileError(null);
    setAttachedFileWarning(null);
    setAttachedFile(null);

    if (!file) return;

    if (isBlockedFile(file.name)) {
      setAttachedFileError("This file type is not allowed for chat attachments.");
      return;
    }

    if (!isAllowedFile(file.name)) {
      setAttachedFileError("This file type is not allowed for chat attachments.");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setAttachedFileError("File is too large. Maximum size is 1 MB.");
      return;
    }

    if (file.size > WARN_FILE_BYTES) {
      setAttachedFileWarning("This file is large and may exceed the model context window.");
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") {
        setAttachedFileError("Could not read file.");
        return;
      }
      setAttachedFile({ name: file.name, sizeBytes: file.size, content: text });
    };
    reader.onerror = () => {
      setAttachedFileError("Could not read file.");
    };
    reader.readAsText(file);
  }, []);

  // Image selection handler
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    setAttachedImageError(null);
    setAttachedImage(null);

    if (!file) return;

    const ext = fileExt(file.name);
    if (ext === ".svg") {
      setAttachedImageError("SVG files are not supported for security reasons.");
      return;
    }
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      setAttachedImageError("Unsupported image format. Use PNG, JPG, JPEG, WebP, or GIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachedImageError("Image is too large. Maximum size is 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl !== "string") {
        setAttachedImageError("Could not read image.");
        return;
      }
      setAttachedImage({ name: file.name, sizeBytes: file.size, dataUrl, mimeType: file.type });
    };
    reader.onerror = () => {
      setAttachedImageError("Could not read image.");
    };
    reader.readAsDataURL(file);
  }, []);

  const clearAttachment = useCallback(() => {
    setAttachedFile(null);
    setAttachedFileError(null);
    setAttachedFileWarning(null);
  }, []);

  const clearImage = useCallback(() => {
    setAttachedImage(null);
    setAttachedImageError(null);
  }, []);

  const selectedSystemPrompt = selectedSystemPromptId !== "none"
    ? systemPrompts.find((p) => p.id === selectedSystemPromptId) ?? null
    : null;

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    const hasText = !!trimmed;
    const hasFile = !!attachedFile;
    const hasImage = !!attachedImage;

    if ((!hasText && !hasFile && !hasImage) || isLoading || !selectedModel) return;

    setError(null);
    setIsLoading(true);

    // Text content (includes file body if attached)
    const sentContent = hasFile
      ? buildSentContent(attachedFile.name, attachedFile.sizeBytes, attachedFile.content, trimmed)
      : trimmed;

    const attachmentLabel = hasFile
      ? `${attachedFile.name} · ${fmtBytes(attachedFile.sizeBytes)}`
      : undefined;

    const imageLabel = hasImage
      ? `${attachedImage.name} · ${fmtBytes(attachedImage.sizeBytes)}`
      : undefined;

    const userMsg: LocalMessage = {
      id: nextId(),
      role: "user",
      content: trimmed,
      sentContent,
      attachmentLabel,
      imageLabel,
      imageThumbnailDataUrl: hasImage ? attachedImage.dataUrl : undefined,
    };

    // Build API messages from committed history (text only for history)
    const apiMessages: ChatMessage[] = [];
    if (selectedSystemPrompt) {
      apiMessages.push({ role: "system", content: selectedSystemPrompt.prompt });
    }
    for (const m of messages) {
      apiMessages.push({ role: m.role as "user" | "assistant", content: m.sentContent ?? m.content });
    }

    // Build current user message in provider-specific format
    if (hasImage) {
      // Fallback prompt when no text or file was provided alongside the image
      const textPart = sentContent || "Please analyze the attached image.";
      if (effectiveProvider === "ollama") {
        // Ollama vision: string content + images array (raw base64, no data URI prefix)
        const base64 = attachedImage.dataUrl.replace(/^data:[^;]+;base64,/, "");
        apiMessages.push({ role: "user", content: textPart, images: [base64] });
      } else {
        // OpenRouter / OpenAI-compatible: multipart content array
        const contentParts: ChatMessageContentPart[] = [];
        if (textPart) contentParts.push({ type: "text", text: textPart });
        contentParts.push({ type: "image_url", image_url: { url: attachedImage.dataUrl } });
        apiMessages.push({ role: "user", content: contentParts });
      }
    } else {
      apiMessages.push({ role: "user", content: sentContent });
    }

    const res = await sendChatMessage({
      model: selectedModel,
      messages: apiMessages,
      systemPromptId: selectedSystemPrompt ? selectedSystemPrompt.id : undefined,
    });

    if (res.ok) {
      const validImages = (res.images ?? []).filter((img) =>
        isSafeImageSrc(img.dataUrl ?? img.url ?? "")
      );
      const assistantMsg: LocalMessage = {
        id: nextId(),
        role: "assistant",
        content: res.content,
        images: validImages.length > 0 ? validImages : undefined,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setAttachedFile(null);
      setAttachedFileError(null);
      setAttachedFileWarning(null);
      setAttachedImage(null);
      setAttachedImageError(null);
    } else {
      // Preserve input, file and image so the user can retry
      setError(res.error);
    }

    setIsLoading(false);
  }, [input, attachedFile, attachedImage, isLoading, selectedModel, selectedSystemPrompt, messages, effectiveProvider]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleImageGenAttachSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setImageGenAttachError(null);
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      const remaining = 4 - imageGenAttachments.length;
      if (remaining <= 0) {
        setImageGenAttachError("Maximum 4 reference images.");
        e.target.value = "";
        return;
      }
      const toProcess = files.slice(0, remaining);
      if (files.length > remaining) {
        setImageGenAttachError(`Only ${remaining} more image(s) can be added (max 4). First ${remaining} selected.`);
      }

      toProcess.forEach((file) => {
        const ext = fileExt(file.name);
        if (!ALLOWED_IMAGE_EXTS.has(ext)) {
          setImageGenAttachError(`"${file.name}" — unsupported type. Use PNG, JPG, WebP, or GIF.`);
          return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setImageGenAttachError(`"${file.name}" exceeds 5 MB limit.`);
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (!dataUrl || !isSafeImageSrc(dataUrl)) {
            setImageGenAttachError(`"${file.name}" — invalid image data.`);
            return;
          }
          const mime = file.type.toLowerCase() || `image/${ext.slice(1)}`;
          setImageGenAttachments((prev) => {
            if (prev.length >= 4) return prev;
            return [...prev, { name: file.name, sizeBytes: file.size, dataUrl, mimeType: mime }];
          });
        };
        reader.readAsDataURL(file);
      });
      e.target.value = "";
    },
    [imageGenAttachments]
  );

  // OpenRouter image mode uses the dedicated image model; other providers
  // keep the existing behavior (chat model, no discovery available)
  const effectiveImageModel =
    effectiveProvider === "openrouter" ? selectedImageModel : selectedModel;

  const handleGenerateImage = useCallback(async () => {
    const prompt = imagePrompt.trim();
    if (!prompt || isLoading) return;

    if (!effectiveImageModel) {
      setError(
        effectiveProvider === "openrouter"
          ? "Select an image generation model."
          : "No model selected."
      );
      return;
    }

    setError(null);
    setIsLoading(true);

    // Skip reference images when the selected model explicitly does not support them
    const refImages: ChatImageReference[] = referencesUnsupported
      ? []
      : imageGenAttachments.map((a) => ({
          dataUrl: a.dataUrl,
          mimeType: a.mimeType,
          name: a.name,
          sizeBytes: a.sizeBytes,
        }));

    const attachLabel =
      imageGenAttachments.length > 0
        ? `${imageGenAttachments.length} reference image${imageGenAttachments.length > 1 ? "s" : ""}`
        : undefined;

    const userMsg: LocalMessage = {
      id: nextId(),
      role: "user",
      content: prompt,
      sentContent: prompt,
      attachmentLabel: attachLabel,
    };

    const res = await generateChatImages({
      model: effectiveImageModel,
      prompt,
      size: imageSize,
      referenceImages: refImages.length > 0 ? refImages : undefined,
      n: numImages > 1 ? numImages : undefined,
    });

    if (res.ok) {
      const validImages = res.images.filter((img) =>
        isSafeImageSrc(img.dataUrl ?? img.url ?? "")
      );
      const assistantMsg: LocalMessage = {
        id: nextId(),
        role: "assistant",
        content: res.text,
        images: validImages.length > 0 ? validImages : undefined,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setImagePrompt("");
      setImageGenAttachments([]);
      setImageGenAttachError(null);
    } else {
      setError(res.error);
    }

    setIsLoading(false);
  }, [imageGenAttachments, imagePrompt, imageSize, isLoading, effectiveImageModel, effectiveProvider, referencesUnsupported, numImages]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
    setInput("");
    setImagePrompt("");
    setAttachedFile(null);
    setAttachedFileError(null);
    setAttachedFileWarning(null);
    setAttachedImage(null);
    setAttachedImageError(null);
    setImageGenAttachments([]);
    setImageGenAttachError(null);
  }, []);

  const canSend = !isLoading && !!selectedModel && (!!input.trim() || !!attachedFile || !!attachedImage);

  // When assistant images are visible, let the component grow to full height instead
  // of locking content inside the fixed-height scrollable message list.
  const hasVisibleAssistantImages = messages.some(
    (msg) => msg.role === "assistant" && msg.images && msg.images.length > 0
  );

  return (
    <div className="border-t border-[#232629] px-4 pt-4 mt-4">
      {!isOpen ? (
        // ── Closed state ──────────────────────────────────────────────
        <button
          onClick={() => setIsOpen(true)}
          className="w-full text-left px-3 py-2 rounded hover:bg-[#1a1d20] transition-colors"
        >
          <div className="text-[11px] font-medium text-[#a4abb2]">Chat</div>
          <div className="text-[10px] text-[#6e767d]">
            {effectiveProvider
              ? `via ${PROVIDER_DISPLAY[effectiveProvider] ?? effectiveProvider}`
              : "Ask the LLM"}
          </div>
        </button>
      ) : (
        // ── Open state ────────────────────────────────────────────────
        <div
          className="flex flex-col"
          style={hasVisibleAssistantImages ? { minHeight: chatHeight } : { height: chatHeight }}
        >
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
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#e0e4e8]">LLM Chat</span>
              {effectiveProvider && (
                <span className="text-[9px] text-[#4b5158] border border-[#232629] rounded px-1 py-0.5">
                  {useSeparateProvider ? "Chat: " : ""}
                  {PROVIDER_DISPLAY[effectiveProvider] ?? effectiveProvider}
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[#4b5158] hover:text-[#a4abb2] text-sm leading-none"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex mb-1 border border-[#232629] rounded overflow-hidden">
            {(["chat", "image"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-0.5 text-[9px] tracking-wider transition-colors ${
                  mode === m
                    ? "bg-[#232629] text-[#e0e4e8]"
                    : "text-[#4b5158] hover:text-[#6e767d]"
                }`}
              >
                {m === "chat" ? "Chat" : "Generate Image"}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-[#4b5158] mb-2 leading-snug">
            {mode === "chat"
              ? "Ask questions, attach files, or analyze images."
              : "Generate images with the selected chat provider."}
          </p>

          {/* Model selector — text chat model, or image-mode fallback for non-OpenRouter */}
          {(mode === "chat" || effectiveProvider !== "openrouter") && (
            modelError ? (
              <div className="text-[10px] text-[#e0556a] mb-1.5">{modelError}</div>
            ) : (
              <div className="flex flex-col gap-0.5 mb-1.5">
                <label className="text-[9px] text-[#4b5158] uppercase tracking-wider">
                  Model
                </label>
                <ModelPickerWithFilter
                  models={models}
                  value={selectedModel}
                  onChange={setSelectedModel}
                  compact
                />
              </div>
            )
          )}

          {/* Image Model selector — image mode, OpenRouter only (discovery-driven) */}
          {mode === "image" && effectiveProvider === "openrouter" && (
            <div className="flex flex-col gap-0.5 mb-1.5">
              <label className="text-[9px] text-[#4b5158] uppercase tracking-wider">
                Image Model
              </label>
              {imageModelsLoading ? (
                <p className="text-[10px] text-[#4b5158] italic">Loading image models...</p>
              ) : imageModelsError ? (
                <p className="text-[10px] text-[#e0556a]">{imageModelsError}</p>
              ) : imageModels.length === 0 && imageModelsLoaded ? (
                <p className="text-[10px] text-[#e0556a]">No image generation models found.</p>
              ) : (
                <ModelPickerWithFilter
                  models={imageModels.map((m) => m.id)}
                  value={selectedImageModel}
                  onChange={setSelectedImageModel}
                  compact
                />
              )}
            </div>
          )}

          {/* Image mode hint — non-OpenRouter providers have no discovery */}
          {mode === "image" && effectiveProvider === "openai-compatible" && (
            <p className="text-[9px] text-[#4b5158] mb-1.5">
              Image model discovery requires OpenRouter. Select a model that supports image generation at this provider.
            </p>
          )}

          {/* System Prompt selector — chat mode only */}
          {mode === "chat" && (
            <>
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
            </>
          )}

          {/* Settings / messages separator */}
          <div className="border-b border-[#1a1d20] mb-2" />

          {/* Messages */}
          <div className={hasVisibleAssistantImages ? "mb-2 space-y-1.5 min-h-[40px]" : "flex-1 overflow-y-auto mb-2 space-y-1.5 min-h-[40px]"}>
            {messages.length === 0 && !error && (
              <div className="text-[10px] text-[#4b5158] italic">
                {mode === "chat"
                  ? "Start a conversation or attach a file to analyze."
                  : "Describe the image you want to generate."}
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`px-2 py-1 rounded text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1a1d20] text-[#a4abb2]"
                    : "bg-transparent text-[#a4abb2] border-l-2 border-[#2a2d31] ml-0.5"
                }`}
              >
                {msg.role === "user" ? (
                  <div>
                    {msg.content && (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                    {msg.attachmentLabel && (
                      <div className={msg.content ? "mt-1" : ""}>
                        <span className="inline-block px-1.5 py-0.5 bg-[#0d0e10] border border-[#232629] rounded text-[9px] font-mono text-[#6b9e72]">
                          {msg.attachmentLabel}
                        </span>
                      </div>
                    )}
                    {msg.imageThumbnailDataUrl && (
                      <div className={msg.content || msg.attachmentLabel ? "mt-1" : ""}>
                        <img
                          src={msg.imageThumbnailDataUrl}
                          alt={msg.imageLabel ?? "attached image"}
                          className="max-w-[120px] max-h-[80px] object-contain rounded border border-[#232629]"
                        />
                        {msg.imageLabel && (
                          <div className="mt-0.5">
                            <span className="inline-block px-1.5 py-0.5 bg-[#0d0e10] border border-[#232629] rounded text-[9px] font-mono text-[#7d8cf0]">
                              {msg.imageLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {renderMarkdown(msg.content)}
                    {msg.images && msg.images.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {msg.images.map((img, idx) => (
                          <AssistantGeneratedImage key={idx} image={img} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="px-2 py-1 text-[10px] text-[#6e767d] italic animate-pulse">
                {mode === "chat" ? "Thinking..." : "Generating image..."}
              </div>
            )}
            {error && (
              <div className="px-2 py-1 rounded bg-[#2d1518] border border-[#5a1a1a] text-[10px] text-[#e0556a]">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Mode-specific input area ───────────────────────────── */}
          {mode === "chat" ? (
            <>
              {/* Text file attachment badge */}
              {attachedFile && (
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[9px] text-[#6b9e72] font-mono truncate flex-1">
                    {attachedFile.name} · {fmtBytes(attachedFile.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="text-[9px] text-[#4b5158] hover:text-[#cf7b6b] transition-colors shrink-0"
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* Text file attachment warning */}
              {attachedFileWarning && (
                <div className="text-[9px] text-[#cda24f] mb-1 px-1">{attachedFileWarning}</div>
              )}

              {/* Text file attachment error */}
              {attachedFileError && (
                <div className="text-[9px] text-[#e0556a] mb-1 px-1">{attachedFileError}</div>
              )}

              {/* Image attachment badge */}
              {attachedImage && (
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <img
                    src={attachedImage.dataUrl}
                    alt={attachedImage.name}
                    className="w-8 h-8 object-cover rounded border border-[#232629] shrink-0"
                  />
                  <span className="text-[9px] text-[#7d8cf0] font-mono truncate flex-1">
                    {attachedImage.name} · {fmtBytes(attachedImage.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={clearImage}
                    className="text-[9px] text-[#4b5158] hover:text-[#cf7b6b] transition-colors shrink-0"
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* Vision model note */}
              {attachedImage && (
                <div className="text-[9px] text-[#4b5158] mb-1 px-1">
                  Vision support varies by model.
                </div>
              )}

              {/* Image attachment error */}
              {attachedImageError && (
                <div className="text-[9px] text-[#e0556a] mb-1 px-1">{attachedImageError}</div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.sh,.yaml,.yml,.toml,.xml"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={imageInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif"
                onChange={handleImageSelect}
                className="hidden"
              />

              {/* Chat input */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading || !selectedModel}
                placeholder={
                  attachedFile || attachedImage
                    ? "Add a message or send attachment alone..."
                    : "Ask anything..."
                }
                rows={2}
                className="w-full bg-[#0d0e10] border border-[#232629] rounded px-2 py-1 text-[11px] text-[#a4abb2] placeholder-[#4b5158] resize-none focus:outline-none focus:border-[#3a4046] disabled:opacity-50"
              />

              {/* Chat buttons */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="px-3 py-1 rounded bg-[#1a1d20] border border-[#3a4046] text-[10px] text-[#c0c8d0] hover:bg-[#252830] hover:text-[#e0e4e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedFileError(null);
                    fileInputRef.current?.click();
                  }}
                  disabled={isLoading || !selectedModel}
                  className="px-3 py-1 rounded bg-[#1a1d20] border border-[#232629] text-[10px] text-[#6e767d] hover:bg-[#252830] hover:text-[#a4abb2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Attach text file"
                >
                  Attach file
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedImageError(null);
                    imageInputRef.current?.click();
                  }}
                  disabled={isLoading || !selectedModel}
                  className="px-3 py-1 rounded bg-[#1a1d20] border border-[#232629] text-[10px] text-[#6e767d] hover:bg-[#252830] hover:text-[#a4abb2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Attach image"
                >
                  Attach image
                </button>
                <button
                  onClick={handleClear}
                  disabled={isLoading}
                  className="ml-auto px-3 py-1 rounded text-[10px] text-[#4b5158] hover:text-[#6e767d] transition-colors"
                >
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Image generation prompt */}
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                disabled={isLoading || !selectedModel}
                placeholder="Describe the image you want to generate..."
                rows={3}
                className="w-full bg-[#0d0e10] border border-[#232629] rounded px-2 py-1 text-[11px] text-[#a4abb2] placeholder-[#4b5158] resize-none focus:outline-none focus:border-[#3a4046] disabled:opacity-50"
              />

              {/* Size selector */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-[#4b5158] uppercase tracking-wider shrink-0">Size</span>
                <div className="flex gap-1">
                  {(["square", "landscape", "portrait"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setImageSize(s)}
                      disabled={isLoading}
                      className={`px-2 py-0.5 rounded text-[9px] capitalize transition-colors ${
                        imageSize === s
                          ? "bg-[#3a4046] text-[#e0e4e8] border border-[#4b5158]"
                          : "bg-[#1a1d20] text-[#6e767d] hover:text-[#a4abb2] border border-[#232629]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of Images — only when the selected model supports more than one */}
              {effectiveProvider === "openrouter" &&
                imageMaxImages !== undefined &&
                imageMaxImages > 1 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] text-[#4b5158] uppercase tracking-wider shrink-0">
                      Number of Images
                    </span>
                    <select
                      value={numImages}
                      onChange={(e) => setNumImages(parseInt(e.target.value, 10) || 1)}
                      disabled={isLoading}
                      className="bg-[#0d0e10] border border-[#232629] rounded px-1.5 py-0.5 text-[10px] text-[#a4abb2] focus:outline-none focus:border-[#3a4046]"
                    >
                      {Array.from(
                        { length: Math.min(imageMaxImages, 8) },
                        (_, i) => i + 1
                      ).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}

              {/* Reference images */}
              {imageGenAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {imageGenAttachments.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="w-10 h-10 object-cover rounded border border-[#232629]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setImageGenAttachments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-[#1a1d20] border border-[#3a4046] text-[8px] text-[#cf7b6b] hover:text-[#e0556a] opacity-0 group-hover:opacity-100 transition-opacity"
                        title={`Remove ${img.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {imageGenAttachError && (
                <div className="text-[9px] text-[#e0556a] mt-1 px-1">{imageGenAttachError}</div>
              )}

              {referencesUnsupported && (
                <p className="text-[9px] text-[#cda24f] mt-1">
                  This model does not support reference images.
                </p>
              )}

              <p className="text-[9px] text-[#4b5158] mt-1">
                Uses the selected chat provider image endpoint when available.
                {imageGenAttachments.length === 0 && !referencesUnsupported && (
                  <> Optional reference images can be used by compatible image models.</>
                )}
              </p>

              {/* Ollama unsupported warning */}
              {effectiveProvider === "ollama" && (
                <p className="text-[9px] text-[#cda24f] mt-1">
                  Ollama does not support dedicated image generation. Switch to OpenRouter or an OpenAI-compatible provider in Settings.
                </p>
              )}

              {/* Hidden file input for reference images */}
              <input
                ref={imageGenAttachInputRef}
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,.gif"
                onChange={handleImageGenAttachSelect}
                className="hidden"
              />

              {/* Generate buttons */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleGenerateImage}
                  disabled={
                    isLoading ||
                    !effectiveImageModel ||
                    !imagePrompt.trim() ||
                    (effectiveProvider === "openrouter" &&
                      (imageModelsError !== null || imageModels.length === 0))
                  }
                  className="px-3 py-1 rounded bg-[#1a1d20] border border-[#3a4046] text-[10px] text-[#c0c8d0] hover:bg-[#252830] hover:text-[#e0e4e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? "Generating..." : "Generate Image"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageGenAttachError(null);
                    imageGenAttachInputRef.current?.click();
                  }}
                  disabled={isLoading || imageGenAttachments.length >= 4 || referencesUnsupported}
                  className="px-3 py-1 rounded bg-[#1a1d20] border border-[#232629] text-[10px] text-[#6e767d] hover:bg-[#252830] hover:text-[#a4abb2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Add reference image (max 4)"
                >
                  {imageGenAttachments.length > 0
                    ? `Ref images (${imageGenAttachments.length}/4)`
                    : "Add ref image"}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isLoading}
                  className="ml-auto px-3 py-1 rounded text-[10px] text-[#4b5158] hover:text-[#6e767d] transition-colors"
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
