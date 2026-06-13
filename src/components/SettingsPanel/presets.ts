// ============================================================
// BYOK PROVIDER PRESETS & TYPES
// Shared by SettingsPanel and App. Kept in a non-component module
// so fast-refresh stays happy (components export only components).
// ============================================================

export interface AISettings {
  provider: string;
  apiKey: string;
  model: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  defaultModel: string;
  keysUrl: string;
  keyHint: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    keysUrl: "https://console.groq.com/keys",
    keyHint: "Starts with gsk_",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keysUrl: "https://platform.openai.com/api-keys",
    keyHint: "Starts with sk-",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    keysUrl: "https://openrouter.ai/keys",
    keyHint: "Starts with sk-or-",
  },
];

export const DEFAULT_SETTINGS: AISettings = {
  provider: "groq",
  apiKey: "",
  model: "",
};
