import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

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
    "For 8 years, the password for the U.S. nuclear missile control computers was '00000000'."
  ];

  // ============================================================
  // AUTO SCROLL
  // ============================================================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
  // Ask background.js for the state tied to this specific tab
  // ============================================================
  useEffect(() => {
    chrome.runtime.sendMessage({ action: "GET_TAB_STATE" }, (response) => {
      // Explicitly check if we got a valid response and state back
      if (response && response.state && response.state.mode === "ready") {
        setMode("ready");
        setIndexingTime(response.state.indexingTime ?? "Ready");
        setMessages([{
          role: "assistant",
          content: "Welcome back! The content is still indexed. What would you like to know?"
        }]);
      }
    });
  }, []); // Runs once on mount
  // ============================================================
  // BACKGROUND MESSAGE LISTENER
  // ============================================================
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageListener = (request: any) => {
      if (request.action === "INGESTION_PROGRESS" || request.action === "SITE_INGESTION_PROGRESS") {
        setProgressText(request.message);

        if (request.status === "ready") {
          setMode("ready");
          if (request.elapsed) setIndexingTime(`Indexed in ${request.elapsed}s`);

          if (messages.length === 0) {
            const botMessage = request.action === "SITE_INGESTION_PROGRESS"
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

    const userQuery = inputText.trim();
    setInputText("");

    // Capture history before mutations
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
          if (last && last.role === "assistant") last.sources = response.sources;
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    Globe: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    Trash: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    ),
    Send: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    ),
    Chat: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        .fade-in { animation: fadeIn 0.2s ease-out; }
        .slide-up { animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .prose pre { font-size: 11px !important; line-height: 1.5 !important; }
        .prose p { margin: 0.35em 0 !important; }
        .prose ul, .prose ol { margin: 0.35em 0 !important; padding-left: 1.2em !important; }
        .prose li { margin: 0.15em 0 !important; }
        .prose h1, .prose h2, .prose h3 { margin: 0.5em 0 0.25em 0 !important; }
        .prose code { font-size: 11px !important; }
      `}</style>

      <div className="flex flex-col h-screen font-sans bg-white text-slate-900 select-none">

        {/* ── HEADER ── */}
        <header className="px-4 py-3 border-b border-slate-100 bg-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
              {Icons.Chat}
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900 leading-none tracking-tight">WebChat</h1>
              <p className="text-[10px] mt-0.5 leading-none font-medium tracking-wide uppercase">
                {mode === "processing" && <span className="text-blue-500">Indexing</span>}
                {mode === "ready" && <span className="text-emerald-500">{indexingTime ?? "Active"}</span>}
                {mode === "choose" && <span className="text-slate-300">Standby</span>}
                {mode === "failed" && <span className="text-red-400">Error</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {(mode === "ready" || mode === "failed") && (
              <button
                onClick={handleClearCache}
                disabled={isClearing}
                title="Clear memory"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all"
              >
                {Icons.Trash}
              </button>
            )}
            {mode === "ready" && (
              <button
                onClick={() => { setMode("choose"); setMessages([]); setIndexingTime(null); }}
                className="h-7 px-2.5 text-[11px] font-semibold text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              >
                Back
              </button>
            )}
          </div>
        </header>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">

          {/* CHOOSE */}
          {mode === "choose" && (
            <div className="flex flex-col justify-center h-full px-5 gap-4 fade-in">
              <div>
                <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest mb-3">
                  Select scope
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleChooseSinglePage}
                    className="group flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-500 group-hover:bg-blue-100 transition-colors mt-0.5">
                      {Icons.Document}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-700 transition-colors leading-tight">
                        This page
                      </p>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Chat with just the current document. Works on authenticated and private pages.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={handleChooseFullSite}
                    className="group flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-500 group-hover:bg-indigo-100 transition-colors mt-0.5">
                      {Icons.Globe}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors leading-tight">
                        Entire site section
                      </p>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Index all pages under this URL path. Best for documentation sites.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PROCESSING */}
          {mode === "processing" && (
            <div className="flex flex-col items-center justify-center h-full gap-6 px-6 fade-in">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-10 h-10 rounded-full border-2 border-slate-100" />
                <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              </div>

              <p className="text-sm text-slate-500 font-medium text-center max-w-[220px] leading-relaxed">
                {progressText}
              </p>

              <div className="w-full max-w-[270px] bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-300 mb-2">
                  Did you know
                </p>
                <p className="text-xs text-slate-400 leading-relaxed italic transition-opacity duration-500">
                  "{FUN_FACTS[factIndex]}"
                </p>
              </div>
            </div>
          )}

          {/* FAILED */}
          {mode === "failed" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center fade-in">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Indexing failed</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-[220px]">
                  {error ?? "Something went wrong. Please try again."}
                </p>
              </div>
              <button
                onClick={() => { setMode("choose"); setError(null); }}
                className="px-4 py-2 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition-all"
              >
                Try again
              </button>
            </div>
          )}

          {/* CHAT */}
          {mode === "ready" && (
            <div className="p-4 flex flex-col gap-4 pb-2">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col gap-1.5 slide-up ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {/* Message bubble */}
                  <div
                    className={`max-w-[87%] px-3.5 py-2.5 text-[13px] leading-relaxed rounded-2xl ${
                      msg.role === "user"
                        ? "bg-slate-900 text-white rounded-tr-sm"
                        : "bg-slate-50 border border-slate-100 text-slate-700 rounded-tl-sm"
                    }`}
                    style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                  >
                    {msg.content === "" && isGenerating && index === messages.length - 1 ? (
                      <span className="flex gap-1 items-center py-0.5 px-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    ) : msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-white prose-pre:border prose-pre:border-slate-200 prose-headings:text-slate-800 prose-strong:text-slate-800 prose-code:text-slate-700">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>

                  {/* Source badges */}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-0.5 max-w-[87%]">
                      {msg.sources.map((src) => (
                        <span
                          key={src.id}
                          className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-white border border-slate-100 rounded-md text-[10px] text-slate-500 shadow-sm"
                        >
                          <span className="font-bold text-blue-400">[{src.id}]</span>
                          <span className="truncate max-w-[120px] text-slate-400">{src.title}</span>
                          <button
                            onClick={() => handleCopy(src.title, src.id)}
                            className="ml-0.5 text-slate-200 hover:text-blue-400 transition-colors flex items-center"
                            title="Copy"
                          >
                            {copiedId === src.id ? (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                            )}
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Timing */}
                  {msg.role === "assistant" && msg.timing && (
                    <p className="text-[10px] text-slate-300 pl-1">{msg.timing}</p>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── INPUT ── */}
        {mode === "ready" && (
          <form
            onSubmit={handleSendMessage}
            className="px-3 py-3 border-t border-slate-100 bg-white flex gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask anything..."
              disabled={isGenerating}
              className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-300 disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isGenerating}
              className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl transition-all shrink-0"
            >
              {Icons.Send}
            </button>
          </form>
        )}
      </div>
    </>
  );
}