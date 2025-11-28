import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import * as path from "path";
import { fillFieldAndTab } from "./automation/keyboardFiller";

let mainWindow: BrowserWindow | null = null;

let currentIndex = 0;
let status: "idle" | "running" | "completed" = "idle";
let fields: Array<{ id: string; label: string; value: string }> = [];
let isNextInProgress = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 400,
    alwaysOnTop: true,
    resizable: false,
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

function updateState() {
  if (mainWindow) {
    mainWindow.webContents.send("agent:state-updated", {
      currentIndex,
      status,
      currentField: fields[currentIndex] || null,
      nextField: fields[currentIndex + 1] || null,
      totalFields: fields.length,
    });
  }
}

async function handleStart() {
  console.log(`[MAIN] handleStart called`);
  console.log(`[MAIN] Total fields: ${fields.length}`);
  currentIndex = 0;
  status = "running";
  console.log(`[MAIN] Status set to running, currentIndex: ${currentIndex}`);
  updateState();
  console.log(`[MAIN] handleStart completed`);
}

async function handleNext() {
  console.log(
    `[MAIN] handleNext called - status: ${status}, currentIndex: ${currentIndex}`
  );

  if (status !== "running") {
    console.log(`[MAIN] Workflow not running, returning error`);
    return { success: false, error: "Workflow not running" };
  }

  if (isNextInProgress) {
    console.log(`[MAIN] Step already in progress, ignoring duplicate call`);
    return { success: false, error: "Step already in progress" };
  }

  isNextInProgress = true;
  try {
    const field = fields[currentIndex];
    console.log(`[MAIN] Current field:`, field);

    if (!field) {
      console.log(
        `[MAIN] No field found at index ${currentIndex}, marking as completed`
      );
      status = "completed";
      updateState();
      return { success: false, error: "No more fields" };
    }

    console.log(`[MAIN] Calling fillFieldAndTab with value: "${field.value}"`);
    await fillFieldAndTab(field.value);
    console.log(`[MAIN] fillFieldAndTab completed successfully`);

    if (currentIndex === fields.length - 1) {
      console.log(`[MAIN] Last field completed, marking as completed`);
      status = "completed";
    } else {
      console.log(
        `[MAIN] Advancing to next field: ${currentIndex} -> ${currentIndex + 1}`
      );
      currentIndex++;
    }

    updateState();
    console.log(`[MAIN] handleNext returning success`);
    return { success: true };
  } catch (error) {
    console.error(`[MAIN] Error in handleNext:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[MAIN] Error message: ${errorMessage}`);
    return { success: false, error: errorMessage };
  } finally {
    isNextInProgress = false;
    console.log(`[MAIN] handleNext lock released`);
  }
}

function handleReset() {
  currentIndex = 0;
  status = "idle";
  isNextInProgress = false;
  updateState();
}

function handleSetFields(
  newFields: Array<{ id: string; label: string; value: string }>
) {
  fields = newFields;
  updateState();
}

app.whenReady().then(() => {
  createWindow();

  // Register global shortcuts
  globalShortcut.register("CommandOrControl+Shift+S", () => {
    if (status === "idle") {
      handleStart();
    }
  });

  // Use plain Tab as the "Cursor-like" trigger:
  // User presses Tab -> we fill the field and then send a Tab into the EMR form
  globalShortcut.register("Tab", async () => {
    if (status === "running") {
      await handleNext();
    }
  });

  // IPC handlers
  ipcMain.handle("agent:start", handleStart);
  ipcMain.handle("agent:next", handleNext);
  ipcMain.handle("agent:reset", handleReset);
  ipcMain.handle("agent:set-fields", (_, newFields) => {
    handleSetFields(newFields);
  });
  ipcMain.handle("agent:get-state", () => {
    return {
      currentIndex,
      status,
      currentField: fields[currentIndex] || null,
      nextField: fields[currentIndex + 1] || null,
      totalFields: fields.length,
    };
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
