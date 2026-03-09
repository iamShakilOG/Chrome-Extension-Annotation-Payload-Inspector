// Intercept fetch
const originalFetch = window.fetch;

function readHeaderValue(headers, key) {
  if (!headers) return "";

  try {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      return headers.get(key) || "";
    }
  } catch (_) {}

  if (Array.isArray(headers)) {
    const pair = headers.find((h) => String(h?.[0] || "").toLowerCase() === key.toLowerCase());
    return pair?.[1] || "";
  }

  if (typeof headers === "object") {
    const direct = headers[key];
    if (direct) return String(direct);
    const lowered = headers[key.toLowerCase()];
    if (lowered) return String(lowered);
  }

  return "";
}

window.fetch = async (...args) => {
  const input = args[0];
  const init = args[1] || {};
  const requestHeaders = init?.headers || input?.headers || null;
  const requestEmail = readHeaderValue(requestHeaders, "email");
  const authorization = readHeaderValue(requestHeaders, "authorization");
  const authToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7)
    : "";

  const response = await originalFetch(...args);
  const clone = response.clone();

  clone.text().then(body => {
    window.postMessage({
      type: "API_CAPTURE",
      payload: {
        url: response.url,
        method: "FETCH",
        body: body,
        requestEmail,
        authToken
      }
    }, "*");
  });

  return response;
};

// Intercept XHR
(function() {
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__apiCaptureUrl = url;
    this.__apiCaptureHeaders = {};

    this.addEventListener("load", function() {
      const emailHeader = this.__apiCaptureHeaders?.email || "";
      const authHeader = this.__apiCaptureHeaders?.authorization || "";
      const authToken = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7)
        : "";

      window.postMessage({
        type: "API_CAPTURE",
        payload: {
          url: this.responseURL || this.__apiCaptureUrl || url,
          method: method,
          body: this.responseText,
          requestEmail: emailHeader,
          authToken
        }
      }, "*");
    });
    origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (!this.__apiCaptureHeaders) this.__apiCaptureHeaders = {};
    const k = String(header || "").toLowerCase();
    if (k === "authorization" || k === "email") {
      this.__apiCaptureHeaders[k] = String(value || "");
    }
    origSetRequestHeader.apply(this, arguments);
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
