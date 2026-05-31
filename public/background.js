/* eslint-disable no-constant-condition */
/* global chrome */

// Stores page data extracted by content.tsx
// Needed because INGEST_SINGLE_PAGE and INGEST_SITE_CONFIRMED
// are sent AFTER the toggle, so we cache what content.tsx returned
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
      // Cache the extracted page data for later use
      cachedPageData = response.pageData;
      cachedTabId = tab.id;
      cachedTabUrl = tab.url;
      console.log("[WebChat] Page data cached, waiting for mode selection.");
    }

    if (response && !response.isOpen) {
      // Panel closed — clear cache
      cachedPageData = null;
      cachedTabId = null;
      cachedTabUrl = null;
    }

  } catch (err) {
    console.error("[WebChat] Toggle error:", err);
  }
});


// ============================================================
// 2. MESSAGES FROM APP.TSX (mode selection + site confirmation)
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // --- SINGLE PAGE INGESTION ---
  if (message.action === "INGEST_SINGLE_PAGE") {
    if (!cachedPageData || !cachedTabId || !cachedTabUrl) {
      console.error("[WebChat] No cached page data for single page ingestion.");
      return;
    }
    runSinglePageIngestion(cachedTabId, cachedTabUrl, cachedPageData);
    sendResponse({ ok: true });
    return true;
  }

  // --- DISCOVER SITE (step 1 of full site flow) ---
  if (message.action === "DISCOVER_SITE") {
    if (!cachedTabUrl || !cachedTabId) {
      console.error("[WebChat] No cached tab URL for site discovery.");
      return;
    }
    runSiteDiscovery(cachedTabId, cachedTabUrl);
    sendResponse({ ok: true });
    return true;
  }

  // --- INGEST SITE CONFIRMED (step 2 of full site flow) ---
  if (message.action === "INGEST_SITE_CONFIRMED") {
    if (!cachedTabUrl || !cachedTabId) {
      console.error("[WebChat] No cached tab URL for site ingestion.");
      return;
    }
    runSiteIngestion(cachedTabId, cachedTabUrl);
    sendResponse({ ok: true });
    return true;
  }
});


// ============================================================
// 3. SINGLE PAGE INGESTION RUNNER
// ============================================================
async function runSinglePageIngestion(tabId, tabUrl, pageData) {
  console.log("[WebChat] Starting single page ingestion:", tabUrl);

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
      // Forward every SSE event to the React UI
      chrome.tabs.sendMessage(tabId, {
        action: "INGESTION_PROGRESS",
        status: data.status,
        message: data.message,
        elapsed: data.elapsed ?? null,
      }).catch(() => {});
    });

  } catch (err) {
    console.error("[WebChat] Single page ingestion error:", err);
    chrome.tabs.sendMessage(tabId, {
      action: "INGESTION_PROGRESS",
      status: "failed",
      message: `❌ Connection error: ${err.message}`,
    }).catch(() => {});
  }
}


// ============================================================
// 4. SITE DISCOVERY RUNNER
// ============================================================
async function runSiteDiscovery(tabId, tabUrl) {
  console.log("[WebChat] Discovering pages for:", tabUrl);

  try {
    const res = await fetch("http://localhost:8000/discover-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tabUrl }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const result = await res.json();

    // Send discovery result to App.tsx for confirmation dialog
    chrome.tabs.sendMessage(tabId, {
      action: "DISCOVER_RESULT",
      result,
    }).catch(() => {});

  } catch (err) {
    console.error("[WebChat] Discovery error:", err);
    chrome.tabs.sendMessage(tabId, {
      action: "DISCOVER_RESULT",
      error: `Discovery failed: ${err.message}`,
    }).catch(() => {});
  }
}


// ============================================================
// 5. FULL SITE INGESTION RUNNER
// ============================================================
async function runSiteIngestion(tabId, tabUrl) {
  console.log("[WebChat] Starting full site ingestion:", tabUrl);

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
      // Forward progress to React UI
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
        chrome.notifications.create("site-index-complete", {
          type: "basic",
          iconUrl: "vite.svg",
          title: "WebChat — Indexing Complete",
          message: data.message ?? "Your site is ready to chat with.",
        });
      }
    });

  } catch (err) {
    console.error("[WebChat] Site ingestion error:", err);
    chrome.tabs.sendMessage(tabId, {
      action: "SITE_INGESTION_PROGRESS",
      status: "failed",
      message: `❌ Connection error: ${err.message}`,
    }).catch(() => {});
  }
}


// ============================================================
// 6. SHARED SSE STREAM READER UTILITY
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
          console.warn("[WebChat] SSE parse error:", e);
        }
      }
    }
  }
}


// ============================================================
// 7. CHAT PORT — TOKEN STREAMING
// ============================================================
chrome.runtime.onConnect.addListener((port) => {

  // Keepalive port — just receive pings to stay alive
  if (port.name === "webchat-keepalive") {
    port.onMessage.addListener(() => {
      // Receiving the ping is enough — no action needed
    });
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
              console.warn("[WebChat] Token parse error:", e);
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