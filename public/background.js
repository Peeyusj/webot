/* eslint-disable no-constant-condition */
/* global chrome */

let cachedPageData = null;
let cachedTabId = null;
let cachedTabUrl = null;

const API_BASE = "http://localhost:8000";

// ============================================================
// BRING-YOUR-OWN-KEY (BYOK)
// The user's AI API key lives in chrome.storage.local, which is
// sandboxed to the extension and not readable by web pages. We
// read it here and attach it per-request as headers — it is sent
// straight to our backend and never written to the page or disk.
// ============================================================
async function getRequestHeaders() {
  const headers = { "Content-Type": "application/json" };
  try {
    const { webchat_settings } = await chrome.storage.local.get("webchat_settings");
    if (webchat_settings && webchat_settings.apiKey) {
      headers["X-Provider"] = webchat_settings.provider || "groq";
      headers["X-Api-Key"] = webchat_settings.apiKey;
      if (webchat_settings.model) headers["X-Model"] = webchat_settings.model;
    }
  } catch (err) {
    console.warn("[WebChat] Could not read settings:", err);
  }
  return headers;
}

// Verify a key against the backend without persisting anything.
async function validateKey(settings) {
  try {
    const res = await fetch(`${API_BASE}/validate-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Provider": settings.provider || "groq",
        "X-Api-Key": settings.apiKey || "",
        ...(settings.model ? { "X-Model": settings.model } : {}),
      },
    });
    if (res.status === 404) {
      return {
        valid: false,
        detail: "Backend has no /validate-key route — restart the server with the latest code.",
      };
    }
    if (!res.ok) {
      return { valid: false, detail: `Server returned ${res.status}.` };
    }
    return await res.json();
  } catch (err) {
    return {
      valid: false,
      detail: `Could not reach the backend at ${API_BASE}. Is it running?`,
    };
  }
}

// Ask the backend for one starter question based on the indexed content.
async function getSuggestion(url) {
  if (!url) return { question: "" };
  try {
    const res = await fetch(`${API_BASE}/suggest-question`, {
      method: "POST",
      headers: await getRequestHeaders(),
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return { question: "" };
    return await res.json();
  } catch (err) {
    return { question: "" };
  }
}

// ============================================================
// 1. ICON CLICK — TOGGLE UI + CACHE PAGE DATA
// ============================================================
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_UI" });

    if (response && response.isOpen && response.pageData) {
      cachedPageData = response.pageData;
      cachedTabId = tab.id;
      cachedTabUrl = tab.url;
      console.log("[WebChat] Page data cached.");
    }

    if (response && !response.isOpen) {
      cachedPageData = null;
      cachedTabId = null;
      cachedTabUrl = null;
    }
  } catch (err) {
    console.error("[WebChat] Toggle error:", err);
  }
});

// ============================================================
// 2. MESSAGES FROM APP.TSX
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "INGEST_SINGLE_PAGE") {
    if (!cachedPageData || !cachedTabId || !cachedTabUrl) return;
    runSinglePageIngestion(cachedTabId, cachedTabUrl, cachedPageData);
    sendResponse({ ok: true });
    return true;
  }

  // The new direct pipeline
  if (message.action === "INGEST_FULL_SITE") {
    if (!cachedTabUrl || !cachedTabId) return;
    runSiteIngestion(cachedTabId, cachedTabUrl);
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "CLEAR_CACHE") {
    if (!cachedTabUrl || !cachedTabId) return;
    runClearCache(cachedTabId, cachedTabUrl);
    sendResponse({ ok: true });
    return true;
  }

  // Settings UI asks us to test a key against the backend.
  if (message.action === "VALIDATE_KEY") {
    validateKey(message.settings || {}).then(sendResponse);
    return true; // async response
  }

  // Sidebar asks for a starter question once content is indexed.
  if (message.action === "GET_SUGGESTION") {
    const url = sender.tab?.url || cachedTabUrl;
    getSuggestion(url).then(sendResponse);
    return true; // async response
  }

  // Fetch session state for the requesting tab
  if (message.action === "GET_TAB_STATE") {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.storage.session.get([`webchat_state_${tabId}`], (result) => {
        sendResponse({ state: result[`webchat_state_${tabId}`] });
      });
      return true; // Return true to indicate we will send the response asynchronously
    }
    sendResponse({ state: null });
    return false;
  }
});

// ============================================================
// RUNNERS
// ============================================================

async function runClearCache(tabId, tabUrl) {
  try {
    const res = await fetch(`${API_BASE}/clear-cache`, {
      method: "POST",
      headers: await getRequestHeaders(),
      body: JSON.stringify({ url: tabUrl, clear_all: false }),
    });
    
    if (res.ok) {
      // Clear persisted state too
      chrome.storage.session.remove([`webchat_state_${tabId}`]);
      chrome.tabs.sendMessage(tabId, { action: "CACHE_CLEARED" }).catch(() => {});
    }
  } catch (err) {
    console.error("[WebChat] Cache clear error:", err);
  }
}

async function runSinglePageIngestion(tabId, tabUrl, pageData) {
  try {
    const res = await fetch(`${API_BASE}/ingest-page`, {
      method: "POST",
      headers: await getRequestHeaders(),
      body: JSON.stringify({
        tab_id: tabId,
        url: tabUrl,
        title: pageData.title,
        text: pageData.text,
        source: pageData.source,
      }),
    });

// when data.status === "ready"
await readSSEStream(res, (data) => {
  chrome.tabs.sendMessage(tabId, {
    action: "INGESTION_PROGRESS",
    status: data.status,
    message: data.message,
    elapsed: data.elapsed ?? null,
  }).catch(() => {});

  // Persist ready state so sidebar can resume after close
  if (data.status === "ready") {
    chrome.storage.session.set({
      [`webchat_state_${tabId}`]: {
        mode: "ready",
        url: tabUrl,
        indexingTime: data.elapsed ? `Indexed in ${data.elapsed}s` : "Ready"
      }
    });
  }
});
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      action: "INGESTION_PROGRESS",
      status: "failed",
      message: `Connection error: ${err.message}`,
    }).catch(() => {});
  }
}

async function runSiteIngestion(tabId, tabUrl) {
  try {
    const res = await fetch(`${API_BASE}/ingest-site`, {
      method: "POST",
      headers: await getRequestHeaders(),
      body: JSON.stringify({
        tab_id: tabId,
        url: tabUrl
      }),
    });

    await readSSEStream(res, (data) => {
      chrome.tabs.sendMessage(tabId, {
        action: "SITE_INGESTION_PROGRESS",
        status: data.status,
        message: data.message,
        elapsed: data.elapsed ?? null,
        pages_indexed: data.pages_indexed ?? null,
        time_display: data.time_display ?? null,
      }).catch(() => {});

      // Fire Chrome notification when site indexing completes successfully
      if (data.status === "ready") {
  chrome.storage.session.set({
    [`webchat_state_${tabId}`]: {
      mode: "ready", 
      url: tabUrl,
      indexingTime: data.elapsed ? `Indexed in ${data.elapsed}s` : "Ready",
      pages_indexed: data.pages_indexed
    }
  });

  chrome.notifications.create({
    type: "basic",
    iconUrl: "vite.svg",
    title: "WebChat — Ready",
    message: data.message ?? "The site is mapped and ready.",
    priority: 2
  });
}
    });

  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      action: "SITE_INGESTION_PROGRESS",
      status: "failed",
      message: `Connection error: ${err.message}`,
    }).catch(() => {});
  }
}

// ============================================================
// SSE UTILS & CHAT PORT
// ============================================================

async function readSSEStream(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("data: ")) {
        try {
          const data = JSON.parse(cleanLine.slice(6));
          onData(data);
        } catch (e) {
          // ignore parse errors on partial chunks
        }
      }
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "webchat-keepalive") {
    port.onMessage.addListener(() => {});
    return;
  }

  if (port.name !== "webchat-stream-port") return;

  port.onMessage.addListener(async (msg) => {
    const tabId = port.sender?.tab?.id;
    const tabUrl = port.sender?.tab?.url;
    if (!tabId || !tabUrl) return;

    try {
      const response = await fetch(`${API_BASE}/ask-stream`, {
        method: "POST",
        headers: await getRequestHeaders(),
        body: JSON.stringify({
          tab_id: tabId,
          url: tabUrl,
          question: msg.question,
          history: msg.history,
        }),
      });

      // Surface auth/server errors (e.g. 401 = no key configured)
      // instead of silently streaming an empty body.
      if (!response.ok) {
        let detail = `Request failed (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.detail) detail = errJson.detail;
        } catch (_) { /* body wasn't JSON */ }
        port.postMessage({ type: "ERROR", error: detail });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith("data: ")) {
            try {
              const parsedData = JSON.parse(cleanLine.slice(6));
              port.postMessage(parsedData);
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }

      port.postMessage({ type: "DONE" });

    } catch (err) {
      port.postMessage({ type: "ERROR", error: err.message });
    }
  });
});