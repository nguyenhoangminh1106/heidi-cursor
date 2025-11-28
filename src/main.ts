import { exec } from "child_process";
import "dotenv/config";
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  screen,
} from "electron";
import * as path from "path";
import { promisify } from "util";
import { pressCommandV } from "./automation/keyboardFiller";
import { captureFullScreen } from "./services/screenshot";
import {
  extractSessionFieldsFromImage,
  mergeSessionFields,
} from "./services/sessionFieldExtractor";
import { AgentState, SessionField } from "./types/agent";

let mainWindow: BrowserWindow | null = null;

// Panel visibility state
let isPanelVisible = false;
let savedWindowBounds: OriginalBounds | null = null;
let hasPushedWindow = false;

// Agent state
let agentState: AgentState = {
  status: "idle",
  sessionFields: [],
  currentIndex: 0,
};

// Type for storing original window bounds
interface OriginalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  appName: string;
}

const execAsync = promisify(exec);

/**
 * Update agent state and notify renderer
 */
function updateAgentState(partial: Partial<AgentState>): void {
  agentState = { ...agentState, ...partial };
  broadcastAgentState();
}

/**
 * Broadcast agent state to renderer
 */
function broadcastAgentState(): void {
  if (mainWindow) {
    mainWindow.webContents.send("agent:stateUpdated", {
      state: agentState,
    });
  }
}

/**
 * Get session fields or throw error
 */
function getSessionFieldsOrThrow(): SessionField[] {
  if (!agentState.sessionFields || agentState.sessionFields.length === 0) {
    throw new Error(
      "No session fields available. Please press ⌥C to capture screen and extract fields first."
    );
  }
  return agentState.sessionFields;
}

/**
 * Clamp index to valid range
 */
function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * Select previous session field (move selection up)
 */
function selectPreviousField(): void {
  try {
    const fields = getSessionFieldsOrThrow();
    if (fields.length === 0) {
      return; // No-op if no fields
    }

    const newIndex = clampIndex(agentState.currentIndex - 1, fields.length);
    updateAgentState({ currentIndex: newIndex });
    console.log(
      `[MAIN] Selected previous field: ${newIndex + 1}/${fields.length}`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to select previous field";
    updateAgentState({ status: "error", lastError: errorMessage });
    console.error("[MAIN] Error selecting previous field:", errorMessage);
  }
}

/**
 * Select next session field (move selection down)
 */
function selectNextField(): void {
  try {
    const fields = getSessionFieldsOrThrow();
    if (fields.length === 0) {
      return; // No-op if no fields
    }

    const newIndex = clampIndex(agentState.currentIndex + 1, fields.length);
    updateAgentState({ currentIndex: newIndex });
    console.log(`[MAIN] Selected next field: ${newIndex + 1}/${fields.length}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to select next field";
    updateAgentState({ status: "error", lastError: errorMessage });
    console.error("[MAIN] Error selecting next field:", errorMessage);
  }
}

/**
 * Type current session field value into active field
 */
async function pasteCurrentField(): Promise<void> {
  try {
    const fields = getSessionFieldsOrThrow();

    if (fields.length === 0) {
      const error = "No session fields available";
      updateAgentState({ status: "error", lastError: error });
      return;
    }

    const currentIndex = clampIndex(agentState.currentIndex, fields.length);
    const field = fields[currentIndex];

    if (!field.value) {
      const error = `Selected field "${field.label}" has no value`;
      updateAgentState({ status: "error", lastError: error });
      console.warn(`[MAIN] ${error}`);
      return;
    }

    console.log(
      `[MAIN] Typing field ${currentIndex + 1}/${fields.length}: "${
        field.label
      }" = "${field.value.substring(0, 50)}${
        field.value.length > 50 ? "..." : ""
      }"`
    );

    updateAgentState({ status: "typing", lastError: undefined });

    // Save current clipboard text to restore later
    const previousText = clipboard.readText();

    try {
      // Write value to clipboard as plain text
      clipboard.writeText(field.value ?? "");

      // Delay to ensure clipboard is fully set before proceeding
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Delay to ensure target field is focused and ready
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Trigger Command+V to paste from clipboard (reliable and preserves encoding)
      await pressCommandV();

      // Wait longer after paste to ensure paste operation completes before restoring clipboard
      // This is critical - if we restore too quickly, the paste might not complete
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      // Restore previous clipboard text after paste has completed
      try {
        // Delay before restoring to ensure paste is fully processed
        await new Promise((resolve) => setTimeout(resolve, 200));
        clipboard.writeText(previousText);
      } catch (restoreError) {
        console.warn(
          "[MAIN] Failed to restore previous clipboard text:",
          restoreError
        );
      }
    }

    updateAgentState({ status: "idle" });
    console.log("[MAIN] Typing (via paste) completed successfully");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to type field";
    updateAgentState({ status: "error", lastError: errorMessage });
    console.error("[MAIN] Error typing field:", errorMessage);

    // Provide helpful error message for accessibility issues
    if (error instanceof Error && error.message.includes("Accessibility")) {
      throw error; // Re-throw with helpful message
    }
    throw error;
  }
}

/**
 * Handle capture and enrich session (⌥C: capture screen and enrich session)
 */
async function handleCaptureAndEnrich(): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log("[MAIN] handleCaptureAndEnrich called (⌥C: capture and enrich)");

  try {
    updateAgentState({ status: "capturing", lastError: undefined });

    // Initialize session if needed
    if (!agentState.sessionId) {
      agentState.sessionId = `session_${Date.now()}`;
    }

    // Capture full screen
    const imageBuffer = await captureFullScreen();
    console.log("[MAIN] Captured screen for session field extraction");

    // Extract fields from screenshot
    const incomingFields = await extractSessionFieldsFromImage(imageBuffer);
    console.log(
      `[MAIN] Extracted ${incomingFields.length} fields from screenshot`
    );

    // Merge with existing session fields (prevent overlap)
    const mergedFields = mergeSessionFields(
      agentState.sessionFields,
      incomingFields
    );

    // Update state
    const newIndex =
      agentState.sessionFields.length === 0 && mergedFields.length > 0
        ? 0
        : clampIndex(agentState.currentIndex, mergedFields.length);

    updateAgentState({
      status: "idle",
      sessionFields: mergedFields,
      currentIndex: newIndex,
      lastError: undefined,
    });

    console.log(
      `[MAIN] Session enriched: ${mergedFields.length} total fields (added ${
        mergedFields.length - agentState.sessionFields.length
      } new)`
    );

    return { success: true };
  } catch (error) {
    console.error("[MAIN] Error in handleCaptureAndEnrich:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    updateAgentState({ status: "error", lastError: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Clear current session (reset for new direction)
 */
function clearSession(): void {
  console.log("[MAIN] clearSession called (⌥X: clear session)");
  updateAgentState({
    status: "idle",
    sessionId: undefined,
    sessionFields: [],
    currentIndex: 0,
    lastError: undefined,
  });
  console.log("[MAIN] Session cleared");
}

/**
 * Slide panel in from the right
 */
async function slideIn(panelWidth = 400): Promise<void> {
  if (!mainWindow || isPanelVisible) return;

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const duration = 300; // ms
  const steps = 30;
  const stepDelay = duration / steps;
  const startX = screenWidth;
  const endX = screenWidth - panelWidth;

  for (let i = 0; i <= steps; i++) {
    if (!mainWindow) break;
    const progress = i / steps;
    // Ease-out easing function for smooth animation
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const x = startX - (startX - endX) * easedProgress;
    mainWindow.setPosition(Math.round(x), 0);
    await new Promise((resolve) => setTimeout(resolve, stepDelay));
  }

  isPanelVisible = true;
  console.log("[MAIN] Panel slid in");
}

/**
 * Slide panel out to the right
 */
async function slideOut(panelWidth = 400): Promise<void> {
  if (!mainWindow || !isPanelVisible) return;

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const duration = 300; // ms
  const steps = 30;
  const stepDelay = duration / steps;
  const startX = screenWidth - panelWidth;
  const endX = screenWidth;

  for (let i = 0; i <= steps; i++) {
    if (!mainWindow) break;
    const progress = i / steps;
    // Ease-in easing function for smooth animation
    const easedProgress = Math.pow(progress, 3);
    const x = startX + (endX - startX) * easedProgress;
    mainWindow.setPosition(Math.round(x), 0);
    await new Promise((resolve) => setTimeout(resolve, stepDelay));
  }

  isPanelVisible = false;
  console.log("[MAIN] Panel slid out");
}

/**
 * Push frontmost macOS window to make room for panel
 */
async function pushFrontmostWindow(
  panelWidth: number
): Promise<OriginalBounds | null> {
  if (process.platform !== "darwin") {
    console.log("[MAIN] Window pushing only supported on macOS");
    return null;
  }

  try {
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;
    const appName = app.getName();

    console.log(
      `[MAIN] Attempting to push frontmost window (our app: ${appName})`
    );

    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        
        -- Log for debugging
        log "Frontmost app: " & frontApp
        
        -- If frontmost is our app, try to find the largest other window
        if frontApp contains "Electron" or frontApp is "${appName}" or frontApp contains "electron-floating-agent" then
          -- Find largest non-Electron window by iterating through ALL windows
          set largestWindow to missing value
          set largestArea to 0
          set targetApp to missing value
          set targetWindowIndex to 0
          
          repeat with proc in (every application process whose visible is true)
            set procName to name of proc
            if procName does not contain "Electron" and procName is not "${appName}" and procName does not contain "electron-floating-agent" then
              try
                tell process procName
                  set windowList to every window
                  set windowCount to count of windowList
                  
                  if windowCount > 0 then
                    repeat with i from 1 to windowCount
                      try
                        set win to item i of windowList
                        set winSize to size of win
                        set winWidth to item 1 of winSize
                        set winHeight to item 2 of winSize
                        set winArea to winWidth * winHeight
                        
                        -- Check if window is resizable and wide enough
                        if winWidth > ${panelWidth} then
                          if winArea > largestArea then
                            set largestArea to winArea
                            set targetApp to procName
                            set targetWindowIndex to i
                          end if
                        end if
                      end try
                    end repeat
                  end if
                end tell
              end try
            end if
          end repeat
          
          if targetApp is not missing value and targetWindowIndex > 0 then
            tell process targetApp
              set targetWin to item targetWindowIndex of (every window)
              set windowSize to size of targetWin
              set windowPosition to position of targetWin
              set windowWidth to item 1 of windowSize
              set windowHeight to item 2 of windowSize
              set windowX to item 1 of windowPosition
              set windowY to item 2 of windowPosition
              
              set newWidth to ${screenWidth} - ${panelWidth}
              set position of targetWin to {0, windowY}
              set size of targetWin to {newWidth, windowHeight}
              return targetApp & "|" & windowX & "|" & windowY & "|" & windowWidth & "|" & windowHeight
            end tell
          else
            return "skip|" & frontApp & "|no_suitable_window"
          end if
        end if
        
        -- Handle frontmost app (not our app)
        tell process frontApp
          try
            set windowList to every window
            set windowCount to count of windowList
            
            if windowCount is 0 then
              return "no_window|" & frontApp
            end if
            
            -- Find the main window (usually the largest or first accessible one)
            set mainWindow to missing value
            set mainWindowArea to 0
            
            repeat with i from 1 to windowCount
              try
                set win to item i of windowList
                set winSize to size of win
                set winWidth to item 1 of winSize
                set winHeight to item 2 of winSize
                set winArea to winWidth * winHeight
                
                -- Check if window is fullscreen
                try
                  set isFullscreen to value of attribute "AXFullscreen" of win
                  if isFullscreen is true then
                    return "fullscreen|" & frontApp
                  end if
                end try
                
                -- Prefer larger windows, but must be wide enough
                if winWidth > ${panelWidth} and winArea > mainWindowArea then
                  set mainWindowArea to winArea
                  set mainWindow to win
                end if
              end try
            end repeat
            
            if mainWindow is missing value then
              -- Try to use first window even if small
              try
                set mainWindow to item 1 of windowList
                set winSize to size of mainWindow
                set winWidth to item 1 of winSize
                if winWidth <= ${panelWidth} then
                  return "too_small|" & frontApp & "|" & winWidth
                end if
              end try
            end if
            
            if mainWindow is missing value then
              return "no_window|" & frontApp
            end if
            
            set windowSize to size of mainWindow
            set windowPosition to position of mainWindow
            set windowWidth to item 1 of windowSize
            set windowHeight to item 2 of windowSize
            set windowX to item 1 of windowPosition
            set windowY to item 2 of windowPosition
            
            log "Window size: " & windowWidth & "x" & windowHeight & " at (" & windowX & ", " & windowY & ")"
            
            set newWidth to ${screenWidth} - ${panelWidth}
            log "Resizing to: " & newWidth & "x" & windowHeight & " at (0, " & windowY & ")"
            
            set position of mainWindow to {0, windowY}
            set size of mainWindow to {newWidth, windowHeight}
            return frontApp & "|" & windowX & "|" & windowY & "|" & windowWidth & "|" & windowHeight
          on error errMsg
            return "error|" & errMsg
          end try
        end tell
      end tell
    `;

    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

    if (stderr) {
      console.warn("[MAIN] AppleScript stderr:", stderr);
    }

    const result = stdout.trim();
    console.log(`[MAIN] AppleScript result: ${result}`);

    if (result.startsWith("skip|")) {
      const skippedApp = result.split("|")[1];
      console.log(
        `[MAIN] Skipping window push: frontmost app is "${skippedApp}" (our app)`
      );
      return null;
    }

    if (
      result.startsWith("no_window|") ||
      result.startsWith("fullscreen|") ||
      result.startsWith("too_small|")
    ) {
      const parts = result.split("|");
      console.log(
        `[MAIN] Skipping window push: ${parts[0]} (app: ${
          parts[1] || "unknown"
        })`
      );
      return null;
    }

    if (result.startsWith("error|")) {
      console.error("[MAIN] AppleScript error:", result);
      return null;
    }

    // Parse result: "AppName|x|y|width|height"
    const parts = result.split("|");
    if (parts.length === 5) {
      const bounds: OriginalBounds = {
        appName: parts[0],
        x: parseInt(parts[1], 10),
        y: parseInt(parts[2], 10),
        width: parseInt(parts[3], 10),
        height: parseInt(parts[4], 10),
      };
      console.log(
        `[MAIN] Successfully pushed window "${bounds.appName}" from ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`
      );
      return bounds;
    }

    console.warn(`[MAIN] Unexpected AppleScript result format: ${result}`);
    return null;
  } catch (error) {
    console.error("[MAIN] Error pushing frontmost window:", error);
    // If accessibility permission is not granted, this will fail
    // But we still allow the panel to slide in
    return null;
  }
}

/**
 * Restore frontmost macOS window to original bounds
 */
async function restoreFrontmostWindow(bounds: OriginalBounds): Promise<void> {
  if (process.platform !== "darwin" || !bounds) {
    return;
  }

  try {
    const script = `
      tell application "System Events"
        tell process "${bounds.appName}"
          try
            set windowCount to count of windows
            if windowCount > 0 then
              set position of window 1 to {${bounds.x}, ${bounds.y}}
              set size of window 1 to {${bounds.width}, ${bounds.height}}
            end if
          on error errMsg
            return "error|" & errMsg
          end try
        end tell
      end tell
    `;

    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

    if (stderr) {
      console.warn("[MAIN] AppleScript restore stderr:", stderr);
    }

    const result = stdout.trim();
    if (result.startsWith("error|")) {
      console.error("[MAIN] AppleScript restore error:", result);
    } else {
      console.log(
        `[MAIN] Restored window "${bounds.appName}" to ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`
      );
    }
  } catch (error) {
    console.error("[MAIN] Error restoring frontmost window:", error);
  }
}

/**
 * Toggle panel visibility with slide animation and window push/restore
 */
async function togglePanel(): Promise<void> {
  const panelWidth = 400;

  if (!isPanelVisible) {
    // Show panel
    if (!mainWindow) {
      createWindow();
    }

    // IMPORTANT: Push frontmost window BEFORE showing our panel
    // Otherwise our panel becomes frontmost and we skip pushing
    if (process.platform === "darwin" && !hasPushedWindow) {
      console.log("[MAIN] Pushing frontmost window before showing panel...");

      // Small delay to ensure another app is frontmost (if user just triggered shortcut)
      await new Promise((resolve) => setTimeout(resolve, 100));

      const bounds = await pushFrontmostWindow(panelWidth);
      if (bounds) {
        savedWindowBounds = bounds;
        hasPushedWindow = true;
        console.log("[MAIN] Window pushed successfully, saved bounds:", bounds);
      } else {
        console.log(
          "[MAIN] Window push returned null (may need Accessibility permissions or app is already frontmost)"
        );
      }
    }

    // Now show and slide in the panel
    mainWindow?.show();
    await slideIn(panelWidth);
  } else {
    // Hide panel
    await slideOut(panelWidth);

    // Restore frontmost window on macOS
    if (process.platform === "darwin" && hasPushedWindow && savedWindowBounds) {
      console.log("[MAIN] Restoring window bounds:", savedWindowBounds);
      await restoreFrontmostWindow(savedWindowBounds);
      savedWindowBounds = null;
      hasPushedWindow = false;
    }

    // Optionally hide window completely after sliding out
    mainWindow?.hide();
  }
}

function createWindow() {
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  const panelWidth = 400;

  mainWindow = new BrowserWindow({
    width: panelWidth,
    height: screenHeight,
    x: screenWidth, // Start off-screen to the right
    y: 0,
    alwaysOnTop: true,
    resizable: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Initialize panel as hidden (off-screen)
  isPanelVisible = false;

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Register global shortcuts for session-based navigation
  //
  // Option-based shortcut workflow (generic bidirectional mode):
  // - ⌥C: Capture screen and enrich current session (add/merge key→value pairs)
  // - ⌥W: Move selection up (previous key in session)
  // - ⌥S: Move selection down (next key)
  // - ⌥V: Type current key's value into active field
  // - ⌥X: Clear current session (reset for new direction)

  // Alt+C: Capture screen and enrich session
  globalShortcut.register("Alt+C", async () => {
    await handleCaptureAndEnrich();
  });

  // Alt+W: Move selection up (previous field)
  globalShortcut.register("Alt+W", () => {
    selectPreviousField();
  });

  // Alt+S: Move selection down (next field)
  globalShortcut.register("Alt+S", () => {
    selectNextField();
  });

  // Alt+V: Type current field value into active field
  globalShortcut.register("Alt+V", async () => {
    await pasteCurrentField();
  });

  // Alt+X: Clear session
  globalShortcut.register("Alt+X", () => {
    clearSession();
  });

  // Command+Shift+H: Toggle panel (slide in/out with window push)
  globalShortcut.register("CommandOrControl+Shift+H", async () => {
    await togglePanel();
  });

  // IPC handlers
  ipcMain.handle("agent:captureAndEnrich", handleCaptureAndEnrich);
  ipcMain.handle("agent:selectPreviousField", async () => {
    selectPreviousField();
    return { success: true };
  });
  ipcMain.handle("agent:selectNextField", async () => {
    selectNextField();
    return { success: true };
  });
  ipcMain.handle("agent:pasteCurrentField", async () => {
    await pasteCurrentField();
    return { success: true };
  });
  ipcMain.handle("agent:clearSession", () => {
    clearSession();
    return { success: true };
  });
  ipcMain.handle("agent:getState", () => {
    return { state: agentState };
  });

  // Toggle panel visibility (slide in/out with window push)
  ipcMain.handle("toggle-panel", async () => {
    await togglePanel();
    return { success: true, isVisible: isPanelVisible };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
