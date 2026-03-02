// Inject injected.js into the page
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injected.js');
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);

// Listen for messages from the page
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || typeof event.data !== "object") return;
  if (event.data.type !== "API_CAPTURE") return;

  chrome.runtime.sendMessage({
    ...(event.data.payload || {}),
    pageUrl: window.location.href,
    pageTitle: document.title
  });
});
