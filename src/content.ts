console.log("WebChat Content Script injected successfully!");

// Listen for messages broadcasted from our React Side Panel
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  
  // Check if the message is our specific command
  if (request.action === "EXTRACT_PAGE_TEXT") {
    console.log("WebChat: Extraction command received.");
    
    // Grab the raw, rendered text from the webpage's body
    const pageText = document.body.innerText;
    const pageUrl = window.location.href;
    
    // Send the extracted data back to the React app
    sendResponse({ url: pageUrl, text: pageText });
  }
  
  // Return true to tell Chrome we will send the response asynchronously
  return true; 
});