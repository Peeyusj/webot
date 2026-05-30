/* eslint-disable no-constant-condition */
/* global chrome */

// 1. Core Ingestion Stream Reader Setup
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_UI" });

    if (response && response.isOpen && response.pageData) {
      // Open the POST SSE stream connection manually using fetch body streams
      const res = await fetch('http://localhost:8000/ingest-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab_id: tab.id,
          url: tab.url,
          title: response.pageData.title,
          text: response.pageData.text,
          source: response.pageData.source
        })
      });

      const reader = res.body.getReader();
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
            const data = JSON.parse(cleanLine.slice(6));
            
            // Forward the live ingestion progress packets directly into the open tab panel
            chrome.tabs.sendMessage(tab.id, { 
              action: "INGESTION_PROGRESS", 
              status: data.status,
              message: data.message 
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error("[WebChat Error]", err);
  }
});

// 2. Chat Port Connection Token Stream Setup
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "webchat-stream-port") return;

  port.onMessage.addListener(async (msg) => {
    const tabId = port.sender?.tab?.id;
    const tabUrl = port.sender?.tab?.url;
    if (!tabId || !tabUrl) return;

    try {
      const response = await fetch('http://localhost:8000/ask-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab_id: tabId,
          url: tabUrl,
          question: msg.question,
          history: msg.history
        })
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
            const parsedData = JSON.parse(cleanLine.slice(6));
            // Forward whatever comes out (sources dictionary or text token strings)
            port.postMessage(parsedData); 
          }
        }
      }
      port.postMessage({ type: "DONE" });

    } catch (err) {
      port.postMessage({ type: "ERROR", error: err.message });
    }
  });
});