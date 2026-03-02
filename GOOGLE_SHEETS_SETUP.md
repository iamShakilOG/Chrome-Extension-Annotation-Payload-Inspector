# Google Sheets Auto Sync Setup

This extension can auto-send captured `ANNOTATION_MODE` and `QA_MODE` rows to Google Sheets.

## 1) Create a Google Sheet

Create a sheet with headers in row 1:

1. `mode`
2. `annotatedByEmail`
3. `imageServiceId`
4. `apiCapturedAtIso`
5. `apiCapturedAtLocal`
6. `apiUrl`
7. `pageUrl`
8. `method`

## 2) Create Apps Script Web App

In the sheet:

1. `Extensions` -> `Apps Script`
2. Replace code with:

```javascript
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    rows.forEach((r) => {
      sheet.appendRow([
        r.mode || "",
        r.annotatedByEmail || "",
        r.imageServiceId || "",
        r.apiCapturedAtIso || "",
        r.apiCapturedAtLocal || "",
        r.apiUrl || "",
        r.pageUrl || "",
        r.method || ""
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, inserted: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. `Deploy` -> `New deployment`
4. Type: `Web app`
5. Execute as: `Me`
6. Who has access: `Anyone`
7. Deploy and copy the Web App URL.

## 3) Configure Extension

Edit `annotation-payload-inspector/background.js`:

- Set `SHEET_WEBHOOK_URL` to your Web App URL.

```javascript
const SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/....../exec";
```

## 4) Reload and Test

1. Reload extension in `chrome://extensions`.
2. Reload target page.
3. Trigger requests with `getAnnotations` + `QA_MODE` or `ANNOTATION_MODE`.
4. Confirm rows appear in the sheet.

