import React from 'react';
import { createRoot } from 'react-dom/client';
import { Readability } from '@mozilla/readability'; // Imported Mozilla Engine
import App from './App';

import tailwindCss from './index.css?inline'; 

console.log("WebChat: Content Script Injected & Ready!");

// --- THE DISCUSSSED HYBRID EXTRACTION ENGINE ---
function extractPageContent(): { title: string; text: string; source: string } {
  try {
    // 1. Try Mozilla Readability First
    // Clone the document so Readability doesn't mutate or break the live UI
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone, {
      charThreshold: 200, // Minimum characters required to treat it as a valid article
    });
    
    const article = reader.parse();

    // Verify Readability found substantial content
    if (article && article.textContent && article.textContent.trim().length > 300) {
      return {
        title: article.title || document.title,
        text: article.textContent.trim(),
        source: 'mozilla-readability'
      };
    }
  } catch (error) {
    console.warn("[WebChat] Readability failed, dropping to fallback chain:", error);
  }

  // 2. FALLBACK LAYER: Semantic-Cleaned innerText
  // Runs if Readability returns null or the text chunk is too short
  console.log("[WebChat] Using semantic fallback extraction.");
  const clonedBody = document.body.cloneNode(true) as HTMLElement;
  
  // Strip out clutter tags that pollute LLM context
  const noiseSelectors = 'nav, footer, header, aside, script, style, noscript, iframe, svg, [role="banner"], [role="navigation"]';
  clonedBody.querySelectorAll(noiseSelectors).forEach(element => element.remove());

  const fallbackText = clonedBody.innerText || clonedBody.textContent || "";

  return {
    title: document.title,
    text: fallbackText.replace(/\s+/g, ' ').trim(), // Clean up chaotic spacing
    source: 'vanilla-fallback'
  };
}

// --- EXISTING UI SETUP ---
const hostElement = document.createElement('div');
hostElement.id = 'webchat-extension-root';
hostElement.style.position = 'fixed';
hostElement.style.top = '0';
hostElement.style.right = '0';
hostElement.style.zIndex = '9999999'; 
document.body.appendChild(hostElement);

const shadowRoot = hostElement.attachShadow({ mode: 'open' });

const styleElement = document.createElement('style');
styleElement.textContent = tailwindCss;
shadowRoot.appendChild(styleElement);

const reactRootElement = document.createElement('div');
reactRootElement.id = 'react-root';
reactRootElement.style.height = '100vh';
reactRootElement.style.width = '0px'; 
reactRootElement.style.overflow = 'hidden'; 
reactRootElement.style.transition = 'width 0.3s ease-in-out, box-shadow 0.3s ease-in-out';
shadowRoot.appendChild(reactRootElement);

const root = createRoot(reactRootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// --- MESSAGING HANDSHAKE ---
let isOpen = false;
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "TOGGLE_UI") {
    isOpen = !isOpen;
    
    reactRootElement.style.width = isOpen ? '400px' : '0px';
    reactRootElement.style.boxShadow = isOpen ? '-10px 0px 30px rgba(0,0,0,0.2)' : 'none';
    
    let pageData = null;
    if (isOpen) {
      // Execute the exact hybrid pipeline on open
      pageData = extractPageContent();
      console.log(`[WebChat] Extracted via ${pageData.source}. Length: ${pageData.text.length} chars.`);
    }

    sendResponse({ 
      status: "Toggled", 
      isOpen,
      pageData 
    });
  }
  return true;
});