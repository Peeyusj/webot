import { useState, useCallback } from 'react';

// ==========================================
// TYPES
// ==========================================

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function App() {
  const [contextText, setContextText] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

const handleExtract = useCallback(() => {
    setIsExtracting(true);
    setError(null);

    try {
      // Because we are IN the page, we just grab the text directly!
      // (The Shadow DOM automatically hides our chat text from this extraction)
      const text = document.body.innerText;

      if (text && text.trim().length > 0) {
        setContextText(text);
        setMessages([{ 
          role: 'ai', 
          content: 'I have indexed this page! What would you like to know?' 
        }]);
      } else {
        setError("No readable text found on this page.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !contextText) return;

    const newMessages = [...messages, { role: 'user' as const, content: inputText }];
    setMessages(newMessages);
    setInputText('');

    setTimeout(() => {
      setMessages([...newMessages, { role: 'ai', content: "Backend API is not connected yet." }]);
    }, 600);
  };

  return (
    <div className="flex flex-col h-screen font-sans bg-gray-50 text-gray-900 dark:bg-dark-bg dark:text-gray-100 transition-colors duration-300">
      
      {/* HEADER */}
      <header className="p-4 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-panel flex justify-between items-center transition-colors duration-300">
        <div>
          <h1 className="text-lg font-bold tracking-tight">WebChat</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {contextText ? "✅ Context Active" : "Waiting for webpage context..."}
          </p>
        </div>
      </header>

      {/* CHAT / MAIN AREA */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {!contextText ? (
          <div className="flex flex-col items-center justify-center h-full text-center mt-12">
            <span className="text-4xl mb-4 opacity-80">📄</span>
            <h2 className="text-sm font-medium mb-6 text-gray-600 dark:text-gray-300">
              Ready to index this page
            </h2>
            <button 
              onClick={handleExtract}
              disabled={isExtracting}
              className={`px-6 py-2.5 rounded-md font-semibold text-sm transition-colors ${
                isExtracting 
                  ? 'bg-gray-300 dark:bg-dark-border text-gray-500 cursor-not-allowed' 
                  : 'bg-primary hover:bg-primary-hover text-white shadow-sm'
              }`}
            >
              {isExtracting ? 'Extracting text...' : 'Index Current Page'}
            </button>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div 
              key={index} 
              className={`max-w-[85%] rounded-lg p-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-primary text-white self-end rounded-br-none' 
                  : 'bg-white dark:bg-dark-panel border border-gray-200 dark:border-dark-border text-gray-800 dark:text-gray-200 self-start rounded-bl-none'
              }`}
            >
              {msg.content}
            </div>
          ))
        )}
      </div>

      {/* INPUT BAR */}
      <form 
        onSubmit={handleSendMessage} 
        className="p-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-panel flex gap-2 transition-colors duration-300"
      >
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={contextText ? "Ask a question about this page..." : "Index page first..."}
          disabled={!contextText}
          className="flex-1 bg-gray-100 dark:bg-dark-bg border border-gray-300 dark:border-dark-border rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary dark:focus:border-primary disabled:opacity-50 transition-colors"
        />
        <button 
          type="submit" 
          disabled={!contextText || !inputText.trim()}
          className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-full text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          Send
        </button>
      </form>
      
    </div>
  );
}