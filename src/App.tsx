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

interface DiscoverResult {
  scope_prefix: string;
  page_count: number;
  capped: boolean;
  cap_limit: number;
  already_cached: boolean;
  urls_preview: string[];
  all_urls: string[];
}

type AppMode =
  | "choose"
  | "processing"
  | "ready"
  | "failed"
  | "discovering"
  | "confirming";

export default function App() {
  const [mode, setMode] = useState<AppMode>("choose");
  const [progressText, setProgressText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexingTime, setIndexingTime] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // NEW: State for copy buttons and fun facts
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [factIndex, setFactIndex] = useState(0);

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
    "The total weight of all the electrons storing the entire internet is about 50 grams—the weight of a strawberry.",
    "The first virus, 'Creeper' (1971), was harmless. It just printed: 'I'm the creeper, catch me if you can!'",
    "Email is actually older than the World Wide Web, first sent in 1971 by Ray Tomlinson.",
    "The Firefox logo is not actually a fox—it's a red panda.",
    "For 8 years, the password for the U.S. nuclear missile control computers was '00000000'.",
    "Wi-Fi is not an acronym. It doesn't stand for 'Wireless Fidelity'—it's just a trademarked name.",
    "The first YouTube video was uploaded on April 23, 2005, titled 'Me at the zoo'.",
    "The first commercial text message was sent in December 1992 and simply said 'Merry Christmas'.",
    "The original Xbox operating system was built using heavily modified Windows 2000 code.",
    "The word 'Spam' for junk mail is named after a Monty Python sketch where the word is repeated endlessly.",
    "Nintendo was founded in 1889 as a playing card company, 100 years before the Game Boy.",
    "The QWERTY keyboard layout was originally designed to slow down typists to prevent mechanical jams.",
    "If you opened a new web page every second, it would take you over 10,000 years to see the whole internet."
  ];

  // Rotate facts every 4 seconds while processing
  useEffect(() => {
    if (mode === "processing" || mode === "discovering") {
      const interval = setInterval(() => {
        setFactIndex((prev) => (prev + 1) % FUN_FACTS.length);
      }, 7000);
      return () => clearInterval(interval);
    }
  }, [mode]);

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ============================================================
  // BACKGROUND MESSAGE LISTENER
  // ============================================================
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageListener = (request: any) => {
      if (request.action === "INGESTION_PROGRESS") {
        setProgressText(request.message);
        if (request.status === "ready") {
          setMode("ready");
          if (request.elapsed)
            setIndexingTime(`Indexed in ${request.elapsed}s`);
          if (messages.length === 0) {
            setMessages([
              {
                role: "assistant",
                content: "I've indexed this page. What would you like to know?",
              },
            ]);
          }
        }
        if (request.status === "failed") {
          setMode("failed");
          setError(request.message);
        }
      }

      if (request.action === "SITE_INGESTION_PROGRESS") {
        setProgressText(request.message);
        if (request.status === "ready") {
          setMode("ready");
          if (request.time_display) {
            setIndexingTime(
              `Indexed ${request.pages_indexed} pages in ${request.time_display}`,
            );
          }
          if (messages.length === 0) {
            setMessages([
              {
                role: "assistant",
                content: `I've mapped **${request.pages_indexed ?? "all"}** pages from this site. Ask me anything across the documentation.`,
              },
            ]);
          }
        }
        if (request.status === "failed") {
          setMode("failed");
          setError(request.message);
        }
      }

      if (request.action === "DISCOVER_RESULT") {
        if (request.error) {
          setMode("failed");
          setError(request.error);
          return;
        }
        setDiscoverResult(request.result);
        setMode("confirming");
      }

      if (request.action === "CACHE_CLEARED") {
        setIsClearing(false);
        setMode("choose");
        setMessages([]);
        setIndexingTime(null);
        setDiscoverResult(null);
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
    setMode("discovering");
    setProgressText("Discovering pages...");
    setError(null);
    chrome.runtime.sendMessage({ action: "DISCOVER_SITE" });
  };

  const handleConfirmSiteIndex = () => {
    setMode("processing");
    setProgressText("Starting site indexing...");
    chrome.runtime.sendMessage({
      action: "INGEST_SITE_CONFIRMED",
      urls: discoverResult?.all_urls || [],
    });
  };

  const handleClearCache = () => {
    setIsClearing(true);
    chrome.runtime.sendMessage({ action: "CLEAR_CACHE" });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || mode !== "ready" || isGenerating) return;

    setError(null);
    setIsGenerating(true);

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
  // ICONS (Clean SVG Paths)
  // ============================================================
  const Icons = {
    Document: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    Globe: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
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
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
    Send: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    Map: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
        <line x1="9" y1="3" x2="9" y2="18" />
        <line x1="15" y1="6" x2="15" y2="21" />
      </svg>
    ),
  };

  // ============================================================
  // RENDER SCREENS
  // ============================================================
  const renderChooseScreen = () => (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8 fade-in text-slate-800">
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight mb-2">
          WebChat Engine
        </h2>
        <p className="text-sm text-slate-500">
          Select an indexing scope to begin.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        <button
          onClick={handleChooseSinglePage}
          className="group relative flex flex-col items-start gap-1 p-5 rounded-2xl border border-slate-200 bg-white hover:border-blue-500 hover:shadow-lg transition-all text-left overflow-hidden"
        >
          <div className="flex items-center gap-3 w-full text-blue-600">
            {Icons.Document}
            <span className="font-semibold text-sm text-slate-800 group-hover:text-blue-600 transition-colors">
              Current Page
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Extract and query just the document you are currently viewing.
          </p>
        </button>

        <button
          onClick={handleChooseFullSite}
          className="group relative flex flex-col items-start gap-1 p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-500 hover:shadow-lg transition-all text-left overflow-hidden"
        >
          <div className="flex items-center gap-3 w-full text-indigo-600">
            {Icons.Globe}
            <span className="font-semibold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">
              Entire Sub-Site
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Map the sitemap and query across all related documentation pages.
          </p>
        </button>
      </div>
    </div>
  );

  const renderConfirmingScreen = () => {
    if (!discoverResult) return null;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6 fade-in text-slate-800">
        <div className="text-indigo-600 bg-indigo-50 p-4 rounded-full">
          {Icons.Map}
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold mb-1">Scope Discovered</h2>
          <p className="text-xs text-slate-500">Review indexing parameters</p>
        </div>

        <div className="w-full max-w-[280px] bg-white border border-slate-200 rounded-2xl p-5 text-sm flex flex-col gap-3 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">
              Path
            </span>
            <span className="font-mono text-slate-800 truncate max-w-[140px] text-xs bg-slate-100 px-2 py-1 rounded">
              {discoverResult.scope_prefix}
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">
              Documents
            </span>
            <span className="font-semibold text-slate-800 text-xs">
              {discoverResult.page_count}{" "}
              {discoverResult.capped && (
                <span className="text-amber-500 font-normal ml-1">
                  (capped at {discoverResult.cap_limit})
                </span>
              )}
            </span>
          </div>
          {discoverResult.already_cached && (
            <div className="flex justify-between items-center pb-1">
              <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                Status
              </span>
              <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded">
                Cached Ready
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-3 w-full max-w-[280px]">
          <button
            onClick={() => setMode("choose")}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmSiteIndex}
            className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-all shadow-md"
          >
            {discoverResult.already_cached ? "Load Memory" : "Begin Index"}
          </button>
        </div>
      </div>
    );
  };

  const renderProcessingScreen = () => (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 fade-in text-center text-slate-800">
      <div className="relative flex justify-center items-center">
        <div className="absolute w-12 h-12 border-4 border-slate-100 rounded-full"></div>
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div className="flex flex-col gap-2 max-w-[260px] items-center">
        <p className="text-sm font-medium text-slate-600 animate-pulse">
          {progressText}
        </p>

        {/* NEW: Fun Facts Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-4 shadow-sm w-full transition-opacity duration-500">
          <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
            Did you know?
          </p>
          <p className="text-xs text-slate-600 leading-relaxed italic">
            "{FUN_FACTS[factIndex]}"
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* SCROLLBAR & ANIMATION STYLES */}
      <style>{`
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        .slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="flex flex-col h-screen font-sans bg-[#F9FAFB] text-slate-900 transition-colors duration-300">
        {/* HEADER */}
        <header className="px-5 py-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 shadow-sm z-10">
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              WebChat
            </h1>
            <p className="text-[11px] mt-0.5 flex items-center gap-1.5 font-medium uppercase tracking-wider text-slate-500">
              {(mode === "processing" || mode === "discovering") && (
                <span className="text-blue-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                  Processing
                </span>
              )}
              {mode === "ready" && (
                <span className="text-emerald-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {indexingTime ?? "Ready"}
                </span>
              )}
              {mode === "choose" && "Standby"}
              {mode === "confirming" && "Pending Confirmation"}
            </p>
          </div>

          <div className="flex gap-2">
            {(mode === "ready" || mode === "failed") && (
              <button
                onClick={handleClearCache}
                disabled={isClearing}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                title="Clear Memory"
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
                className="text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors px-3 py-1.5 rounded-lg"
              >
                Back
              </button>
            )}
          </div>
        </header>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto relative">
          {mode === "choose" && renderChooseScreen()}
          {mode === "discovering" && renderConfirmingScreen()}{" "}
          {/* Uses same screen logic */}
          {mode === "confirming" && renderConfirmingScreen()}
          {mode === "processing" && renderProcessingScreen()}
          {mode === "failed" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center fade-in">
              <div className="text-red-500 bg-red-50 p-4 rounded-full">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 font-medium">
                {error ?? "Something went wrong."}
              </p>
              <button
                onClick={() => {
                  setMode("choose");
                  setError(null);
                }}
                className="mt-2 px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50 transition-all"
              >
                Try Again
              </button>
            </div>
          )}
          {/* CHAT SCREEN */}
          {mode === "ready" && (
            <div className="p-5 flex flex-col gap-6">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`max-w-[88%] text-[13px] leading-relaxed slide-up flex flex-col gap-1.5 ${
                    msg.role === "user"
                      ? "self-end items-end"
                      : "self-start items-start"
                  }`}
                >
                  <div
                    className={`px-4 py-3 shadow-sm ${
                      msg.role === "user"
                        ? "bg-slate-900 text-white rounded-2xl rounded-tr-[4px]"
                        : "bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-[4px]"
                    }`}
                    // Ensures long strings without spaces don't break the UI
                    style={{
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {msg.content === "" &&
                    isGenerating &&
                    index === messages.length - 1 ? (
                      <span className="flex gap-1 items-center py-1.5 px-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </span>
                    ) : msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-pre:text-slate-800">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>

                  {/* Clean Sources Tags */}
                  {msg.role === "assistant" &&
                    msg.sources &&
                    msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1 pl-1">
                        {msg.sources.map((src) => (
                          <span
                            key={src.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-[10px] font-medium text-slate-600 shadow-sm group"
                          >
                            <span className="text-blue-600 font-bold">
                              [{src.id}]
                            </span>
                            <span className="truncate max-w-[140px] border-r border-slate-200 pr-1.5">
                              {src.title}
                            </span>

                            {/* NEW: Copy Button */}
                            <button
                              onClick={() => handleCopy(src.title, src.id)}
                              className="text-slate-400 hover:text-blue-600 transition-colors pl-0.5 flex items-center justify-center cursor-pointer"
                              title="Copy Source Title"
                            >
                              {copiedId === src.id ? (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="text-emerald-500"
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
                                  strokeWidth="2"
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
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* INPUT BAR */}
        {mode === "ready" && (
          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t border-slate-200 bg-white flex gap-2 shrink-0 z-10"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask a question..."
              disabled={isGenerating}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 transition-all text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isGenerating}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center h-[46px] w-[46px] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shrink-0"
            >
              {Icons.Send}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
