import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Magic Vite trick: the '?inline' grabs all our Tailwind CSS as a raw string
// so we can inject it safely inside the Shadow DOM!
import tailwindCss from './index.css?inline'; 

console.log("WebChat: Content Script Injected & Ready!");

// 1. Create the container div that will float on the screen
const hostElement = document.createElement('div');
hostElement.id = 'webchat-extension-root';

// Keep it fixed to the top right of the screen so it floats over the website
hostElement.style.position = 'fixed';
hostElement.style.top = '0';
hostElement.style.right = '0';
hostElement.style.zIndex = '9999999'; // Ensure it's above all website navbars
document.body.appendChild(hostElement);

// 2. Attach the bulletproof Shadow DOM to the container
const shadowRoot = hostElement.attachShadow({ mode: 'open' });

// 3. Inject our Tailwind CSS inside the Shadow DOM
const styleElement = document.createElement('style');
styleElement.textContent = tailwindCss;
shadowRoot.appendChild(styleElement);

// 4. Create the React Mount Point inside the Shadow DOM
const reactRootElement = document.createElement('div');
reactRootElement.id = 'react-root';

// Start it with a width of 0px (Hidden)
reactRootElement.style.height = '100vh';
reactRootElement.style.width = '0px'; 
reactRootElement.style.overflow = 'hidden'; // Hide content when closed
reactRootElement.style.transition = 'width 0.3s ease-in-out, box-shadow 0.3s ease-in-out';
shadowRoot.appendChild(reactRootElement);

// 5. Mount the React App
const root = createRoot(reactRootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 6. Listen for the background.js toggle command (when the user clicks the Chrome icon)
let isOpen = false;
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "TOGGLE_UI") {
    isOpen = !isOpen;
    // Slide it open to 400px wide, or close it to 0px
    reactRootElement.style.width = isOpen ? '400px' : '0px';
    reactRootElement.style.boxShadow = isOpen ? '-10px 0px 30px rgba(0,0,0,0.2)' : 'none';
    sendResponse({ status: "Toggled", isOpen });
  }
  return true;
});