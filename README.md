# Electron Floating EMR Helper Agent

A floating Electron desktop application that automates form filling using RPA (Robotic Process Automation). The agent can type field values into any application and automatically tab through form fields, similar to Cursor's tab completion experience.

## Features

- **Floating Window**: Always-on-top window that floats above other applications
- **Keyboard Automation**: Automatically types values and presses Tab to navigate between fields
- **Field Preview**: Shows current field being filled and preview of next field
- **Global Shortcuts**: Keyboard shortcuts work even when the window is not focused
- **Step-by-step Control**: Manual control over each field fill operation

## Prerequisites

- Node.js 18+ and npm
- macOS (for keyboard automation - requires accessibility permissions)

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

- Start the Vite dev server for the renderer
- Launch Electron with the development build

## Usage

### First Time Setup

1. **Grant Accessibility Permissions** (macOS):

   - Go to System Settings → Privacy & Security → Accessibility
   - Add the Electron app to the list of allowed apps
   - This is required for keyboard automation to work

2. **Prepare Your Form**:

   - Open the target application with the form you want to fill
   - Click into the first input field

3. **Start the Agent**:

   - Launch the Electron app
   - The floating window will appear in the top-right corner
   - Click "Start" or press `Cmd+Shift+S`

4. **Fill Fields**:
   - Click "Next Field" button or press `Cmd+Shift+Tab` to fill the current field and move to the next
   - The window shows which field is being filled and previews the next one

### Keyboard Shortcuts

- `Cmd+Shift+S`: Start the workflow
- `Cmd+Shift+Tab`: Fill current field and advance to next

### Demo Fields

The app comes pre-configured with demo fields:

- Patient Name: "John Smith"
- Date of Birth: "01/01/1980"
- Medicare / ID: "2525305501970924"
- Reason for Visit: "Follow-up for hypertension"
- Clinical Notes: "Patient reports improved BP control. Continue current medication regimen."

## Architecture

- **Main Process** (`src/main.ts`): Electron main process that manages the window, IPC, and global shortcuts
- **Preload Script** (`src/preload.ts`): Secure bridge between main and renderer processes
- **Automation Service** (`src/automation/keyboardFiller.ts`): Keyboard automation using macOS AppleScript (no native compilation required)
- **Renderer** (`renderer/`): React-based UI built with Vite
- **Field Config** (`src/fieldsConfig.ts`): Static field definitions (extendable to API calls)

## Project Structure

```
electron-floating-agent/
├── src/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # Preload script for IPC
│   ├── automation/
│   │   └── keyboardFiller.ts # Keyboard automation service
│   └── fieldsConfig.ts      # Field definitions
├── renderer/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Main app component
│   └── components/          # React components
├── dist/                    # Build output
└── package.json
```

## Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

### Keyboard automation not working

- Ensure the app has accessibility permissions in System Settings
- Try restarting the app after granting permissions
- Check that you're clicking into the target form field before using shortcuts

### Window not appearing

- Check if the window is hidden behind other windows
- Look for the Electron icon in the dock/menu bar
- Try restarting the app

## Future Enhancements

- Pull field values from Heidi API
- Support for multiple EMR systems
- Bi-directional sync between Heidi and EMR
- Automatic field detection
- Custom field templates
- History and undo functionality

## License

MIT
