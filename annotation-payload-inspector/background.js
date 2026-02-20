chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;

  const url = String(msg.url || "N/A");
  const isAnnotationPayload = url.includes("getAnnotations");
  const rawBody = String(msg.body || "");
  const maxBodyLength = isAnnotationPayload ? 200000 : 5000;

  const entry = {
    url,
    method: msg.method || "LOG",
    body: rawBody.substring(0, maxBodyLength),
    time: new Date().toLocaleTimeString()
  };

  chrome.storage.local.get({ apiLogs: [] }, (res) => {
    const logs = Array.isArray(res.apiLogs) ? res.apiLogs : [];
    const updatedLogs = [...logs, entry].slice(-100);
    chrome.storage.local.set({ apiLogs: updatedLogs });
  });
});
