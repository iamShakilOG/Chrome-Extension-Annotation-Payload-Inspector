// Paste your Google Apps Script Web App URL here to enable sheet sync.
// Example: https://script.google.com/macros/s/AKfycb.../exec
const SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyLny9-27PLVqk8EWxmMLpJc4VwwDRBVbbkDL18CqiY3nf9hCaXq6AvuKEaEOYXojJF/exec";

const MAX_LOGS = 100;
const MAX_SENT_KEYS = 5000;
const MAX_QUEUE_ROWS = 10000;
const BATCH_SIZE = 100;
const INITIAL_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const FLUSH_ALARM_NAME = "sheetFlush";
const FLUSH_INTERVAL_MINUTES = 1;

let syncInProgress = false;

function storageGet(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (res) => resolve(res));
  });
}

function storageSet(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.set(payload, () => resolve());
  });
}

function detectModeFromUrl(url) {
  if (url.includes("QA_MODE")) return "QA_MODE";
  if (url.includes("ANNOTATION_MODE")) return "ANNOTATION_MODE";
  return null;
}

function parseAnnotationData(bodyText) {
  try {
    const parsed = JSON.parse(bodyText || "{}");
    return Array.isArray(parsed.annotationData) ? parsed.annotationData : [];
  } catch (_) {
    return [];
  }
}

function parseLoggedInUser(bodyText) {
  try {
    const parsed = JSON.parse(bodyText || "{}");
    const user = parsed?.user;
    if (!user || typeof user !== "object") return null;
    return {
      id: user.id ?? "",
      name: user.name || "",
      email: user.email || user.canonicalEmail || ""
    };
  } catch (_) {
    return null;
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function parseLoggedInUserFromHeaders(msg) {
  if (!msg || typeof msg !== "object") return null;

  const requestEmail = extractEmail(String(msg.requestEmail || ""));
  const tokenPayload = decodeJwtPayload(String(msg.authToken || ""));
  const tokenEmail = extractEmail(String(tokenPayload?.email || tokenPayload?.canonicalEmail || ""));
  const tokenName = String(tokenPayload?.name || "");
  const tokenId = tokenPayload?.id ?? "";

  const email = tokenEmail || requestEmail || "";
  const name = tokenName || "";

  if (!email && !name) return null;
  return { id: tokenId, name, email };
}

function extractEmail(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function normalizeAnnotationData(annotationData) {
  if (!Array.isArray(annotationData)) return [];

  const firstValidEmail = annotationData
    .map((item) => extractEmail(item?.annotatedByEmail))
    .find((email) => Boolean(email)) || "";

  return annotationData.map((item) => {
    const currentEmail = extractEmail(item?.annotatedByEmail);
    return {
      ...item,
      annotatedByEmail: currentEmail || firstValidEmail || "N/A"
    };
  });
}

function buildSheetRows({
  mode,
  apiUrl,
  pageUrl,
  method,
  annotationData,
  sessionUserName,
  sessionUserEmail
}) {
  const capturedAtIso = new Date().toISOString();
  const capturedAtLocal = new Date().toLocaleString();
  const normalizedSessionEmail = extractEmail(String(sessionUserEmail || ""));

  return annotationData.map((item) => ({
    mode,
    annotatedByEmail:
      extractEmail(String(item?.annotatedByEmail || "")) || normalizedSessionEmail || "N/A",
    imageServiceId: item?.imageServiceId || "N/A",
    sessionUserName: sessionUserName || "N/A",
    sessionUserEmail: normalizedSessionEmail || "N/A",
    apiCapturedAtIso: capturedAtIso,
    apiCapturedAtLocal: capturedAtLocal,
    apiUrl: apiUrl || "N/A",
    pageUrl: pageUrl || "N/A",
    method: method || "N/A"
  }));
}

function rowKey(row) {
  return `${row.mode}|${row.annotatedByEmail}|${row.imageServiceId}|${row.sessionUserEmail}|${row.apiCapturedAtIso}`;
}

async function postRowsToWebhook(rows) {
  if (!SHEET_WEBHOOK_URL || !rows.length) return false;

  try {
    const response = await fetch(SHEET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows })
    });
    return response.ok;
  } catch (error) {
    console.error("Sheet sync failed:", error);
    return false;
  }
}

function nextBackoffMs(retryCount) {
  const exponent = Math.max(0, retryCount - 1);
  const wait = INITIAL_BACKOFF_MS * (2 ** exponent);
  return Math.min(wait, MAX_BACKOFF_MS);
}

async function storeLog(entry) {
  const res = await storageGet({ apiLogs: [] });
  const logs = Array.isArray(res.apiLogs) ? res.apiLogs : [];
  const updatedLogs = [...logs, entry].slice(-MAX_LOGS);
  await storageSet({ apiLogs: updatedLogs });
}

async function storeLatestModeSummary(mode, annotationData, timeLabel) {
  if (!mode || !Array.isArray(annotationData) || !annotationData.length) return;

  const uniqueAnnotatedBy = [
    ...new Set(
      annotationData
        .map((item) => item?.annotatedByEmail || "N/A")
        .filter(Boolean)
    )
  ];
  const imageServiceIds = annotationData
    .map((item) => item?.imageServiceId || "N/A")
    .filter(Boolean);

  const res = await storageGet({ latestModeData: {} });
  const latestModeData =
    res.latestModeData && typeof res.latestModeData === "object"
      ? res.latestModeData
      : {};

  latestModeData[mode] = {
    mode,
    time: timeLabel || new Date().toLocaleTimeString(),
    updatedAtIso: new Date().toISOString(),
    annotatedByEmail: uniqueAnnotatedBy,
    imageServiceIds
  };

  await storageSet({ latestModeData });
}

async function storeLoggedInUser(user) {
  if (!user || typeof user !== "object") return;

  await storageSet({
    loggedInUser: {
      id: user.id ?? "",
      name: user.name || "",
      email: user.email || "",
      updatedAtIso: new Date().toISOString()
    }
  });
}

async function ensureFlushAlarm() {
  chrome.alarms.create(FLUSH_ALARM_NAME, {
    delayInMinutes: FLUSH_INTERVAL_MINUTES,
    periodInMinutes: FLUSH_INTERVAL_MINUTES
  });
}

async function enqueueRows(rows) {
  if (!SHEET_WEBHOOK_URL || !rows.length) return;

  const res = await storageGet({ sheetSentKeys: [], sheetQueue: [] });
  const sentKeys = Array.isArray(res.sheetSentKeys) ? res.sheetSentKeys : [];
  const queue = Array.isArray(res.sheetQueue) ? res.sheetQueue : [];

  const sentSet = new Set(sentKeys);
  const queueSet = new Set(queue.map((row) => rowKey(row)));

  const newRows = rows.filter((row) => {
    const key = rowKey(row);
    if (sentSet.has(key)) return false;
    if (queueSet.has(key)) return false;
    return true;
  });

  if (!newRows.length) return;

  const updatedQueue = [...queue, ...newRows].slice(-MAX_QUEUE_ROWS);
  await storageSet({ sheetQueue: updatedQueue });
}

async function flushQueue() {
  if (!SHEET_WEBHOOK_URL || syncInProgress) return;

  syncInProgress = true;
  try {
    const now = Date.now();
    const res = await storageGet({
      sheetQueue: [],
      sheetSentKeys: [],
      sheetRetryCount: 0,
      sheetNextAttemptAt: 0
    });

    const queue = Array.isArray(res.sheetQueue) ? res.sheetQueue : [];
    const sentKeys = Array.isArray(res.sheetSentKeys) ? res.sheetSentKeys : [];
    const retryCount = Number(res.sheetRetryCount || 0);
    const nextAttemptAt = Number(res.sheetNextAttemptAt || 0);

    if (!queue.length) {
      await storageSet({ sheetRetryCount: 0, sheetNextAttemptAt: 0 });
      return;
    }

    if (now < nextAttemptAt) return;

    const batch = queue.slice(0, BATCH_SIZE);
    const ok = await postRowsToWebhook(batch);

    if (!ok) {
      const nextRetryCount = retryCount + 1;
      const waitMs = nextBackoffMs(nextRetryCount);
      await storageSet({
        sheetRetryCount: nextRetryCount,
        sheetNextAttemptAt: now + waitMs
      });
      return;
    }

    const remainingQueue = queue.slice(batch.length);
    const sentSet = new Set(sentKeys);
    batch.forEach((row) => sentSet.add(rowKey(row)));

    await storageSet({
      sheetQueue: remainingQueue,
      sheetSentKeys: Array.from(sentSet).slice(-MAX_SENT_KEYS),
      sheetRetryCount: 0,
      sheetNextAttemptAt: 0
    });

    // If there is more queued data, try one more batch in this wake cycle.
    if (remainingQueue.length) {
      syncInProgress = false;
      await flushQueue();
      return;
    }
  } finally {
    syncInProgress = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureFlushAlarm();
  flushQueue();
});

chrome.runtime.onStartup.addListener(() => {
  ensureFlushAlarm();
  flushQueue();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== FLUSH_ALARM_NAME) return;
  flushQueue();
});

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

  storeLog(entry);

  const headerUser = parseLoggedInUserFromHeaders(msg);
  let currentRequestUser = headerUser;
  if (headerUser) {
    storeLoggedInUser(headerUser);
  }

  if (url.includes("getUserData")) {
    const user = parseLoggedInUser(rawBody);
    if (user) {
      currentRequestUser = user;
      storeLoggedInUser(user);
    }
  }

  if (!isAnnotationPayload) return;

  const mode = detectModeFromUrl(url);
  if (!mode) return;

  const annotationData = parseAnnotationData(rawBody);
  if (!annotationData.length) return;
  const normalizedAnnotationData = normalizeAnnotationData(annotationData);

  storeLatestModeSummary(mode, normalizedAnnotationData, entry.time);
  storageGet({ loggedInUser: null }).then((state) => {
    const loggedInUser =
      state.loggedInUser && typeof state.loggedInUser === "object"
        ? state.loggedInUser
        : null;
    const fallbackEmailFromAnnotation =
      normalizedAnnotationData.find((item) => extractEmail(item?.annotatedByEmail))?.annotatedByEmail || "";

    const rows = buildSheetRows({
      mode,
      apiUrl: url,
      pageUrl: String(msg.pageUrl || ""),
      method: msg.method || "N/A",
      annotationData: normalizedAnnotationData,
      sessionUserName: currentRequestUser?.name || loggedInUser?.name || "",
      sessionUserEmail:
        currentRequestUser?.email || loggedInUser?.email || fallbackEmailFromAnnotation || ""
    });

    enqueueRows(rows).then(() => {
      flushQueue();
    });
  });
});
