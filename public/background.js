/* eslint-disable no-constant-condition */
/* global chrome */

let cachedPageData = null;
let cachedTabId = null;
let cachedTabUrl = null;

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

  if (message.action === "DISCOVER_SITE") {
    if (!cachedTabUrl || !cachedTabId) return;
    runSiteDiscovery(cachedTabId, cachedTabUrl);
    sendResponse({ ok: true });
    return true;
  }

if (message.action === "INGEST_SITE_CONFIRMED") {
    if (!cachedTabUrl || !cachedTabId) return;
    // Pass the URLs array from the message into the runner
    runSiteIngestion(cachedTabId, cachedTabUrl, message.urls); 
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "CLEAR_CACHE") {
    if (!cachedTabUrl || !cachedTabId) return;
    runClearCache(cachedTabId, cachedTabUrl);
    sendResponse({ ok: true });
    return true;
  }
});

// ============================================================
// RUNNERS
// ============================================================

async function runClearCache(tabId, tabUrl) {
  try {
    const res = await fetch("http://localhost:8000/clear-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tabUrl, clear_all: false }),
    });
    
    if (res.ok) {
      chrome.tabs.sendMessage(tabId, { action: "CACHE_CLEARED" }).catch(() => {});
    }
  } catch (err) {
    console.error("[WebChat] Cache clear error:", err);
  }
}

async function runSinglePageIngestion(tabId, tabUrl, pageData) {
  try {
    const res = await fetch("http://localhost:8000/ingest-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab_id: tabId,
        url: tabUrl,
        title: pageData.title,
        text: pageData.text,
        source: pageData.source,
      }),
    });

    await readSSEStream(res, (data) => {
      chrome.tabs.sendMessage(tabId, {
        action: "INGESTION_PROGRESS",
        status: data.status,
        message: data.message,
        elapsed: data.elapsed ?? null,
      }).catch(() => {});
    });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      action: "INGESTION_PROGRESS",
      status: "failed",
      message: `Connection error: ${err.message}`,
    }).catch(() => {});
  }
}

async function runSiteDiscovery(tabId, tabUrl) {
  try {
    const res = await fetch("http://localhost:8000/discover-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tabUrl }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();

    chrome.tabs.sendMessage(tabId, {
      action: "DISCOVER_RESULT",
      result,
    }).catch(() => {});

  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      action: "DISCOVER_RESULT",
      error: `Discovery failed: ${err.message}`,
    }).catch(() => {});
  }
}

async function runSiteIngestion(tabId, tabUrl) {
  try {
    const res = await fetch("http://localhost:8000/ingest-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab_id: tabId,
        url: tabUrl,
        confirmed: true,
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

      // Fire Chrome notification when site indexing completes
      if (data.status === "ready") {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "vite.svg", // Make sure this exists in your public folder
          title: "WebChat — Indexing Complete",
          message: data.message ?? "Your site is mapped and ready to chat.",
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
      const response = await fetch("http://localhost:8000/ask-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab_id: tabId,
          url: tabUrl,
          question: msg.question,
          history: msg.history,
        }),
      });

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