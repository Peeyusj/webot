import { useState } from "react";
import { PROVIDERS, type AISettings } from "./presets";

// ============================================================
// BRING-YOUR-OWN-KEY SETTINGS
// The key the user types here is saved to chrome.storage.local
// (sandboxed to this extension — not readable by web pages) and
// sent to the backend only as a per-request header. We never
// write it to the page DOM or to any third party.
// ============================================================

interface SettingsPanelProps {
  initialSettings: AISettings;
  onSave: (settings: AISettings) => void;
  onRemove: () => void;
  onClose: () => void;
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; model?: string }
  | { status: "fail"; detail: string };

export default function SettingsPanel({
  initialSettings,
  onSave,
  onRemove,
  onClose,
}: SettingsPanelProps) {
  const [provider, setProvider] = useState(initialSettings.provider || "groq");
  const [apiKey, setApiKey] = useState(initialSettings.apiKey || "");
  const [model, setModel] = useState(initialSettings.model || "");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const preset =
    PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const hasKey = apiKey.trim().length > 0;

  const handleProviderChange = (id: string) => {
    setProvider(id);
    setTest({ status: "idle" });
  };

  const handleTest = () => {
    if (!hasKey) return;
    setTest({ status: "testing" });
    const payload: AISettings = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
    };
    chrome.runtime.sendMessage(
      { action: "VALIDATE_KEY", settings: payload },
      (res) => {
        if (chrome.runtime.lastError) {
          setTest({
            status: "fail",
            detail: chrome.runtime.lastError.message ?? "Extension error.",
          });
          return;
        }
        if (res && res.valid) {
          setTest({ status: "ok", model: res.model });
        } else {
          setTest({
            status: "fail",
            detail: (res && res.detail) || "The key was rejected.",
          });
        }
      }
    );
  };

  const handleSave = () => {
    onSave({ provider, apiKey: apiKey.trim(), model: model.trim() });
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-white fade-in">
      {/* ── HEADER ── */}
      <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-slate-900 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 leading-none tracking-tight">Settings</h1>
            <p className="text-[10px] mt-0.5 leading-none font-medium tracking-wide uppercase text-slate-300">
              AI Provider
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">

        {/* PROVIDER */}
        <div>
          <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">
            Provider
          </label>
          <div className="grid grid-cols-3 gap-1.5 mt-2 p-1 bg-slate-50 border border-slate-100 rounded-xl">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
                  provider === p.id
                    ? "bg-white text-slate-800 shadow-sm border border-slate-100"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* API KEY */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">
              API Key
            </label>
            <a
              href={preset.keysUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-semibold text-blue-500 hover:text-blue-600 transition-colors"
            >
              Get a key ↗
            </a>
          </div>
          <div className="relative mt-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTest({ status: "idle" });
              }}
              placeholder={`${preset.label} API key`}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-3.5 pr-10 py-2.5 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-300 transition-all font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              title={showKey ? "Hide" : "Show"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-slate-600 transition-colors"
            >
              {showKey ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-300 mt-1.5 pl-0.5">{preset.keyHint}</p>
        </div>

        {/* MODEL */}
        <div>
          <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">
            Model <span className="text-slate-200 normal-case tracking-normal">· optional</span>
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setTest({ status: "idle" });
            }}
            placeholder={preset.defaultModel}
            spellCheck={false}
            className="w-full mt-2 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-300 transition-all font-mono"
          />
          <p className="text-[10px] text-slate-300 mt-1.5 pl-0.5">
            Leave blank to use <span className="text-slate-400">{preset.defaultModel}</span>
          </p>
        </div>

        {/* TEST CONNECTION */}
        <div>
          <button
            onClick={handleTest}
            disabled={!hasKey || test.status === "testing"}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {test.status === "testing" ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Testing…
              </>
            ) : (
              "Test connection"
            )}
          </button>

          {test.status === "ok" && (
            <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-lg bg-emerald-50 border border-emerald-100 fade-in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-[11px] text-emerald-600 leading-relaxed">
                Connected{test.model ? ` · ${test.model}` : ""}
              </p>
            </div>
          )}
          {test.status === "fail" && (
            <div className="flex items-start gap-1.5 mt-2 px-2.5 py-2 rounded-lg bg-red-50 border border-red-100 fade-in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[11px] text-red-500 leading-relaxed break-words">{test.detail}</p>
            </div>
          )}
        </div>

        {/* SECURITY NOTE */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Your key is stored locally in your browser and sent only to your own backend with each request. It is never saved on the server or shared.
          </p>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
        <button
          onClick={onRemove}
          disabled={!initialSettings.apiKey}
          className="text-[12px] font-semibold text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
        >
          Remove key
        </button>
        <button
          onClick={handleSave}
          disabled={!hasKey}
          className="px-5 py-2 text-[12px] font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl transition-all"
        >
          Save
        </button>
      </footer>
    </div>
  );
}
