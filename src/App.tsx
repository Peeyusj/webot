import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import SpaceError from "./components/SpaceError";
import CubeLoader from "./components/CubeLoader";
import GeneratingLoader from "./components/GeneratingLoader";
import SettingsPanel from "./components/SettingsPanel";
import {
  type AISettings,
  DEFAULT_SETTINGS,
} from "./components/SettingsPanel/presets";
// ============================================================
// TYPES
// ============================================================

interface SourceCitation {
  id: number;
  title: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  timing?: string;
}

type AppMode = "choose" | "processing" | "ready" | "failed";

export default function App() {
  const [mode, setMode] = useState<AppMode>("choose");
  const [progressText, setProgressText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexingTime, setIndexingTime] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [factIndex, setFactIndex] = useState(0);

  // BYOK settings (provider + API key + optional model)
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const hasKey = settings.apiKey.trim().length > 0;

  // Typewriter starter-question hint shown inside the input box
  const [suggestion, setSuggestion] = useState("");
  const [typedSuggestion, setTypedSuggestion] = useState("");
  const [suggestionActive, setSuggestionActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const FUN_FACTS = [
    "The first computer bug was an actual moth found in a relay in 1947.",
    "A single Google query uses enough electricity to power a 60W bulb for 17 seconds.",
    "The first domain name ever registered was Symbolics.com in 1985.",
    "There are over 700 programming languages, but only about 10 are widely used.",
    "The original name for Windows was 'Interface Manager'.",
    "Over 90% of the world's currency only exists on computers.",
    "The first webcam was created to check the status of a coffee pot at Cambridge University.",
    "JavaScript was written in just 10 days by Brendan Eich in 1995.",
    "The Apollo 11 guidance computer had less processing power than a standard USB-C charger.",
    "The first 1GB hard drive was announced in 1980, weighed over 500 pounds, and cost $40,000.",
    "The world's first website is still live today at info.cern.ch.",
    "The term 'robot' comes from the Czech word 'robota', meaning forced labor.",
    "The first computer mouse was invented in 1964 and was made out of wood.",
    "NASA's Mars helicopter 'Ingenuity' runs on a custom Linux operating system.",
    "A 'jiffy' is an actual unit of time in computer operating systems, usually 1/100th of a second.",
    "The total weight of all the electrons storing the entire internet is about 50 grams.",
    "The first virus, 'Creeper' (1971), was harmless. It just printed: 'I'm the creeper, catch me if you can!'",
    "Email is actually older than the World Wide Web, first sent in 1971 by Ray Tomlinson.",
    "The Firefox logo is not actually a fox — it's a red panda.",
    "For 8 years, the password for the U.S. nuclear missile control computers was '00000000'.",
  ];

  // ============================================================
  // AUTO SCROLL
  // ============================================================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ============================================================
  // LOAD BYOK SETTINGS FROM EXTENSION STORAGE
  // ============================================================
  useEffect(() => {
    chrome.storage?.local.get("webchat_settings", (res) => {
      if (res && res.webchat_settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...res.webchat_settings });
      }
    });
  }, []);

  const handleSaveSettings = (next: AISettings) => {
    setSettings(next);
    chrome.storage?.local.set({ webchat_settings: next });
    setShowSettings(false);
    setError(null);
  };

  const handleRemoveSettings = () => {
    const cleared = { ...DEFAULT_SETTINGS };
    setSettings(cleared);
    chrome.storage?.local.remove("webchat_settings");
    setShowSettings(false);
  };

  // ============================================================
  // STARTER QUESTION
  // ============================================================
  useEffect(() => {
    if (mode !== "ready") {
      setSuggestion("");
      setTypedSuggestion("");
      setSuggestionActive(false);
      return;
    }
    chrome.runtime.sendMessage({ action: "GET_SUGGESTION" }, (res) => {
      if (chrome.runtime.lastError) return;
      const q = (res && res.question ? String(res.question) : "").trim();
      if (q) {
        setSuggestion(q);
        setTypedSuggestion("");
        setSuggestionActive(true);
      }
    });
  }, [mode]);

  useEffect(() => {
    if (!suggestionActive || !suggestion) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTypedSuggestion(suggestion.slice(0, i));
      if (i >= suggestion.length) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [suggestion, suggestionActive]);

  const dismissSuggestionAnimation = () => setSuggestionActive(false);
  const clearSuggestion = () => {
    setSuggestion("");
    setTypedSuggestion("");
    setSuggestionActive(false);
  };

  // ============================================================
  // ROTATE FUN FACTS WHILE PROCESSING
  // ============================================================
  useEffect(() => {
    if (mode === "processing") {
      const interval = setInterval(() => {
        setFactIndex((prev) => (prev + 1) % FUN_FACTS.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [mode]);

  // ============================================================
  // SESSION RESUME ON MOUNT
  // ============================================================
  useEffect(() => {
    chrome.runtime.sendMessage({ action: "GET_TAB_STATE" }, (response) => {
      if (response && response.state && response.state.mode === "ready") {
        setMode("ready");
        setIndexingTime(response.state.indexingTime ?? "Ready");
        setMessages([
          {
            role: "assistant",
            content:
              "Welcome back! The content is still indexed. What would you like to know?",
          },
        ]);
      }
    });
  }, []);

  // ============================================================
  // BACKGROUND MESSAGE LISTENER
  // ============================================================
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageListener = (request: any) => {
      if (
        request.action === "INGESTION_PROGRESS" ||
        request.action === "SITE_INGESTION_PROGRESS"
      ) {
        setProgressText(request.message);

        if (request.status === "ready") {
          setMode("ready");
          if (request.elapsed)
            setIndexingTime(`Indexed in ${request.elapsed}s`);

          if (messages.length === 0) {
            const botMessage =
              request.action === "SITE_INGESTION_PROGRESS"
                ? `I've mapped this site section. What would you like to know?`
                : "I've indexed this page. What would you like to know?";
            setMessages([{ role: "assistant", content: botMessage }]);
          }
        }

        if (request.status === "failed") {
          setMode("failed");
          setError(request.message);
        }
      }

      if (request.action === "CACHE_CLEARED") {
        setIsClearing(false);
        setMode("choose");
        setMessages([]);
        setIndexingTime(null);
        setError(null);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [messages.length]);

  // ============================================================
  // HANDLERS
  // ============================================================
  const handleChooseSinglePage = () => {
    setMode("processing");
    setProgressText("Reading page...");
    setError(null);
    chrome.runtime.sendMessage({ action: "INGEST_SINGLE_PAGE" });
  };

  const handleChooseFullSite = () => {
    setMode("processing");
    setProgressText("Connecting to knowledge base...");
    setError(null);
    chrome.runtime.sendMessage({ action: "INGEST_FULL_SITE" });
  };

  const handleClearCache = () => {
    setIsClearing(true);
    chrome.runtime.sendMessage({ action: "CLEAR_CACHE" });
  };

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || mode !== "ready" || isGenerating) return;

    setError(null);
    setIsGenerating(true);
    clearSuggestion();

    const userQuery = inputText.trim();
    setInputText("");

    const historyToSend = messages.slice(-6);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userQuery },
      { role: "assistant", content: "", sources: [] },
    ]);

    const port = chrome.runtime.connect({ name: "webchat-stream-port" });
    port.postMessage({ question: userQuery, history: historyToSend });

    port.onMessage.addListener((response) => {
      if (response.type === "sources") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant")
            last.sources = response.sources;
          return updated;
        });
      }

      if (response.type === "token") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") last.content += response.token;
          return updated;
        });
      }

      if (response.type === "done" || response.type === "DONE") {
        setIsGenerating(false);
        port.disconnect();
      }

      if (response.type === "ERROR") {
        setError(response.error);
        setIsGenerating(false);
        port.disconnect();
      }
    });
  };

  // ============================================================
  // ICONS
  // ============================================================
  const Icons = {
    Document: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    Globe: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    Trash: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
    Send: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    Chat: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    Settings: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      <style>{`
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .fade-in { animation: fadeIn 0.2s ease-out; }
        .slide-up { animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .prose pre { font-size: 11px !important; line-height: 1.5 !important; }
        .prose p { margin: 0.35em 0 !important; }
        .prose ul, .prose ol { margin: 0.35em 0 !important; padding-left: 1.2em !important; }
        .prose li { margin: 0.15em 0 !important; }
        .prose h1, .prose h2, .prose h3 { margin: 0.5em 0 0.25em 0 !important; }
        .prose code { font-size: 11px !important; }
      `}</style>

      <div className="relative flex flex-col h-screen font-sans bg-slate-50 text-slate-900 select-none">
        {/* ── HEADER ── */}
        <header className="px-4 py-3 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0">
              <img
                src={chrome.runtime.getURL("primaryChat.svg")}
                alt="Chat Logo"
                className="w-7.5 h-7.5 object-contain"
              />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 leading-none tracking-tight">
                BatChat
              </h1>
              <p className="text-[10px] mt-1.5 leading-none font-bold tracking-widest uppercase">
                {mode === "processing" && (
                  <span className="text-blue-500">Indexing</span>
                )}
                {mode === "ready" && (
                  <span className="text-emerald-500">
                    {indexingTime ?? "Active"}
                  </span>
                )}
                {mode === "choose" && (
                  <span className="text-slate-400">Standby</span>
                )}
                {mode === "failed" && (
                  <span className="text-red-500">Error</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                hasKey
                  ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                  : "text-blue-600 bg-blue-50 hover:bg-blue-100"
              }`}
            >
              {Icons.Settings}
              {!hasKey && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" />
              )}
            </button>
            {(mode === "ready" || mode === "failed") && (
              <button
                onClick={handleClearCache}
                disabled={isClearing}
                title="Clear memory"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                {Icons.Trash}
              </button>
            )}
            {mode === "ready" && (
              <button
                onClick={() => {
                  setMode("choose");
                  setMessages([]);
                  setIndexingTime(null);
                }}
                className="h-8 px-3 ml-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-all"
              >
                Back
              </button>
            )}
          </div>
        </header>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {/* CHOOSE */}
          {mode === "choose" && (
            <div className="flex flex-col justify-center h-full px-5 gap-5 fade-in">
              {!hasKey && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="group flex items-start gap-3.5 p-4 rounded-xl border border-blue-200 bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-600 mt-0.5 group-hover:bg-blue-100 transition-colors">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-slate-800 leading-tight group-hover:text-blue-700 transition-colors">
                      Add your AI API key
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Connect Groq, OpenAI, or OpenRouter to start chatting. Tap
                      to configure.
                    </p>
                  </div>
                </button>
              )}

              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-1">
                  Select scope
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleChooseSinglePage}
                    className="group flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 shadow-sm transition-all mt-0.5">
                      {Icons.Document}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors leading-tight">
                        This page
                      </p>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        Chat with just the current document. Works on
                        authenticated and private pages.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={handleChooseFullSite}
                    className="group flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 shadow-sm transition-all mt-0.5">
                      {Icons.Globe}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-700 transition-colors leading-tight">
                        Entire site section
                      </p>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        Index all pages under this URL path. Best for robust
                        documentation sites.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PROCESSING */}
          {mode === "processing" && (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 fade-in">
              <CubeLoader />
              <p className="text-sm text-slate-700 font-semibold text-center max-w-[220px] leading-relaxed mt-8 mb-6">
                {progressText}
              </p>
              <div className="w-full max-w-[270px] bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  Did you know
                </p>
                <p className="text-xs text-slate-600 leading-relaxed italic transition-opacity duration-500 font-medium">
                  "{FUN_FACTS[factIndex]}"
                </p>
              </div>
            </div>
          )}

          {/* FAILED */}
          {mode === "failed" && (
            <SpaceError
              message={
                error ??
                "We couldn't connect to the server or process the page. Check your network and try again."
              }
              onRetry={() => {
                setMode("choose");
                setError(null);
              }}
            />
          )}

          {/* CHAT */}
          {mode === "ready" && (
            <div className="p-4 flex flex-col gap-5 pb-4">
              {messages.map((msg, index) => {
                if (
                  msg.role === "assistant" &&
                  msg.content === "" &&
                  isGenerating &&
                  index === messages.length - 1
                ) {
                  return null;
                }

                return (
                  <div
                    key={index}
                    className={`flex flex-col gap-2 slide-up ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] px-4 py-3 text-[13px] leading-relaxed rounded-2xl shadow-sm ${
                        msg.role === "user"
                          ? "bg-slate-800 text-white rounded-tr-sm"
                          : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
                      }`}
                      style={{
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-headings:text-slate-900 prose-strong:text-slate-900 prose-code:text-slate-800">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <span className="font-medium">{msg.content}</span>
                      )}
                    </div>

                    {msg.role === "assistant" &&
                      msg.sources &&
                      msg.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pl-1 max-w-[88%]">
                          {msg.sources.map((src) => (
                            <span
                              key={src.id}
                              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-white border border-slate-200 shadow-sm rounded-md text-[10px] text-slate-600 font-medium"
                            >
                              <span className="font-bold text-blue-500">
                                [{src.id}]
                              </span>
                              <span className="truncate max-w-[120px]">
                                {src.title}
                              </span>
                              <button
                                onClick={() => handleCopy(src.title, src.id)}
                                className="ml-0.5 text-slate-300 hover:text-blue-500 transition-colors flex items-center"
                                title="Copy"
                              >
                                {copiedId === src.id ? (
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#10b981"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                )}
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                    {msg.role === "assistant" && msg.timing && (
                      <p className="text-[10px] text-slate-400 pl-1.5 font-medium">
                        {msg.timing}
                      </p>
                    )}
                  </div>
                );
              })}

              {isGenerating &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" &&
                messages[messages.length - 1].content === "" && (
                  <div className="flex w-full items-center justify-center py-5 slide-up">
                    <GeneratingLoader />
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── INLINE ERROR (ready mode) ── */}
        {mode === "ready" && error && (
          <div className="px-4 pt-3 shrink-0 fade-in bg-white border-t border-slate-200">
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 shadow-sm">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[12px] font-medium text-red-700 leading-relaxed break-words flex-1">
                {error}
              </p>
              <button
                onClick={() => setShowSettings(true)}
                className="text-[12px] font-bold text-red-600 hover:text-red-800 underline shrink-0"
              >
                Settings
              </button>
            </div>
          </div>
        )}

        {/* ── INPUT ── */}
        {mode === "ready" && (
          <form
            onSubmit={handleSendMessage}
            className="px-4 py-3 border-t border-slate-200 bg-white flex gap-2.5 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] z-10"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={dismissSuggestionAnimation}
              placeholder={
                !inputText && typedSuggestion
                  ? suggestionActive
                    ? `${typedSuggestion}▌`
                    : typedSuggestion
                  : "Ask anything..."
              }
              disabled={isGenerating}
              className="flex-1 bg-white border border-slate-200 shadow-sm rounded-xl px-4 py-3 text-[13px] font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isGenerating}
              className="w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 disabled:shadow-none disabled:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition-all shrink-0"
            >
              {Icons.Send}
            </button>
          </form>
        )}

        {/* ── SETTINGS OVERLAY ── */}
        {showSettings && (
          <SettingsPanel
            initialSettings={settings}
            onSave={handleSaveSettings}
            onRemove={handleRemoveSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </>
  );
}
