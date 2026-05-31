import React from 'react';
import { createRoot } from 'react-dom/client';
import { Readability } from '@mozilla/readability';
import App from './App';

import tailwindCss from './index.css?inline';

console.log("WebChat: Content Script Injected & Ready!");

// ============================================================
// EXTENSION CONTEXT VALIDITY CHECK
// Must be called before any chrome.runtime.* call
// after an extension reload the context becomes invalid
// and any chrome.runtime call will throw
// ============================================================
function isExtensionContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// ============================================================
// HYBRID EXTRACTION ENGINE
// Layer 1: Mozilla Readability (best for articles + docs)
// Layer 2: Semantic fallback (strips noise tags from innerText)
// ============================================================
function extractPageContent(): { title: string; text: string; source: string } {
  try {
    // Clone the document so Readability doesn't mutate the live DOM
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone, {
      charThreshold: 200,
    });

    const article = reader.parse();

    // Only use Readability output if it found substantial content
    if (article && article.textContent && article.textContent.trim().length > 300) {
      return {
        title: article.title || document.title,
        text: article.textContent.trim(),
        source: 'mozilla-readability',
      };
    }
  } catch (error) {
    console.warn("[WebChat] Readability failed, dropping to fallback:", error);
  }

  // Layer 2: Semantic fallback
  // Runs if Readability returns null or content is too short
  console.log("[WebChat] Using semantic fallback extraction.");
  const clonedBody = document.body.cloneNode(true) as HTMLElement;

  // Remove tags that are never content
  const noiseSelectors = [
    'nav', 'footer', 'header', 'aside',
    'script', 'style', 'noscript',
    'iframe', 'svg',
    '[role="banner"]',
    '[role="navigation"]',
  ].join(', ');

  clonedBody.querySelectorAll(noiseSelectors).forEach((el) => el.remove());

  const fallbackText = clonedBody.innerText || clonedBody.textContent || "";

  return {
    title: document.title,
    text: fallbackText.replace(/\s+/g, ' ').trim(),
    source: 'vanilla-fallback',
  };
}

// ============================================================
// SHADOW DOM SETUP
// Isolates React app and Tailwind CSS from host page styles
// ============================================================
const hostElement = document.createElement('div');
hostElement.id = 'webchat-extension-root';
hostElement.style.position = 'fixed';
hostElement.style.top = '0';
hostElement.style.right = '0';
hostElement.style.zIndex = '9999999';
document.body.appendChild(hostElement);

const shadowRoot = hostElement.attachShadow({ mode: 'open' });

// Inject Tailwind CSS inside the shadow DOM
// ?inline import gives us the compiled CSS as a string
const styleElement = document.createElement('style');
styleElement.textContent = tailwindCss;
shadowRoot.appendChild(styleElement);

// React mount point inside shadow DOM
const reactRootElement = document.createElement('div');
reactRootElement.id = 'react-root';
reactRootElement.style.height = '100vh';
reactRootElement.style.width = '0px';
reactRootElement.style.overflow = 'hidden';
reactRootElement.style.transition = 'width 0.3s ease-in-out, box-shadow 0.3s ease-in-out';
shadowRoot.appendChild(reactRootElement);

// Mount React
const root = createRoot(reactRootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ============================================================
// MESSAGING HANDSHAKE
// Listens for TOGGLE_UI from background.js
// Returns pageData on open so background.js can start ingestion
// ============================================================
let isOpen = false;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Guard: stop if extension context was invalidated by a reload
  if (!isExtensionContextValid()) return;

  if (request.action === "TOGGLE_UI") {
    isOpen = !isOpen;

    reactRootElement.style.width = isOpen ? '400px' : '0px';
    reactRootElement.style.boxShadow = isOpen
      ? '-10px 0px 30px rgba(0,0,0,0.2)'
      : 'none';

    let pageData = null;
    if (isOpen) {
      pageData = extractPageContent();
      console.log(
        `[WebChat] Extracted via ${pageData.source}. Length: ${pageData.text.length} chars.`
      );
    }

    sendResponse({
      status: "Toggled",
      isOpen,
      pageData,
    });
  }

  return true; // Keep message channel open for async response
});

// ============================================================
// MANIFEST V3 KEEPALIVE HEARTBEAT
// Service workers in MV3 die after ~30s of inactivity
// This ping every 25s keeps background.js alive during
// long ingestion operations
// ============================================================
let keepAlivePort: chrome.runtime.Port | null = null;
let keepAliveInterval: number | null = null;

function connectKeepAlive() {
  // Don't attempt if context is already dead
  if (!isExtensionContextValid()) {
    console.log("[WebChat] Extension context invalidated. Keepalive stopped.");
    return;
  }

  try {
    keepAlivePort = chrome.runtime.connect({ name: 'webchat-keepalive' });

    keepAlivePort.onDisconnect.addListener(() => {
      // Clean up interval when port drops
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }

      // Only attempt reconnect if context is still alive
      if (isExtensionContextValid()) {
        setTimeout(connectKeepAlive, 1000);
      }
    });

    // Ping background.js every 25 seconds
    keepAliveInterval = window.setInterval(() => {
      // Check context validity on every ping
      if (!isExtensionContextValid()) {
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        keepAliveInterval = null;
        keepAlivePort = null;
        return;
      }

      try {
        keepAlivePort?.postMessage({ ping: 'stay-alive' });
      } catch {
        // Port died silently — onDisconnect will handle reconnect
      }
    }, 25000);

  } catch (err) {
    console.warn("[WebChat] Keepalive connect failed:", err);
  }
}

connectKeepAlive();