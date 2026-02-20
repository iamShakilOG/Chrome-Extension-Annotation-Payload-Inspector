document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("data");

  chrome.storage.local.get({ apiLogs: [] }, (res) => {
    const logs = res.apiLogs || [];

    if (!logs.length) {
      container.textContent = "No annotation captured.";
      return;
    }

    const modes = {
      ANNOTATION_MODE: null,
      QA_MODE: null
    };

    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (!log || !String(log.url || "").includes("getAnnotations")) continue;

      const url = String(log.url || "");
      const mode = url.includes("QA_MODE")
        ? "QA_MODE"
        : (url.includes("ANNOTATION_MODE") ? "ANNOTATION_MODE" : null);

      if (!mode || modes[mode]) continue;

      try {
        const parsed = JSON.parse(log.body || "{}");
        if (Array.isArray(parsed.annotationData) && parsed.annotationData.length) {
          modes[mode] = {
            log,
            annotations: parsed.annotationData
          };
        }
      } catch (_) {
        // Continue searching older logs if current payload is not valid JSON.
      }

      if (modes.ANNOTATION_MODE && modes.QA_MODE) break;
    }

    if (!modes.ANNOTATION_MODE && !modes.QA_MODE) {
      container.textContent = "No parseable QA_MODE/ANNOTATION_MODE payload found.";
      return;
    }

    container.innerHTML = "";
    ["ANNOTATION_MODE", "QA_MODE"].forEach((modeName) => {
      const modeData = modes[modeName];
      if (!modeData) return;

      const item = document.createElement("div");
      item.className = "item";
      item.style.marginBottom = "10px";

      const row = document.createElement("div");
      row.className = "row";

      const method = document.createElement("span");
      method.className = "method";
      method.textContent = modeName;

      const time = document.createElement("span");
      time.className = "time";
      time.textContent = modeData.log.time || "";

      row.appendChild(method);
      row.appendChild(time);

      const summary = document.createElement("pre");
      const lines = modeData.annotations.map((a, index) => {
        const imageServiceId = a?.imageServiceId || "N/A";
        const annotatedByEmail = a?.annotatedByEmail || "N/A";
        return `${index + 1}. imageServiceId: ${imageServiceId}\n   annotatedByEmail: ${annotatedByEmail}`;
      });
      summary.textContent = lines.join("\n\n");

      item.appendChild(row);
      item.appendChild(summary);
      container.appendChild(item);
    });
  });
});
