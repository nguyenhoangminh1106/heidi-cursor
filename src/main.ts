import "dotenv/config";
import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import * as path from "path";
import { fillFieldAndTab, pressTab } from "./automation/keyboardFiller";
import { isVisionAiEnabled } from "./config/aiConfig";
import { getOrAnalyzeLayout } from "./services/emrLayoutAnalyzer";
import { buildFillPlan } from "./services/fillPlanBuilder";
import { heidiDataSource } from "./services/heidiDataSource";
import { captureFullScreen } from "./services/screenshot";
import { AgentFieldMapping, AgentState } from "./types/agent";

let mainWindow: BrowserWindow | null = null;

// Agent state
let agentState: AgentState = {
  status: "idle",
  mapping: [],
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
 * Handle sync / start fill: Builds the fill plan from EMR layout and Heidi snapshot
 * This is the new linear approach: analyze EMR once, build plan, then fill sequentially
 */
async function handleSync(): Promise<{
  success: boolean;
  mapping?: AgentFieldMapping;
  error?: string;
  ocrText?: string;
  reasoning?: string;
}> {
  console.log("[MAIN] ========================================");
  console.log("[MAIN] handleSync called (building fill plan)");
  console.log("[MAIN] ========================================");

  try {
    updateAgentState({ status: "synced", lastError: undefined });

    // Get Heidi snapshot (refresh if needed)
    let snapshot = heidiDataSource.getSnapshot();
    if (!snapshot) {
      console.log("[MAIN] No Heidi snapshot, refreshing...");
      snapshot = await heidiDataSource.refreshSnapshot();
    }

    // Try AI-based EMR layout analysis if enabled
    if (isVisionAiEnabled()) {
      try {
        // Capture full screen for layout analysis
        const fullScreenBuffer = await captureFullScreen();
        console.log("[MAIN] Captured full screen for EMR layout analysis");

        // Analyze or get cached layout
        const emrLayout = await getOrAnalyzeLayout(fullScreenBuffer);
        console.log(
          "[MAIN] EMR layout analyzed:",
          emrLayout.fields.length,
          "fields found (in tab order)"
        );

        // Build fill plan: map each EMR field to Heidi field
        const fillPlan = await buildFillPlan(emrLayout, snapshot);
        console.log("[MAIN] Fill plan built:", fillPlan.steps.length, "steps");

        // Reset fill index to 0 (start from beginning)
        updateAgentState({
          status: "synced",
          fillPlan,
          fillIndex: 0,
          emrLayout,
        });

        console.log(
          "[MAIN] Fill plan ready. Press ⌥Tab to fill fields sequentially."
        );
        console.log("[MAIN] ========================================");

        return {
          success: true,
        };
      } catch (layoutError) {
        console.error("[MAIN] EMR layout analysis failed:", layoutError);
        const errorMessage =
          layoutError instanceof Error
            ? layoutError.message
            : "Failed to analyze EMR layout";
        updateAgentState({ status: "error", lastError: errorMessage });
        return { success: false, error: errorMessage };
      }
    } else {
      // Vision AI not enabled - fallback message
      const error =
        "Vision AI not enabled. Please configure OPENAI_API_KEY or CLAUDE_API_KEY in .env";
      updateAgentState({ status: "error", lastError: error });
      return { success: false, error };
    }
  } catch (error) {
    console.error("[MAIN] ========================================");
    console.error("[MAIN] Error in handleSync:", error);
    console.error("[MAIN] ========================================");
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    updateAgentState({ status: "error", lastError: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Handle fill next field: Linear fill using the fill plan
 * Simply walks through the plan sequentially, no per-field detection needed
 */
async function handleFillNext(): Promise<{
  success: boolean;
  error?: string;
  mapping?: AgentFieldMapping;
}> {
  console.log("[MAIN] ========================================");
  console.log("[MAIN] handleFillNext called");
  console.log("[MAIN] ========================================");

  try {
    // Check if we have a fill plan
    if (!agentState.fillPlan || agentState.fillIndex === undefined) {
      const error =
        "No fill plan available. Please press ⌘⇧F to build the fill plan first.";
      updateAgentState({ status: "error", lastError: error });
      return { success: false, error };
    }

    const fillPlan = agentState.fillPlan;
    const fillIndex = agentState.fillIndex;

    // Check if we've reached the end
    if (fillIndex >= fillPlan.steps.length) {
      const error = "Fill plan completed. All fields have been filled.";
      updateAgentState({ status: "synced", lastError: error });
      return { success: false, error };
    }

    // Get the current step
    const step = fillPlan.steps[fillIndex];
    console.log(
      `[MAIN] Filling step ${fillIndex + 1}/${fillPlan.steps.length}:`,
      step.emrLabel
    );

    // Get Heidi snapshot
    let snapshot = heidiDataSource.getSnapshot();
    if (!snapshot) {
      console.log("[MAIN] No Heidi snapshot, refreshing...");
      snapshot = await heidiDataSource.refreshSnapshot();
    }

    updateAgentState({ status: "filling", lastError: undefined });

    // Small delay to ensure EMR field is focused and ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // If there's a Heidi field mapped, fill it; otherwise just Tab (skip)
    if (step.heidiFieldId) {
      const heidiField = snapshot.fields.find(
        (f) => f.id === step.heidiFieldId
      );

      if (heidiField && heidiField.value) {
        console.log(
          `[MAIN] Filling "${step.emrLabel}" with "${heidiField.value.substring(
            0,
            50
          )}${heidiField.value.length > 50 ? "..." : ""}"`
        );
        try {
          await fillFieldAndTab(heidiField.value);
        } catch (fillError) {
          console.error(`[MAIN] Error filling field:`, fillError);
          // Even if fill fails, try to Tab to next field
          await pressTab();
          throw fillError;
        }
      } else {
        console.log(
          `[MAIN] Heidi field "${step.heidiFieldId}" not found or empty, skipping`
        );
        // Just press Tab to move to next field
        await pressTab();
      }
    } else {
      // No match - just Tab to skip this field
      console.log(
        `[MAIN] No Heidi match for "${step.emrLabel}", skipping (Tab only)`
      );
      await pressTab();
    }

    // Increment fill index
    const newFillIndex = fillIndex + 1;
    updateAgentState({
      status: newFillIndex >= fillPlan.steps.length ? "synced" : "filling",
      fillIndex: newFillIndex,
    });

    console.log(
      `[MAIN] Fill completed. Progress: ${newFillIndex}/${fillPlan.steps.length}`
    );
    console.log("[MAIN] ========================================");

    return { success: true };
  } catch (error) {
    console.error("[MAIN] ========================================");
    console.error("[MAIN] Error in handleFillNext:", error);
    console.error("[MAIN] ========================================");
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    updateAgentState({ status: "error", lastError: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Handle refresh Heidi data
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
  console.log("[MAIN] handleRefreshHeidi called");

  try {
    const snapshot = await heidiDataSource.refreshSnapshot();
    console.log(
      "[MAIN] Heidi snapshot refreshed with",
      snapshot.fields.length,
      "fields"
    );

    // Update state if needed
    if (agentState.status === "error") {
      updateAgentState({ status: "idle", lastError: undefined });
    }

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

  // Register global shortcuts
  // Cmd+Shift+F: Sync to current EMR field
  globalShortcut.register("CommandOrControl+Shift+F", async () => {
    await handleSync();
  });

  // Cmd+Shift+H: Refresh Heidi data
  globalShortcut.register("CommandOrControl+Shift+H", async () => {
    await handleRefreshHeidi();
  });

  // Cmd+Shift+K: Fill next field (linear fill)
  // Note: Using Cmd+Shift+K instead of Alt+Tab to avoid Option key interfering with typing
  globalShortcut.register("CommandOrControl+Shift+K", async () => {
    if (agentState.status === "synced" || agentState.status === "filling") {
      await handleFillNext();
    }
  });

  // IPC handlers
  ipcMain.handle("agent:sync", handleSync);
  ipcMain.handle("agent:fillNext", handleFillNext);
  ipcMain.handle("agent:refreshHeidi", handleRefreshHeidi);
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
