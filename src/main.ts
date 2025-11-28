import "dotenv/config";
import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import * as path from "path";
import { fillField } from "./automation/keyboardFiller";
import { heidiDataSource } from "./services/heidiDataSource";
import { AgentState, HeidiSnapshot } from "./types/agent";

let mainWindow: BrowserWindow | null = null;

// Agent state
let agentState: AgentState = {
  status: "idle",
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
 * Get Heidi snapshot or throw error
 *
 * This is the new Heidi-only workflow: users capture Heidi screenshots (⌥C),
 * navigate between extracted fields (⌥W/⌥S), and paste values (⌥Tab).
 * No EMR layout analysis or fill-plan building is needed.
 */
function getHeidiSnapshotOrThrow(): HeidiSnapshot {
  const snapshot = heidiDataSource.getSnapshot();
  if (!snapshot || snapshot.fields.length === 0) {
    throw new Error(
      "No Heidi snapshot available. Please press Ctrl+Shift+C to capture Heidi and extract fields first."
    );
  }
  return snapshot;
}

/**
 * Clamp index to valid range
 */
function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * Select previous Heidi field (move selection up)
 */
function selectPreviousField(): void {
  try {
    const snapshot = getHeidiSnapshotOrThrow();
    const fields = snapshot.fields;
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
 * Select next Heidi field (move selection down)
 */
function selectNextField(): void {
  try {
    const snapshot = getHeidiSnapshotOrThrow();
    const fields = snapshot.fields;
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
 * Paste current Heidi field value into active field
 */
async function pasteCurrentField(): Promise<void> {
  try {
    const snapshot = getHeidiSnapshotOrThrow();
    const fields = snapshot.fields;

    if (fields.length === 0) {
      const error = "No Heidi fields available";
      updateAgentState({ status: "error", lastError: error });
      return;
    }

    const currentIndex = clampIndex(agentState.currentIndex, fields.length);
    const field = fields[currentIndex];

    if (!field.value) {
      const error = `Selected Heidi field "${field.label}" has no value`;
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

    updateAgentState({ status: "filling", lastError: undefined });

    // Longer delay to ensure target field is focused and ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Use fillField which types the text directly (not clipboard paste)
    // This ensures proper character encoding and font compatibility
    await fillField(field.value);

    // Additional delay after typing to ensure all characters are processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    updateAgentState({ status: "idle" });
    console.log("[MAIN] Typing completed successfully");
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
 * Handle refresh Heidi data (capture Heidi and extract fields)
 */
async function handleRefreshHeidi(): Promise<{
  success: boolean;
  snapshot?: {
    source: "ocr" | "api" | "ai";
    capturedAt: number;
    fields: Array<{ id: string; label: string; value: string }>;
  };
  error?: string;
}> {
  console.log("[MAIN] handleRefreshHeidi called (⌥C: capture Heidi)");

  try {
    const snapshot = await heidiDataSource.refreshSnapshot();
    console.log(
      "[MAIN] Heidi snapshot refreshed with",
      snapshot.fields.length,
      "fields"
    );

    // Reset currentIndex to 0 when new snapshot is loaded
    // Clamp it to valid range in case fields.length changed
    const newIndex = clampIndex(0, snapshot.fields.length);
    updateAgentState({
      status: "idle",
      currentIndex: newIndex,
      lastError: undefined,
    });

    return {
      success: true,
      snapshot: {
        source: snapshot.source,
        capturedAt: snapshot.capturedAt,
        fields: snapshot.fields.map((f) => ({
          id: f.id,
          label: f.label,
          value: f.value,
        })),
      },
    };
  } catch (error) {
    console.error("[MAIN] Error in handleRefreshHeidi:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    updateAgentState({ status: "error", lastError: errorMessage });
    return { success: false, error: errorMessage };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 500,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 320,
    minHeight: 400,
    maxHeight: 800,
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

  // Register global shortcuts for Heidi field navigation
  //
  // New Ctrl+Shift-based shortcut workflow (simplified Heidi-only mode):
  // - Ctrl+Shift+C: Capture Heidi screen and extract fields
  // - Ctrl+Shift+W: Move selection up (previous Heidi field)
  // - Ctrl+Shift+S: Move selection down (next Heidi field)
  // - Ctrl+Shift+P: Type current Heidi field value into active EMR field
  //
  // Note: This replaces the legacy EMR layout analysis + fill-plan workflow.
  // Users now manually navigate Heidi fields and paste into EMR fields as needed.

  // Ctrl+Shift+C: Capture Heidi and extract fields
  globalShortcut.register("CommandOrControl+Shift+C", async () => {
    await handleRefreshHeidi();
  });

  // Ctrl+Shift+W: Move selection up (previous field)
  globalShortcut.register("CommandOrControl+Shift+W", () => {
    selectPreviousField();
  });

  // Ctrl+Shift+S: Move selection down (next field)
  globalShortcut.register("CommandOrControl+Shift+S", () => {
    selectNextField();
  });

  // Ctrl+Shift+P: Type current Heidi field value into active field
  globalShortcut.register("CommandOrControl+Shift+P", async () => {
    await pasteCurrentField();
  });

  // Cmd+Shift+H: Refresh Heidi data (power-user shortcut, kept for compatibility)
  globalShortcut.register("CommandOrControl+Shift+H", async () => {
    await handleRefreshHeidi();
  });

  // IPC handlers
  ipcMain.handle("agent:refreshHeidi", handleRefreshHeidi);
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
  ipcMain.handle("agent:getState", () => {
    return { state: agentState };
  });
  ipcMain.handle("agent:getHeidiSnapshot", () => {
    const snapshot = heidiDataSource.getSnapshot();
    return snapshot
      ? {
          success: true,
          snapshot: {
            source: snapshot.source,
            capturedAt: snapshot.capturedAt,
            fields: snapshot.fields.map((f) => ({
              id: f.id,
              label: f.label,
              value: f.value,
              type: f.type,
              confidence: f.confidence,
            })),
          },
        }
      : { success: false, error: "No Heidi snapshot available" };
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
