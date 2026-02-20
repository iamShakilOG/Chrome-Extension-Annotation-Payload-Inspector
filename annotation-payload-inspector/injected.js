// Intercept fetch
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const clone = response.clone();

  clone.text().then(body => {
    window.postMessage({
      type: "API_CAPTURE",
      payload: {
        url: response.url,
        method: "FETCH",
        body: body
      }
    }, "*");
  });

  return response;
};

// Intercept XHR
(function() {
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.addEventListener("load", function() {
      window.postMessage({
        type: "API_CAPTURE",
        payload: {
          url: url,
          method: method,
          body: this.responseText
        }
      }, "*");
    });
    origOpen.apply(this, arguments);
  };
})();

// Intercept console logs as log-based annotations may appear there.
(function() {
  const levels = ["log", "info", "warn", "error"];

  for (const level of levels) {
    const original = console[level];
    console[level] = function(...args) {
      try {
        const body = args.map((arg) => {
          if (typeof arg === "string") return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }).join(" ");

        window.postMessage({
          type: "API_CAPTURE",
          payload: {
            url: "console://",
            method: `CONSOLE_${level.toUpperCase()}`,
            body
          }
        }, "*");
      } catch (_) {
        // Never block the original console behavior.
      }

      return original.apply(this, args);
    };
  }
})();
