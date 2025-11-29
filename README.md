# Heidi Cursor – Floating EMR Helper Agent

A floating Electron desktop application that pairs a Heidi session with a live EMR window.
It captures the EMR screen, extracts structured fields with OCR + AI, and lets you paste them back using global keyboard shortcuts.

## Demo

[![Watch the demo video](https://cdn.loom.com/sessions/thumbnails/7afb75ed4c4c4c2ebe5e8fbc8bddfa7a-with-play.gif)](https://www.loom.com/share/7afb75ed4c4c4c2ebe5e8fbc8bddfa7a)

[Watch a demo video →](https://www.loom.com/share/7afb75ed4c4c4c2ebe5e8fbc8bddfa7a)

## Features

- **Floating Heidi icon & panel**: Always-on-top floating icon that opens a branded Heidi side panel on the right.
- **EMR pairing**: Dedicated pairing window to select the EMR window. The panel header shows `Heidi Cursor <> [EMR window title]` when linked.
- **Window management**: When the panel is shown, Heidi and the EMR window are pushed/resized; they are restored when the panel is closed or you disconnect.
- **Screen-aware capture**: Press a shortcut to capture the EMR window, run OCR + AI, and infer structured session fields.
- **Field preview list**: All session fields are shown in a list with the current field highlighted and truncated values for quick scanning.
- **Keyboard-first workflow**: Global shortcuts work even when the panel is not focused (see **Keyboard Shortcuts** below).
- **Demo session integration**: When no fields exist, a demo Heidi session ID and four clickable tiles fetch real data from the Heidi API and add fields.
- **Heidi API integration**: Typed client for sessions, consult notes, documents, Ask Heidi, etc., using JWTs from the Heidi `/jwt` endpoint.
- **Debug & dev tools**: A debug panel (only enabled when there are session fields) and an extra Heidi API dev panel in development builds.

## Prerequisites

- Node.js 18+ and npm
- macOS (for keyboard automation and screen capture)
- **Tesseract OCR**: Install via:

  ```bash
  brew install tesseract
  ```

- **macOS permissions**:
  - Accessibility permissions (System Settings → Privacy & Security → Accessibility)
  - Screen Recording permissions (System Settings → Privacy & Security → Screen Recording)

## Environment Variables

The app reads configuration from environment variables (via `.env` or the shell environment).

### Heidi API (optional but required for Heidi-powered features)

To enable Heidi API integration for sessions, demo tiles, and other Heidi features:

- `HEIDI_API_KEY`: Your Heidi API shared key (required to talk to the Heidi API).
- `HEIDI_API_BASE_URL`: Optional override for the Heidi API base URL.  
  Defaults to:

  ```text
  https://registrar.api.heidihealth.com/api/v2/ml-scribe/open-api
  ```

Example `.env`:

```bash
HEIDI_API_KEY=your_api_key_here
# Optional override if you are pointing at a non-default environment:
# HEIDI_API_BASE_URL=https://your-custom-heidi-base-url
```

> Never commit your `.env` file or API keys to version control.  
> If `HEIDI_API_KEY` is not set, the app still runs, but Heidi API features (demo session tiles, session overview fetches, etc.) are disabled.

## Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the project:

   ```bash
   npm run build
   ```

## Development

Run in development mode with hot reload:

```bash
npm run dev
```

This will:

- Start the Vite dev server for the renderer.
- Launch Electron with the development build.

## Usage

### First-time setup

1. **Grant Accessibility & Screen Recording permissions** (macOS):

   - System Settings → Privacy & Security → Accessibility → add the Electron app.
   - System Settings → Privacy & Security → Screen Recording → add the Electron app.

2. **Start the agent**:

   - Run `npm run dev` (development) or `npm start` after a build.
   - A floating Heidi icon appears near the bottom-right of your screen.

3. **Pair with an EMR window**:

   - Click the floating icon to open the pairing window.
   - Select the EMR window tile you want to connect.
   - The main panel header will show `Heidi Cursor <> [EMR window title]`.
   - Clicking outside the pairing window closes it automatically.

4. **Capture and enrich session fields (⌥C)**:

   - Bring the linked EMR window to the front and make sure the relevant form area is visible.
   - Press **⌥C** (Alt+C) to capture the screen and enrich the current session.
   - OCR + AI will generate high‑confidence fields (e.g., patient name, DOB, reason for visit).
   - The field list in the panel updates with all session fields, and the first field is selected.

5. **Navigate & paste fields (⌥W / ⌥S / ⌥V)**:

   - Use **⌥W** / **⌥S** to move the selection up/down in the field list.
   - Press **⌥V** to paste the current field’s value into the active EMR field.
   - After a successful paste, the selection automatically advances to the next field.

6. **Clear session (⌥X)**:

   - Press **⌥X** to clear all current session fields and reset the workflow.

7. **Toggle panel & disconnect (⌥Y / ⌥D / ⌥Tab)**:
   - **⌥Y** toggles the main panel open/closed, pushing/resizing the EMR window when open.
   - **⌥D** disconnects from the linked EMR, restores both Heidi and EMR windows to full width, and closes the panel.
   - **⌥Tab** switches focus between Heidi and the linked EMR window.

### Demo session tiles

When there are **no session fields**:

- The panel shows:
  - `No session fields available. Press ⌥C to capture screen.`
  - A demo Heidi session ID (hard-coded) on its own line.
  - A 2×2 grid of demo tiles:
    - Session name
    - Session gist
    - Consult note heading
    - Consult note summary

Clicking a tile:

- Fetches a real session overview from the Heidi API using the hard‑coded demo session ID.
- Extracts the relevant value (e.g., `session_name`, `session_gist`, or consult note fields).
- Adds a new field to the session list so it is ready to paste via the usual shortcuts.

> Note: This requires a valid `HEIDI_API_KEY` and a Heidi account that can access the demo session.  
> If the Heidi API returns an error (for example “Linked Account is required”), the error is shown below the tiles.

### Debug and developer UI

- **Show Debug**:

  - A small “Show Debug” button appears under the keyboard shortcuts.
  - It is only enabled when there is at least one session field.
  - When disabled, it is semi‑transparent with a blocked cursor and cannot be clicked.
  - When enabled, it toggles a debug panel with internal state and logs.

- **Heidi API panel (development only)**:
  - In development (`NODE_ENV=development`), an extra “Show Heidi API” button appears.
  - This opens a small dev panel for manually triggering Heidi API calls.

## Keyboard Shortcuts (macOS Option = Alt)

All shortcuts are registered as global shortcuts (they work even when the panel is not focused):

- **⌥C**: Capture screen and enrich the current session (add/merge key→value pairs).
- **⌥W**: Move selection up (previous field).
- **⌥S**: Move selection down (next field).
- **⌥V**: Type the current field value into the active EMR field, then move to the next field.
- **⌥X**: Clear the current session fields.
- **⌥Y**: Toggle the main panel (slide in/out and push/restore windows).
- **⌥D**: Disconnect from the linked EMR, restore both windows, and close the panel.
- **⌥Tab**: Switch focus between Heidi and the linked EMR window.

## Architecture

- **Main Process** (`src/main.ts`): Electron main process that manages windows, IPC, global shortcuts, OCR/AI workflow orchestration, and window resizing.
- **Preload Script** (`src/preload.ts`): Secure bridge exposing a minimal `electronAPI` surface to the renderer.
- **Automation / Window Management**:
  - `src/automation/keyboardFiller.ts`: Keyboard automation using macOS AppleScript (Command+V paste, etc.).
  - AppleScript helpers in `src/main.ts` for moving/resizing the Heidi and EMR windows.
- **Screenshot Service** (`src/services/screenshot.ts`): Captures screenshots of the frontmost window or screen.
- **OCR Service** (`src/services/ocr.ts`): Extracts text from screenshots using Tesseract OCR.
- **Field Inference** (`src/services/fieldInference.ts`): Uses AI/LLM to infer structured session fields from OCR text.
- **Heidi API Client** (`src/services/heidiApiClient.ts`): Typed client for sessions, documents, consult notes, Ask Heidi, etc.
- **Heidi Types** (`src/types/heidi.ts`): Shared TypeScript types for Heidi API responses.
- **Renderer** (`renderer/`):
  - `renderer/App.tsx`: Main Heidi Cursor panel UI.
  - `renderer/components/IconApp.tsx`: Floating Heidi icon window.
  - `renderer/components/PairingApp.tsx`: EMR pairing window.
  - `renderer/components/FieldPreview.tsx`: Session field list and demo tiles.

## Project Structure

```text
heidi-cursor/
├── src/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts              # Preload script for IPC
│   ├── automation/
│   │   └── keyboardFiller.ts   # Keyboard automation service
│   ├── services/
│   │   ├── screenshot.ts       # Screenshot capture
│   │   ├── ocr.ts              # OCR integration
│   │   └── heidiApiClient.ts   # Heidi API client
│   ├── config/
│   │   └── heidiConfig.ts      # Heidi API configuration
│   ├── types/
│   │   └── heidi.ts            # Heidi API types
│   └── fieldsConfig.ts         # (Optional) Field definitions
├── renderer/
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Main Heidi Cursor component
│   └── components/             # React UI components
├── dist/                       # Build output
└── package.json
```

## Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

### Keyboard automation not working

- Ensure the app has **Accessibility** permissions in System Settings.
- Ensure the app has **Screen Recording** permissions.
- Make sure you have clicked into the target form field in the EMR before using shortcuts.
- Try restarting the app after granting permissions.

### Window / panel not appearing

- Check whether the main panel is slid out and only the floating icon is visible.
- Ensure the floating icon is not hidden behind the macOS dock or other overlays.
- If nothing appears, stop the dev process and rerun `npm run dev`.

### Heidi API errors

- Confirm `HEIDI_API_KEY` is set and valid.
- Check logs for messages like `Heidi API error: 400 ...`.
- If you see `Linked Account is required`, make sure the Heidi user associated with your JWT has a linked account configured in Heidi.

## Future Enhancements

- Additional EMR-specific heuristics for field matching.
- More robust multi-EMR support and window detection.
- Richer on-panel Heidi interactions (Ask Heidi, document creation flows, coding).
- History and undo functionality.

## License

behattieu
