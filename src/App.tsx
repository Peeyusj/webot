import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

// ============================================================
// TYPES
// ============================================================

interface SourceCitation {
  index: number;
  title: string;
  snippet: string;
  url: string;           // clickable link
  doc_type: string;
  intent_used: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  timing?: string;       // e.g. "answered in 1.2s"
}

interface DiscoverResult {
  scope_prefix: string;
  page_count: number;
  capped: boolean;
  cap_limit: number;
  already_cached: boolean;
  urls_preview: string[];
}

// App can be in these modes
type AppMode = "choose" | "processing" | "ready" | "failed" | "discovering" | "confirming";

export default function App() {
  const [mode, setMode] = useState<AppMode>("choose");
  const [progressText, setProgressText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexingTime, setIndexingTime] = useState<string | null>(null);

  // Full site confirmation dialog state
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ============================================================
  // BACKGROUND MESSAGE LISTENER
  // ============================================================
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageListener = (request: any) => {

      // Single page ingestion progress
      if (request.action === "INGESTION_PROGRESS") {
        setProgressText(request.message);

        if (request.status === "ready") {
          setMode("ready");
          // Show indexing time if backend sent it
          if (request.elapsed) {
            setIndexingTime(`Indexed in ${request.elapsed}s`);
          }
          if (messages.length === 0) {
            setMessages([{
              role: "assistant",
              content: "Hi! I've indexed this page. Ask me anything about it.",
            }]);
          }
        }

        if (request.status === "failed") {
          setMode("failed");
          setError(request.message);
        }
      }

      // Full site ingestion progress
      if (request.action === "SITE_INGESTION_PROGRESS") {
        setProgressText(request.message);

        if (request.status === "ready") {
          setMode("ready");
          if (request.time_display) {
            setIndexingTime(`Indexed ${request.pages_indexed} pages in ${request.time_display}`);
          }
          if (messages.length === 0) {
            setMessages([{
              role: "assistant",
              content: `Hi! I've indexed **${request.pages_indexed ?? "all"}** pages from this site. Ask me anything across the entire documentation.`,
            }]);
          }
        }

        if (request.status === "failed") {
          setMode("failed");
          setError(request.message);
        }
      }

      // Discovery result — show confirmation dialog
      if (request.action === "DISCOVER_RESULT") {
        if (request.error) {
          setMode("failed");
          setError(request.error);
          return;
        }
        setDiscoverResult(request.result);
        setMode("confirming");
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [messages.length]);

  // ============================================================
  // MODE SELECTION HANDLERS
  // ============================================================

  const handleChooseSinglePage = () => {
    setMode("processing");
    setProgressText("Reading page...");
    setError(null);
    // Tell background.js to run single page ingestion
    chrome.runtime.sendMessage({ action: "INGEST_SINGLE_PAGE" });
  };

  const handleChooseFullSite = () => {
    setMode("discovering");
    setProgressText("Discovering pages...");
    setError(null);
    // Tell background.js to call /discover-site first
    chrome.runtime.sendMessage({ action: "DISCOVER_SITE" });
  };

  const handleConfirmSiteIndex = () => {
    setMode("processing");
    setProgressText("Starting full site indexing...");
    // Tell background.js to proceed with /ingest-site
    chrome.runtime.sendMessage({ action: "INGEST_SITE_CONFIRMED" });
  };

  const handleCancelSiteIndex = () => {
    // Go back to choose screen
    setMode("choose");
    setDiscoverResult(null);
    setError(null);
  };

  // ============================================================
  // CHAT HANDLER
  // ============================================================

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || mode !== "ready" || isGenerating) return;

    setError(null);
    setIsGenerating(true);

    const userQuery = inputText.trim();
    setInputText("");

    // Capture clean history BEFORE any state mutations
    const historyToSend = messages.slice(-6);

    const updatedHistory: ChatMessage[] = [
      ...messages,
      { role: "user", content: userQuery },
    ];
    setMessages([
      ...updatedHistory,
      { role: "assistant", content: "", sources: [] },
    ]);

    const port = chrome.runtime.connect({ name: "webchat-stream-port" });
    port.postMessage({ question: userQuery, history: historyToSend });

    port.onMessage.addListener((response) => {

      // Sources packet — arrives before tokens
      if (response.type === "sources") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            last.sources = response.sources;
          }
          return updated;
        });
      }

      // Token packet — stream text in
      if (response.type === "token") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            last.content += response.token;
          }
          return updated;
        });
      }

      // Done packet — backend sends timing info
      if (response.type === "done") {
        setIsGenerating(false);
        // Attach timing to the last assistant message
        if (response.time_display) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              last.timing = `answered in ${response.time_display}`;
            }
            return updated;
          });
        }
        port.disconnect();
      }

      // background.js DONE signal
      if (response.type === "DONE") {
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
  // RENDER HELPERS
  // ============================================================

  // Screen 1: Choose mode
  const renderChooseScreen = () => (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6 text-center">
      <div>
        <div className="text-3xl mb-2">💬</div>
        <h2 className="text-base font-semibold mb-1">What would you like to do?</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Choose how to use WebChat on this page
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        {/* Single page option */}
        <button
          onClick={handleChooseSinglePage}
          className="flex flex-col items-start gap-1 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-center gap-2 w-full">
            <span className="text-lg">📄</span>
            <span className="font-semibold text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Chat with this page
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
            Index just the current page. Fast, works on authenticated pages.
          </p>
        </button>

        {/* Full site option */}
        <button
          onClick={handleChooseFullSite}
          className="flex flex-col items-start gap-1 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-center gap-2 w-full">
            <span className="text-lg">🌐</span>
            <span className="font-semibold text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              Chat with entire site
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
            Index the whole documentation section. Deeper answers across all pages.
          </p>
        </button>
      </div>
    </div>
  );

  // Screen 2: Discovering pages spinner
  const renderDiscoveringScreen = () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      <p className="text-sm text-gray-600 dark:text-gray-300">{progressText}</p>
    </div>
  );

  // Screen 3: Confirmation dialog
  const renderConfirmingScreen = () => {
    if (!discoverResult) return null;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
        <div>
          <div className="text-3xl mb-2">🗺️</div>
          <h2 className="text-base font-semibold mb-1">Ready to index</h2>
        </div>

        <div className="w-full max-w-[280px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-4 text-left text-xs flex flex-col gap-2">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Scope</span>
            <span className="font-mono text-gray-800 dark:text-gray-200 truncate max-w-[160px]">
              {discoverResult.scope_prefix}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Pages found</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {discoverResult.page_count}
              {discoverResult.capped && (
                <span className="text-amber-500 ml-1">(capped at {discoverResult.cap_limit})</span>
              )}
            </span>
          </div>
          {discoverResult.already_cached && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Cache</span>
              <span className="text-emerald-500 font-semibold">Will load instantly ✓</span>
            </div>
          )}

          {/* URL preview */}
          {discoverResult.urls_preview.length > 0 && (
            <div className="mt-1 pt-2 border-t border-gray-100 dark:border-zinc-700">
              <p className="text-gray-400 mb-1">Sample pages:</p>
              {discoverResult.urls_preview.slice(0, 3).map((url, i) => (
                <p key={i} className="font-mono text-gray-600 dark:text-gray-400 truncate text-[10px]">
                  {url}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 w-full max-w-[280px]">
          <button
            onClick={handleCancelSiteIndex}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmSiteIndex}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-all shadow-sm"
          >
            {discoverResult.already_cached ? "Load from cache" : "Start indexing"}
          </button>
        </div>
      </div>
    );
  };

  // Screen 4: Processing / ingestion in progress
  const renderProcessingScreen = () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      <p className="text-sm text-gray-600 dark:text-gray-300">{progressText}</p>
    </div>
  );

  // Screen 5: Failed
  const renderFailedScreen = () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="text-3xl">❌</div>
      <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Something went wrong."}</p>
      <button
        onClick={() => { setMode("choose"); setError(null); }}
        className="px-4 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
      >
        Try again
      </button>
    </div>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="flex flex-col h-screen font-sans bg-gray-50 text-gray-900 dark:bg-zinc-900 dark:text-gray-100 transition-colors duration-300">

      {/* HEADER */}
      <header className="p-4 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/50 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-tight">WebChat Pro</h1>
          <p className="text-xs mt-0.5 flex items-center gap-1.5 font-medium">
            {(mode === "processing" || mode === "discovering") && (
              <span className="text-amber-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                {progressText}
              </span>
            )}
            {mode === "ready" && (
              <span className="text-emerald-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {indexingTime ?? "Context synchronized"}
              </span>
            )}
            {mode === "choose" && (
              <span className="text-gray-400">Ready</span>
            )}
            {mode === "confirming" && (
              <span className="text-purple-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                Confirm indexing
              </span>
            )}
          </p>
        </div>

        {/* Allow going back to choose screen from ready state */}
        {mode === "ready" && (
          <button
            onClick={() => { setMode("choose"); setMessages([]); setIndexingTime(null); }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors px-2 py-1 rounded"
          >
            Change
          </button>
        )}
      </header>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto">

        {/* Non-chat screens */}
        {mode === "choose" && renderChooseScreen()}
        {mode === "discovering" && renderDiscoveringScreen()}
        {mode === "confirming" && renderConfirmingScreen()}
        {mode === "processing" && renderProcessingScreen()}
        {mode === "failed" && renderFailedScreen()}

        {/* Chat screen */}
        {mode === "ready" && (
          <div className="p-4 flex flex-col gap-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm flex flex-col gap-2 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white self-end rounded-br-none"
                    : "bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-200 self-start rounded-bl-none"
                }`}
              >
                {/* Message content */}
                <div>
                  {msg.content === "" && isGenerating && index === messages.length - 1 ? (
                    <span className="flex gap-1 items-center py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  ) : (
                    msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-gray-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-zinc-700">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )
                  )}
                </div>

                {/* Sources with clickable links */}
                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-1 pt-2 border-t border-gray-100 dark:border-zinc-700 text-xs text-gray-500 dark:text-gray-400">
                    <p className="font-semibold mb-1.5 text-[10px] uppercase tracking-wider text-gray-400">
                      Sources
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {msg.sources.map((src) => (
                        <a
                          key={src.index}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col gap-0.5 bg-gray-50 dark:bg-zinc-900/60 p-2 rounded border border-gray-200/60 dark:border-zinc-700/60 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-blue-600 dark:text-blue-400 text-[10px]">
                              [{src.index}]
                            </span>
                            <span className="font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                              {src.title}
                            </span>
                            <span className="ml-auto text-gray-400 group-hover:text-blue-500 transition-colors text-[10px]">
                              ↗
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-500 italic line-clamp-2">
                            {src.snippet}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Answer timing */}
                {msg.role === "assistant" && msg.timing && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {msg.timing}
                  </p>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* INPUT BAR — only shown when ready */}
      {mode === "ready" && (
        <form
          onSubmit={handleSendMessage}
          className="p-4 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/50 flex gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask anything about this content..."
            disabled={isGenerating}
            className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isGenerating}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}