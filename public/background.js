/* global chrome */

console.log('WebChat Background Worker booted!');

// Listen for the user clicking the extension icon in the toolbar
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // Send a message to the content script inside the current tab to toggle the UI
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_UI" }).catch((err) => {
      console.log("Could not send toggle message. Content script might not be injected yet.", err);
    });
  }
});