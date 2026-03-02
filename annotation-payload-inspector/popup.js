document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("data");

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  }

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

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copy";

      const timeAndCopy = document.createElement("span");
      timeAndCopy.style.display = "flex";
      timeAndCopy.style.alignItems = "center";
      timeAndCopy.style.gap = "6px";
      timeAndCopy.appendChild(time);
      timeAndCopy.appendChild(copyBtn);

      row.appendChild(method);
      row.appendChild(timeAndCopy);

      const uniqueAnnotatedBy = [...new Set(
        modeData.annotations
          .map((a) => a?.annotatedByEmail || "N/A")
          .filter(Boolean)
      )];
      const imageServiceIds = modeData.annotations
        .map((a) => a?.imageServiceId || "N/A")
        .filter(Boolean);

      const summary = document.createElement("pre");
      const lines = [];
      lines.push(`annotatedByEmail: ${uniqueAnnotatedBy.join(", ") || "N/A"}`);
      lines.push("imageServiceId:");
      imageServiceIds.forEach((id, index) => {
        lines.push(`${index + 1}. ${id}`);
      });
      summary.textContent = lines.join("\n");

      copyBtn.addEventListener("click", async () => {
        const compact = [];
        compact.push(`annotatedByEmail: ${uniqueAnnotatedBy.join(", ") || "N/A"}\t${modeData.log.time || ""}`);
        imageServiceIds.forEach((id) => {
          compact.push(id);
        });
        const ok = await copyText(compact.join("\n"));
        copyBtn.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      });

      item.appendChild(row);
      item.appendChild(summary);
      container.appendChild(item);
    });
  });
});
