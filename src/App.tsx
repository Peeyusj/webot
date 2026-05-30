import React, { useState, useEffect, useRef } from 'react';

interface SourceCitation {
  index: number;
  title: string;
  snippet: string;
  source_type: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
}

export default function App() {
  const [status, setStatus] = useState<'processing' | 'ready' | 'failed'>('processing');
  const [progressText, setProgressText] = useState('Initializing pipeline...');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Hook into live background process pipelines
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageListener = (request: any) => {
      if (request.action === "TOGGLE_UI") {
        setStatus('processing');
        setProgressText('Reading webpage structure...');
        setError(null);
      }
      
      if (request.action === "INGESTION_PROGRESS") {
        setProgressText(request.message);
        if (request.status === 'ready') {
          setStatus('ready');
          if (messages.length === 0) {
            setMessages([
              { role: 'assistant', content: 'Hi! I have completely indexed this page. References are active!' }
            ]);
          }
        }
        if (request.status === 'failed') {
          setStatus('failed');
          setError(request.message);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [messages.length]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || status !== 'ready' || isGenerating) return;

    setError(null);
    setIsGenerating(true);
    
    const userQuery = inputText.trim();
    setInputText('');

    const updatedHistory: ChatMessage[] = [...messages, { role: 'user', content: userQuery }];
    setMessages([...updatedHistory, { role: 'assistant', content: '', sources: [] }]);

    const port = chrome.runtime.connect({ name: "webchat-stream-port" });
    port.postMessage({ question: userQuery, history: messages });

    port.onMessage.addListener((response) => {
      // Scenario A: First packet arrives containing sources citation data
      if (response.sources) {
        setMessages((prev) => {
          const updated = [...prev];
          const targetIndex = updated.length - 1;
          if (targetIndex >= 0) {
            updated[targetIndex].sources = response.sources;
          }
          return updated;
        });
      }

      // Scenario B: Subsequent packets arrive containing wording strings
      if (response.type === "token") {
        setMessages((prev) => {
          const updated = [...prev];
          const targetIndex = updated.length - 1;
          if (targetIndex >= 0) {
            updated[targetIndex].content += response.token;
          }
          return updated;
        });
      }

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

  return (
    <div className="flex flex-col h-screen font-sans bg-gray-50 text-gray-900 dark:bg-zinc-900 dark:text-gray-100 transition-colors duration-300">
      
      {/* HEADER ROW */}
      <header className="p-4 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/50 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold tracking-tight">WebChat Pro</h1>
          <p className="text-xs mt-0.5 flex items-center gap-1.5 font-medium">
            {status === 'processing' && (
              <span className="text-amber-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                {progressText}
              </span>
            )}
            {status === 'ready' && (
              <span className="text-emerald-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {progressText || "Context Synchronized"}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* CHAT CONTAINER PANEL */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm flex flex-col gap-2 ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white self-end rounded-br-none' 
                : 'bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-200 self-start rounded-bl-none'
            }`}
          >
            <div>
              {msg.content === '' && isGenerating && index === messages.length - 1 ? (
                <span className="flex gap-1 items-center py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              ) : (
                msg.content
              )}
            </div>

            {/* REFERENCE CITATION CHIPS BLOCK */}
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-zinc-700 text-xs text-gray-500 dark:text-gray-400">
                <p className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-gray-400">Retrieved Sources:</p>
                <div className="flex flex-col gap-1.5">
                  {msg.sources.map((src) => (
                    <div key={src.index} className="bg-gray-50 dark:bg-zinc-900/60 p-2 rounded border border-gray-200/60 dark:border-zinc-700/60">
                      <span className="font-bold text-blue-600 dark:text-blue-400 mr-1">[{src.index}]</span> 
                      <span className="italic">"{src.snippet}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* FOOTER CONTROL BAR */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/50 flex gap-2">
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={status === 'ready' ? "Ask anything about this document..." : "Synchronizing system context..."}
          disabled={status !== 'ready' || isGenerating}
          className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 transition-all"
        />
        <button 
          type="submit" 
          disabled={status !== 'ready' || !inputText.trim() || isGenerating}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          Send
        </button>
      </form>
    </div>
  );
}