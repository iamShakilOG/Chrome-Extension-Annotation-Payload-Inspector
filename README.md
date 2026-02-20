# Annotation Payload Inspector (Chrome Extension)

A Chrome extension that captures network responses and selected console logs, then shows extracted annotation details in the popup.

## What It Shows

From `getAnnotations` responses, the popup extracts and displays:

- `imageServiceId`
- `annotatedByEmail`

For both modes (when available):

- `ANNOTATION_MODE`
- `QA_MODE`

## Project Structure

```text
network_info chrome extension/
  manifest.json
  background.js
  content.js
  injected.js
  popup.html
  popup.js
```

## How It Works

1. `content.js` injects `injected.js` into the page context.
2. `injected.js` captures `fetch`, `XMLHttpRequest`, and console logs and posts them to the page.
3. `content.js` forwards captured payloads to the extension service worker.
4. `background.js` stores recent logs in `chrome.storage.local`.
5. `popup.js` parses the latest valid `getAnnotations` payload(s) and renders extracted fields.

## Install (Developer Mode)

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the folder: `network_info chrome extension`.

## Usage

1. Open the target web app page.
2. Trigger API requests that include `getAnnotations`.
3. Open the extension popup.
4. View extracted entries under `ANNOTATION_MODE` and `QA_MODE`.

## Notes

- Stored logs are capped (latest entries only).
- Annotation response bodies are stored with a higher size limit to allow JSON parsing.
- If popup shows no data, reload extension and refresh the page once.

## Security / Privacy

- The extension uses `host_permissions: ["<all_urls>"]` to capture requests broadly.
- Do not use this on sensitive pages unless this behavior is intended.
- Review and tighten `matches`/permissions before production use.
