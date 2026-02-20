# Contributing

## Setup

1. Clone the repository.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Load unpacked extension from `network_info chrome extension`.

## Development Guidelines

- Keep changes focused and small.
- Preserve Manifest V3 compatibility.
- Avoid adding broad permissions unless required.
- Test popup output for both:
  - `ANNOTATION_MODE`
  - `QA_MODE`

## Manual Test Checklist

1. Reload extension.
2. Reload target web page.
3. Trigger `getAnnotations` calls.
4. Confirm popup displays `imageServiceId` and `annotatedByEmail`.

