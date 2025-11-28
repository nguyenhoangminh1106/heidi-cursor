import "dotenv/config";
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
} from "electron";
import * as path from "path";
import { pressCommandV } from "./automation/keyboardFiller";
import { captureFullScreen } from "./services/screenshot";
import {
  extractSessionFieldsFromImage,
  mergeSessionFields,
} from "./services/sessionFieldExtractor";
import { AgentState, SessionField } from "./types/agent";

let mainWindow: BrowserWindow | null = null;

// Agent state
let agentState: AgentState = {
  status: "idle",
  sessionFields: [],
  currentIndex: 0,
};

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 500,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 320,
    minHeight: 400,
    maxHeight: 1600,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Position window in top-right corner
  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  mainWindow.setPosition(screenWidth - 340, 20);

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
