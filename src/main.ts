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
import { validateHeidiConfig } from "./config/heidiConfig";
import { fetchSession } from "./services/heidiApiClient";
import { captureFullScreen } from "./services/screenshot";
import {
  extractSessionFieldsFromImage,
  mergeSessionFields,
} from "./services/sessionFieldExtractor";
import { AgentState, LinkedWindow, SessionField } from "./types/agent";

let mainWindow: BrowserWindow | null = null;
let floatingIconWindow: BrowserWindow | null = null;
let pairingWindow: BrowserWindow | null = null;

// Panel visibility state
let isPanelVisible = false;
let savedWindowBounds: OriginalBounds | null = null;
let savedHeidiBounds: OriginalBounds | null = null;
let savedEmrBounds: OriginalBounds | null = null;
let hasPushedWindow = false;

// Agent state
let agentState: AgentState = {
  status: "idle",
  sessionFields: [],
  currentIndex: 0,
};

// Linked EMR window state
let linkedEmrWindow: LinkedWindow | null = null;
let windowWatcherInterval: NodeJS.Timeout | null = null;
let lastKnownHeidiContext = false; // Track if we're in Heidi context

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
  const update = { state: agentState };
  if (mainWindow) {
    mainWindow.webContents.send("agent:stateUpdated", update);
  }
  if (pairingWindow) {
    pairingWindow.webContents.send("agent:stateUpdated", update);
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
 * Push both Heidi and EMR windows to make room for panel when it opens
 * Ensures both linked windows are properly resized to accommodate the panel
 */
async function pushLinkedWindows(panelWidth: number): Promise<{
  heidiBounds: OriginalBounds | null;
  emrBounds: OriginalBounds | null;
}> {
  if (process.platform !== "darwin" || !linkedEmrWindow) {
    return { heidiBounds: null, emrBounds: null };
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const newWidth = screenWidth - panelWidth;
  let heidiBounds: OriginalBounds | null = null;
  let emrBounds: OriginalBounds | null = null;

  try {
    // Push Heidi window
    const heidiScript = `
      tell application "System Events"
        repeat with proc in (every application process whose visible is true)
          set procName to name of proc
          if procName contains "Heidi" or procName contains "heidi" then
            tell process procName
              try
                set windowList to every window
                set windowCount to count of windowList
                if windowCount > 0 then
                  set win to item 1 of windowList
                  set winSize to size of win
                  set winPos to position of win
                  set winWidth to item 1 of winSize
                  set winHeight to item 2 of winSize
                  set winX to item 1 of winPos
                  set winY to item 2 of winPos
                  
                  if winWidth > ${panelWidth} then
                    set position of win to {0, winY}
                    set size of win to {${newWidth}, winHeight}
                    return procName & "|" & winX & "|" & winY & "|" & winWidth & "|" & winHeight
                  else
                    return "skip|" & procName & "|too_small"
                  end if
                end if
              end try
            end tell
          end if
        end repeat
        return "not_found|heidi"
      end tell
    `;

    const heidiResult = await execAsync(`osascript -e '${heidiScript}'`);
    const heidiParts = heidiResult.stdout.trim().split("|");
    if (
      heidiParts.length === 5 &&
      !heidiParts[0].startsWith("skip") &&
      !heidiParts[0].startsWith("not_found")
    ) {
      heidiBounds = {
        appName: heidiParts[0],
        x: parseInt(heidiParts[1], 10),
        y: parseInt(heidiParts[2], 10),
        width: parseInt(heidiParts[3], 10),
        height: parseInt(heidiParts[4], 10),
      };
      console.log(`[MAIN] Pushed Heidi window: ${heidiBounds.appName}`);
    }

    // Push EMR window
    const emrScript = `
      tell application "System Events"
        tell process "${linkedEmrWindow.appName}"
          try
            set windowList to every window
            set windowCount to count of windowList
            if windowCount > 0 then
              repeat with win in windowList
                try
                  set winTitle to name of win
                  if winTitle contains "${linkedEmrWindow.windowTitle}" or "${linkedEmrWindow.windowTitle}" contains winTitle then
                    set winSize to size of win
                    set winPos to position of win
                    set winWidth to item 1 of winSize
                    set winHeight to item 2 of winSize
                    set winX to item 1 of winPos
                    set winY to item 2 of winPos
                    
                    if winWidth > ${panelWidth} then
                      set position of win to {0, winY}
                      set size of win to {${newWidth}, winHeight}
                      return "${linkedEmrWindow.appName}|" & winX & "|" & winY & "|" & winWidth & "|" & winHeight
                    else
                      return "skip|${linkedEmrWindow.appName}|too_small"
                    end if
                  end if
                end try
              end repeat
              -- Fallback: push first window if title match fails
              set win to item 1 of windowList
              set winSize to size of win
              set winPos to position of win
              set winWidth to item 1 of winSize
              set winHeight to item 2 of winSize
              set winX to item 1 of winPos
              set winY to item 2 of winPos
              
              if winWidth > ${panelWidth} then
                set position of win to {0, winY}
                set size of win to {${newWidth}, winHeight}
                return "${linkedEmrWindow.appName}|" & winX & "|" & winY & "|" & winWidth & "|" & winHeight
              else
                return "skip|${linkedEmrWindow.appName}|too_small"
              end if
            end if
          on error errMsg
            return "error|${linkedEmrWindow.appName}|" & errMsg
          end try
        end tell
        return "not_found|${linkedEmrWindow.appName}"
      end tell
    `;

    const emrResult = await execAsync(`osascript -e '${emrScript}'`);
    const emrParts = emrResult.stdout.trim().split("|");
    if (
      emrParts.length === 5 &&
      !emrParts[0].startsWith("skip") &&
      !emrParts[0].startsWith("not_found") &&
      !emrParts[0].startsWith("error")
    ) {
      emrBounds = {
        appName: emrParts[0],
        x: parseInt(emrParts[1], 10),
        y: parseInt(emrParts[2], 10),
        width: parseInt(emrParts[3], 10),
        height: parseInt(emrParts[4], 10),
      };
      console.log(`[MAIN] Pushed EMR window: ${emrBounds.appName}`);
    }
  } catch (error) {
    console.error("[MAIN] Error pushing linked windows:", error);
  }

  return { heidiBounds, emrBounds };
}

/**
 * Restore both Heidi and EMR windows to full width when panel closes
 * Ensures both linked windows are properly resized regardless of which was pushed
 */
async function restoreLinkedWindows(): Promise<void> {
  if (process.platform !== "darwin" || !linkedEmrWindow) {
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  try {
    // Restore Heidi window to full width
    const heidiScript = `
      tell application "System Events"
        repeat with proc in (every application process whose visible is true)
          set procName to name of proc
          if procName contains "Heidi" or procName contains "heidi" then
            tell process procName
              try
                set windowList to every window
                set windowCount to count of windowList
                if windowCount > 0 then
                  repeat with win in windowList
                    try
                      set winSize to size of win
                      set winPos to position of win
                      set winHeight to item 2 of winSize
                      set winY to item 2 of winPos
                      set position of win to {0, winY}
                      set size of win to {${screenWidth}, winHeight}
                    end try
                  end repeat
                  return "heidi|restored"
                end if
              end try
            end tell
          end if
        end repeat
        return "heidi|not_found"
      end tell
    `;

    const heidiResult = await execAsync(`osascript -e '${heidiScript}'`);
    console.log(`[MAIN] Heidi restore result: ${heidiResult.stdout.trim()}`);

    // Restore EMR window to full width
    const emrScript = `
      tell application "System Events"
        tell process "${linkedEmrWindow.appName}"
          try
            set windowList to every window
            set windowCount to count of windowList
            if windowCount > 0 then
              repeat with win in windowList
                try
                  set winTitle to name of win
                  if winTitle contains "${linkedEmrWindow.windowTitle}" or "${linkedEmrWindow.windowTitle}" contains winTitle then
                    set winSize to size of win
                    set winPos to position of win
                    set winHeight to item 2 of winSize
                    set winY to item 2 of winPos
                    set position of win to {0, winY}
                    set size of win to {${screenWidth}, winHeight}
                    return "emr|restored"
                  end if
                end try
              end repeat
              -- Fallback: restore first window if title match fails
              set win to item 1 of windowList
              set winSize to size of win
              set winPos to position of win
              set winHeight to item 2 of winSize
              set winY to item 2 of winPos
              set position of win to {0, winY}
              set size of win to {${screenWidth}, winHeight}
              return "emr|restored_fallback"
            end if
          on error errMsg
            return "emr|error|" & errMsg
          end try
        end tell
        return "emr|not_found"
      end tell
    `;

    const emrResult = await execAsync(`osascript -e '${emrScript}'`);
    console.log(`[MAIN] EMR restore result: ${emrResult.stdout.trim()}`);
  } catch (error) {
    console.error("[MAIN] Error restoring linked windows:", error);
  }
}

/**
 * Get frontmost window info (app name and window title)
 */
async function getFrontmostWindowInfo(): Promise<{
  appName: string;
  windowTitle: string;
} | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        tell process frontApp
          try
            set windowList to every window
            if (count of windowList) > 0 then
              set frontWindow to item 1 of windowList
              set windowTitle to name of frontWindow
              return frontApp & "|" & windowTitle
            else
              return "no_window|" & frontApp
            end if
          on error errMsg
            return "error|" & errMsg
          end try
        end tell
      end tell
    `;

    const { stdout } = await execAsync(`osascript -e '${script}'`);
    const result = stdout.trim();

    if (result.startsWith("error|") || result.startsWith("no_window|")) {
      return null;
    }

    const parts = result.split("|");
    if (parts.length >= 2) {
      return {
        appName: parts[0],
        windowTitle: parts.slice(1).join("|"), // Handle titles with | in them
      };
    }

    return null;
  } catch (error) {
    console.error("[MAIN] Error getting frontmost window info:", error);
    return null;
  }
}

/**
 * List all visible windows (app name, window title, index)
 */
async function listVisibleWindows(): Promise<LinkedWindow[]> {
  if (process.platform !== "darwin") {
    return [];
  }

  try {
    const appName = app.getName();
    const script = `
      tell application "System Events"
        set windowList to {}
        repeat with proc in (every application process whose visible is true)
          set procName to name of proc
          -- Exclude our own Electron/Electron-helper windows
          if procName does not contain "Electron" and procName is not "${appName}" and procName does not contain "electron-floating-agent" then
            try
              tell process procName
                set procWindows to every window
                set windowCount to count of procWindows
                if windowCount > 0 then
                  repeat with i from 1 to windowCount
                    try
                      set win to item i of procWindows
                      set winTitle to name of win
                      -- Exclude Heidi windows and empty titles
                      if winTitle is not "" and winTitle does not contain "Heidi" then
                        set end of windowList to (procName & "|" & winTitle & "|" & (i as string))
                      end if
                    end try
                  end repeat
                end if
              end tell
            end try
          end if
        end repeat
        return windowList
      end tell
    `;

    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

    if (stderr) {
      console.warn("[MAIN] AppleScript stderr (listVisibleWindows):", stderr);
    }

    const result = stdout.trim();
    console.log("[MAIN] listVisibleWindows raw:", JSON.stringify(result));

    if (!result || result === "") {
      console.log("[MAIN] No windows found in listVisibleWindows");
      return [];
    }

    const windows: LinkedWindow[] = [];
    const seen = new Set<string>();

    // AppleScript prints lists as "item1, item2, item3"
    const entries = result
      .split(/,\s*/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    for (const entry of entries) {
      const parts = entry.split("|");
      if (parts.length >= 2) {
        const entryAppName = parts[0].trim();
        const windowTitle = parts[1].trim();
        const index =
          parts.length >= 3 ? parseInt(parts[2].trim(), 10) : undefined;

        const key = `${entryAppName}::${windowTitle}::${index ?? ""}`;
        if (!seen.has(key) && entryAppName && windowTitle) {
          seen.add(key);
          windows.push({
            appName: entryAppName,
            windowTitle,
            index: index && !isNaN(index) ? index : undefined,
          });
        }
      }
    }

    console.log(`[MAIN] listVisibleWindows parsed ${windows.length} windows`);
    return windows;
  } catch (error) {
    console.error("[MAIN] Error listing visible windows:", error);
    return [];
  }
}

/**
 * Check if a window matches Heidi criteria (app name or title contains "Heidi")
 */
function isHeidiWindow(appName: string, windowTitle: string): boolean {
  const appNameLower = appName.toLowerCase();
  const titleLower = windowTitle.toLowerCase();
  return appNameLower.includes("heidi") || titleLower.includes("heidi");
}

/**
 * Check if a window matches the linked EMR window
 */
function matchesLinkedEmrWindow(appName: string, windowTitle: string): boolean {
  if (!linkedEmrWindow) {
    return false;
  }

  // Exact match on app name
  if (appName !== linkedEmrWindow.appName) {
    return false;
  }

  // Exact title match or substring match (to tolerate minor changes)
  if (
    windowTitle === linkedEmrWindow.windowTitle ||
    windowTitle.includes(linkedEmrWindow.windowTitle) ||
    linkedEmrWindow.windowTitle.includes(windowTitle)
  ) {
    return true;
  }

  return false;
}

/**
 * Activate an application and bring its window to front using AppleScript
 */
async function activateApplicationWindow(
  appName: string,
  windowTitle?: string
): Promise<void> {
  if (process.platform !== "darwin") {
    console.log("[MAIN] Window switching only supported on macOS");
    return;
  }

  try {
    let script: string;
    if (windowTitle) {
      // Try to activate specific window by title
      script = `
        tell application "System Events"
          tell process "${appName}"
            set windowFound to false
            repeat with win in every window
              try
                set winTitle to name of win
                if winTitle contains "${windowTitle}" or "${windowTitle}" contains winTitle then
                  set frontmost to true
                  set windowFound to true
                  exit repeat
                end if
              end try
            end repeat
            if not windowFound then
              -- Fallback: activate first window
              if (count of windows) > 0 then
                set frontmost to true
              end if
            end if
          end tell
        end tell
        tell application "${appName}"
          activate
        end tell
      `;
    } else {
      // Just activate the application
      script = `
        tell application "${appName}"
          activate
        end tell
      `;
    }

    await execAsync(`osascript -e '${script}'`);
    console.log(`[MAIN] Activated application: ${appName}`);
  } catch (error) {
    console.error(
      `[MAIN] Error activating application ${appName}:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Switch between Heidi and linked EMR window (Option+Space shortcut)
 */
async function switchBetweenLinkedWindows(): Promise<void> {
  if (!linkedEmrWindow) {
    console.log(
      "[MAIN] Cannot switch: No EMR window linked. Please link an EMR window first."
    );
    return;
  }

  const frontmostInfo = await getFrontmostWindowInfo();
  if (!frontmostInfo) {
    console.log("[MAIN] Cannot switch: Could not detect frontmost window");
    return;
  }

  const { appName, windowTitle } = frontmostInfo;
  const isHeidi = isHeidiWindow(appName, windowTitle);
  const isLinkedEmr = matchesLinkedEmrWindow(appName, windowTitle);

  if (isHeidi) {
    // Currently in Heidi, switch to linked EMR
    console.log(
      `[MAIN] Switching from Heidi to linked EMR: ${linkedEmrWindow.appName}`
    );
    await activateApplicationWindow(
      linkedEmrWindow.appName,
      linkedEmrWindow.windowTitle
    );
  } else if (isLinkedEmr) {
    // Currently in linked EMR, switch to Heidi
    console.log("[MAIN] Switching from linked EMR to Heidi");
    // Find Heidi application name (could be "Heidi" or similar)
    // Try common Heidi app names
    const heidiAppNames = ["Heidi", "heidi"];
    let heidiFound = false;

    for (const heidiAppName of heidiAppNames) {
      try {
        await activateApplicationWindow(heidiAppName);
        heidiFound = true;
        break;
      } catch (error) {
        // Try next app name
        continue;
      }
    }

    if (!heidiFound) {
      // Fallback: try to find any app with "Heidi" in the name
      const script = `
        tell application "System Events"
          repeat with proc in (every application process whose visible is true)
            set procName to name of proc
            if procName contains "Heidi" or procName contains "heidi" then
              tell process procName
                set frontmost to true
              end tell
              tell application procName
                activate
              end tell
              return procName
            end if
          end repeat
        end tell
      `;
      try {
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        const result = stdout.trim();
        if (result) {
          console.log(`[MAIN] Found and activated Heidi app: ${result}`);
        } else {
          console.log("[MAIN] Could not find Heidi application");
        }
      } catch (error) {
        console.error("[MAIN] Error finding Heidi application:", error);
      }
    }
  } else {
    console.log(
      `[MAIN] Currently in ${appName}, not Heidi or linked EMR. Cannot switch.`
    );
  }
}

/**
 * Check if main panel should be allowed to open (only when linked to EMR)
 */
async function canOpenMainPanel(): Promise<boolean> {
  // Main panel can ONLY open when linked to an EMR window
  if (!linkedEmrWindow) {
    return false;
  }

  const frontmostInfo = await getFrontmostWindowInfo();
  if (!frontmostInfo) {
    return false;
  }

  const { appName, windowTitle } = frontmostInfo;
  const appNameLower = appName.toLowerCase();
  const isOurWindow =
    appNameLower.includes("electron") ||
    appName === app.getName() ||
    appNameLower.includes("electron-floating-agent");
  const isHeidi = isHeidiWindow(appName, windowTitle);

  // When one of our own Electron windows is frontmost (icon, pairing, panel),
  // allow opening since we're linked. This is important when connecting from the pairing
  // window, which is an Electron window.
  if (isOurWindow) {
    return true;
  }

  // After link: allow in Heidi or linked EMR context
  const isLinkedEmr = matchesLinkedEmrWindow(appName, windowTitle);
  return isHeidi || isLinkedEmr;
}

/**
 * Toggle panel visibility with slide animation (no window pushing)
 */
async function togglePanel(): Promise<void> {
  const panelWidth = 400;

  // Check if we're in the right context to open panel
  const canOpen = await canOpenMainPanel();
  if (!canOpen && !isPanelVisible) {
    if (!linkedEmrWindow) {
      console.log(
        "[MAIN] Cannot open panel - no EMR window linked. Please link an EMR window first."
      );
    } else {
      console.log(
        "[MAIN] Cannot open panel - not in Heidi or linked EMR context"
      );
    }
    return;
  }

  if (!isPanelVisible) {
    // Show panel
    if (!mainWindow) {
      createMainPanelWindow();
    }

    // Push windows to make room for the panel (macOS only).
    // If we have linked windows, push both Heidi and EMR.
    // Otherwise, push the frontmost window.
    try {
      if (linkedEmrWindow) {
        // Push both linked windows
        const { heidiBounds, emrBounds } = await pushLinkedWindows(panelWidth);
        savedHeidiBounds = heidiBounds;
        savedEmrBounds = emrBounds;
        // Also save the frontmost one for backwards compatibility
        const pushedBounds = await pushFrontmostWindow(panelWidth);
        savedWindowBounds = pushedBounds;
        hasPushedWindow = !!(heidiBounds || emrBounds || pushedBounds);
      } else {
        // No linked windows, just push frontmost window
        const pushedBounds = await pushFrontmostWindow(panelWidth);
        if (pushedBounds) {
          savedWindowBounds = pushedBounds;
          hasPushedWindow = true;
        } else {
          savedWindowBounds = null;
          hasPushedWindow = false;
        }
        savedHeidiBounds = null;
        savedEmrBounds = null;
      }
    } catch (error) {
      console.error(
        "[MAIN] Error pushing windows before opening panel:",
        error
      );
      savedWindowBounds = null;
      savedHeidiBounds = null;
      savedEmrBounds = null;
      hasPushedWindow = false;
    }

    // Hide floating icon and pairing window when showing panel
    if (floatingIconWindow) {
      floatingIconWindow.hide();
    }
    if (pairingWindow && pairingWindow.isVisible()) {
      pairingWindow.hide();
    }

    // Now show and slide in the panel. Use showInactive so we don't steal
    // focus from Heidi/EMR when the panel appears.
    if (mainWindow) {
      if (
        process.platform === "darwin" &&
        typeof mainWindow.showInactive === "function"
      ) {
        mainWindow.showInactive();
      } else {
        mainWindow.show();
      }
    }
    await slideIn(panelWidth);

    // If no EMR window is linked, show pairing window as secondary popup
    if (!linkedEmrWindow) {
      // Small delay to let main panel finish sliding in
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!pairingWindow) {
        createPairingWindow();
      }
      if (pairingWindow) {
        if (
          process.platform === "darwin" &&
          typeof pairingWindow.showInactive === "function"
        ) {
          pairingWindow.showInactive();
        } else {
          pairingWindow.show();
        }
      }
    }
  } else {
    // Hide panel
    await slideOut(panelWidth);

    // Restore windows that were pushed
    if (hasPushedWindow) {
      // Restore linked windows if we have them
      if (linkedEmrWindow && (savedHeidiBounds || savedEmrBounds)) {
        try {
          // Restore Heidi window if it was pushed
          if (savedHeidiBounds) {
            await restoreFrontmostWindow(savedHeidiBounds);
          }
          // Restore EMR window if it was pushed
          if (savedEmrBounds) {
            await restoreFrontmostWindow(savedEmrBounds);
          }
          // Also ensure both are full width (in case restore didn't work perfectly)
          await restoreLinkedWindows();
        } catch (error) {
          console.error(
            "[MAIN] Error restoring linked windows on panel close:",
            error
          );
          // Fallback: try to restore both to full width
          try {
            await restoreLinkedWindows();
          } catch (fallbackError) {
            console.error("[MAIN] Error in fallback restore:", fallbackError);
          }
        }
      } else if (savedWindowBounds) {
        // No linked windows, just restore the frontmost window that was pushed
        try {
          await restoreFrontmostWindow(savedWindowBounds);
        } catch (error) {
          console.error(
            "[MAIN] Error restoring frontmost window on panel close:",
            error
          );
        }
      }

      // Clear saved bounds
      savedWindowBounds = null;
      savedHeidiBounds = null;
      savedEmrBounds = null;
      hasPushedWindow = false;
    }

    // Hide pairing window if visible
    if (pairingWindow && pairingWindow.isVisible()) {
      pairingWindow.hide();
    }

    // Hide window completely after sliding out
    mainWindow?.hide();

    // Show floating icon after panel is hidden
    // Always position at bottom-right (both linked and unlinked)
    if (floatingIconWindow) {
      positionIconBottomRight();
      if (
        process.platform === "darwin" &&
        typeof floatingIconWindow.showInactive === "function"
      ) {
        floatingIconWindow.showInactive();
      } else {
        floatingIconWindow.show();
      }
    }
  }
}

function createMainPanelWindow() {
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
  mainWindow.hide(); // Ensure it starts hidden

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173?view=panel");
    mainWindow.webContents.openDevTools();
  } else {
    const filePath = path.join(__dirname, "../dist/renderer/index.html");
    mainWindow.loadURL(`file://${filePath}?view=panel`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Position floating icon at bottom-right of screen
 */
function positionIconBottomRight(): void {
  if (!floatingIconWindow) return;
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  const iconSize = 48;
  const x = screenWidth - iconSize - 20;
  const y = screenHeight - iconSize - 20;
  floatingIconWindow.setBounds({ x, y, width: iconSize, height: iconSize });
}

/**
 * Position floating icon at bottom-left of screen
 */
function positionIconBottomLeft(): void {
  if (!floatingIconWindow) return;
  const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const iconSize = 48;
  const x = 20;
  const y = screenHeight - iconSize - 20;
  floatingIconWindow.setBounds({ x, y, width: iconSize, height: iconSize });
}

function createFloatingIconWindow() {
  const iconSize = 48;

  floatingIconWindow = new BrowserWindow({
    width: iconSize,
    height: iconSize,
    x: 0, // Will be positioned by positionIconBottomRight
    y: 0,
    alwaysOnTop: true,
    focusable: false, // Never take keyboard focus
    resizable: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Position at bottom-right initially (unlinked state)
  positionIconBottomRight();

  if (process.env.NODE_ENV === "development") {
    floatingIconWindow.loadURL("http://localhost:5173?view=icon");
  } else {
    const filePath = path.join(__dirname, "../dist/renderer/index.html");
    floatingIconWindow.loadURL(`file://${filePath}?view=icon`);
  }

  floatingIconWindow.on("closed", () => {
    floatingIconWindow = null;
  });
}

function createPairingWindow() {
  const pairingWidth = 450;
  const pairingHeight = 400;
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  // Position pairing window above the icon (bottom-right alignment)
  let x = screenWidth - pairingWidth - 20;
  let y = screenHeight - 400 - 48 - 20 - 8; // Above icon with 8px gap

  // If icon exists, position relative to it
  if (floatingIconWindow) {
    const iconBounds = floatingIconWindow.getBounds();
    // Align bottom-left of pairing window with bottom-right of icon
    x = iconBounds.x + iconBounds.width - pairingWidth;
    y = iconBounds.y - pairingHeight - 8; // 8px gap above icon
  }

  // Clamp to screen bounds
  x = Math.max(0, Math.min(x, screenWidth - pairingWidth));
  y = Math.max(0, Math.min(y, screenHeight - pairingHeight));

  pairingWindow = new BrowserWindow({
    width: pairingWidth,
    height: pairingHeight,
    x: x,
    y: y,
    alwaysOnTop: true,
    resizable: false,
    frame: true,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    pairingWindow.loadURL("http://localhost:5173?view=pairing");
    pairingWindow.webContents.openDevTools();
  } else {
    const filePath = path.join(__dirname, "../dist/renderer/index.html");
    pairingWindow.loadURL(`file://${filePath}?view=pairing`);
  }

  pairingWindow.on("closed", () => {
    pairingWindow = null;
  });
}

/**
 * Handle icon click - show pairing window if not linked, otherwise toggle main panel
 */
async function handleIconClick(): Promise<void> {
  if (!linkedEmrWindow) {
    // Not linked: show pairing window anchored above icon
    if (!pairingWindow) {
      createPairingWindow();
    } else {
      // Reposition pairing window above icon if it already exists
      const { width: screenWidth, height: screenHeight } =
        screen.getPrimaryDisplay().workAreaSize;
      const pairingWidth = 450;
      const pairingHeight = 400;

      if (floatingIconWindow) {
        const iconBounds = floatingIconWindow.getBounds();
        let x = iconBounds.x + iconBounds.width - pairingWidth;
        let y = iconBounds.y - pairingHeight - 8; // 8px gap above icon

        // Clamp to screen bounds
        x = Math.max(0, Math.min(x, screenWidth - pairingWidth));
        y = Math.max(0, Math.min(y, screenHeight - pairingHeight));

        pairingWindow.setBounds({
          x,
          y,
          width: pairingWidth,
          height: pairingHeight,
        });
      }
    }
    // Small delay to ensure window is ready
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (pairingWindow) {
      if (
        process.platform === "darwin" &&
        typeof pairingWindow.showInactive === "function"
      ) {
        pairingWindow.showInactive();
      } else {
        pairingWindow.show();
      }
    }
    // Keep icon visible (don't hide it)
  } else {
    // Linked: toggle main panel
    await togglePanel();
  }
}

/**
 * Check if linked EMR window still exists and clear if not
 */
async function validateLinkedEmrWindow(): Promise<void> {
  if (!linkedEmrWindow) {
    return;
  }

  const visibleWindows = await listVisibleWindows();
  // Sometimes AppleScript can intermittently return no windows; in that case,
  // skip validation rather than clearing the link incorrectly.
  if (visibleWindows.length === 0) {
    console.warn(
      "[MAIN] validateLinkedEmrWindow: no windows returned, skipping validation"
    );
    return;
  }

  const stillExists = visibleWindows.some(
    (win) =>
      win.appName === linkedEmrWindow!.appName &&
      (win.windowTitle === linkedEmrWindow!.windowTitle ||
        win.windowTitle.includes(linkedEmrWindow!.windowTitle) ||
        linkedEmrWindow!.windowTitle.includes(win.windowTitle))
  );

  if (!stillExists) {
    console.log(
      `[MAIN] Linked EMR window "${linkedEmrWindow.appName}" no longer exists, clearing link`
    );
    linkedEmrWindow = null;
    updateAgentState({ linkedEmrWindow: undefined });
  }
}

/**
 * Window watcher - shows/hides floating icon and main panel based on frontmost window
 */
async function updateFloatingIconVisibility(): Promise<void> {
  // If main panel is visible, ensure icon and pairing window stay hidden
  if (isPanelVisible) {
    if (floatingIconWindow && floatingIconWindow.isVisible()) {
      floatingIconWindow.hide();
    }
    if (pairingWindow && pairingWindow.isVisible()) {
      pairingWindow.hide();
    }
    // Don't update visibility while panel is open
    return;
  }

  // Validate linked window still exists (check every 5 seconds)
  const shouldValidate = Math.random() < 0.2; // ~20% chance per call (roughly every 5 seconds)
  if (shouldValidate) {
    await validateLinkedEmrWindow();
  }

  const frontmostInfo = await getFrontmostWindowInfo();
  if (!frontmostInfo) {
    if (floatingIconWindow) {
      floatingIconWindow.hide();
    }
    // Close main panel if open and not in valid context
    if (isPanelVisible) {
      await slideOut(400);
      if (mainWindow) {
        mainWindow.hide();
      }
    }
    // Don't close pairing window if it's our own window (might be frontmost)
    return;
  }

  const { appName, windowTitle } = frontmostInfo;

  // Check if frontmost is our own Electron window
  const appNameLower = appName.toLowerCase();
  const isOurWindow =
    appNameLower.includes("electron") ||
    appName === app.getName() ||
    appNameLower.includes("electron-floating-agent");

  // Check if Heidi or linked EMR is frontmost
  const isHeidi = isHeidiWindow(appName, windowTitle);
  const isLinkedEmr = matchesLinkedEmrWindow(appName, windowTitle);
  const canOpen = linkedEmrWindow ? isHeidi || isLinkedEmr : isHeidi;

  // Update last known Heidi context
  if (isHeidi) {
    lastKnownHeidiContext = true;
  } else if (isLinkedEmr) {
    // When linked EMR is frontmost, clear Heidi context (pairing window shouldn't show)
    lastKnownHeidiContext = false;
  } else if (!isOurWindow) {
    // Clear Heidi context when switching to a completely different window
    lastKnownHeidiContext = false;
  }

  // When one of our own Electron windows (icon, pairing, main panel) is frontmost,
  // don't auto-close or change visibility based on external context. This prevents
  // the panel from immediately closing right after we programmatically open it.
  if (isOurWindow) {
    return;
  }

  // When Heidi is frontmost:
  // - Always show icon
  // - Don't auto-hide pairing window (let user control open/closed state)
  if (isHeidi) {
    // Always show icon when Heidi is frontmost (always at bottom-right)
    if (floatingIconWindow) {
      positionIconBottomRight();
      if (
        process.platform === "darwin" &&
        typeof floatingIconWindow.showInactive === "function"
      ) {
        floatingIconWindow.showInactive();
      } else {
        floatingIconWindow.show();
      }
    }
    // Don't hide pairing window - preserve its current state (open/closed)
    // User can toggle it via icon click
    return;
  }

  // When linked EMR is frontmost:
  // - Show icon
  // - Hide pairing window (only for Heidi when not linked)
  if (isLinkedEmr && linkedEmrWindow) {
    if (floatingIconWindow) {
      positionIconBottomRight();
      if (
        process.platform === "darwin" &&
        typeof floatingIconWindow.showInactive === "function"
      ) {
        floatingIconWindow.showInactive();
      } else {
        floatingIconWindow.show();
      }
    }
    // Hide pairing window when in linked EMR context
    if (pairingWindow && pairingWindow.isVisible()) {
      pairingWindow.hide();
    }
    return;
  }

  // When our own windows are frontmost, preserve Heidi context state
  // This allows pairing window to stay open while user interacts with it
  // But only if we were in Heidi context and not linked
  if (isOurWindow && lastKnownHeidiContext && !linkedEmrWindow) {
    // Keep icon visible when our windows are frontmost in Heidi context
    if (floatingIconWindow) {
      positionIconBottomRight();
      if (
        process.platform === "darwin" &&
        typeof floatingIconWindow.showInactive === "function"
      ) {
        floatingIconWindow.showInactive();
      } else {
        floatingIconWindow.show();
      }
    }
    // Don't hide pairing window - preserve its state
    return;
  }

  // Update floating icon visibility for other contexts
  if (floatingIconWindow) {
    if (canOpen) {
      // Always position at bottom-right
      positionIconBottomRight();
      if (
        process.platform === "darwin" &&
        typeof floatingIconWindow.showInactive === "function"
      ) {
        floatingIconWindow.showInactive();
      } else {
        floatingIconWindow.show();
      }
    } else {
      floatingIconWindow.hide();
    }
  }

  // Close main panel and pairing window if not in valid context
  if (!canOpen) {
    if (isPanelVisible) {
      console.log(
        "[MAIN] Closing panel - no longer in Heidi or linked EMR context"
      );
      await slideOut(400);
      if (mainWindow) {
        mainWindow.hide();
      }

      // Restore windows that were pushed when the panel auto-closes
      if (hasPushedWindow) {
        // Restore linked windows if we have them
        if (linkedEmrWindow && (savedHeidiBounds || savedEmrBounds)) {
          try {
            // Restore Heidi window if it was pushed
            if (savedHeidiBounds) {
              await restoreFrontmostWindow(savedHeidiBounds);
            }
            // Restore EMR window if it was pushed
            if (savedEmrBounds) {
              await restoreFrontmostWindow(savedEmrBounds);
            }
            // Also ensure both are full width (in case restore didn't work perfectly)
            await restoreLinkedWindows();
          } catch (error) {
            console.error(
              "[MAIN] Error restoring linked windows on auto panel close:",
              error
            );
            // Fallback: try to restore both to full width
            try {
              await restoreLinkedWindows();
            } catch (fallbackError) {
              console.error(
                "[MAIN] Error in fallback restore on auto close:",
                fallbackError
              );
            }
          }
        } else if (savedWindowBounds) {
          // No linked windows, just restore the frontmost window that was pushed
          try {
            await restoreFrontmostWindow(savedWindowBounds);
          } catch (error) {
            console.error(
              "[MAIN] Error restoring frontmost window on auto panel close:",
              error
            );
          }
        }

        // Clear saved bounds
        savedWindowBounds = null;
        savedHeidiBounds = null;
        savedEmrBounds = null;
        hasPushedWindow = false;
      }
    }
    // Hide pairing window when switching away from Heidi to non-linked window
    if (pairingWindow && pairingWindow.isVisible()) {
      console.log(
        "[MAIN] Hiding pairing window - switched to non-linked window"
      );
      pairingWindow.hide();
    }
  }
}

app.whenReady().then(async () => {
  // Validate Heidi API configuration
  validateHeidiConfig();

  // Register IPC handlers FIRST before creating windows
  // (windows may try to call IPC handlers immediately on load)
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

  // Heidi API IPC handlers
  ipcMain.handle("heidi:fetchSession", async (_, sessionId: string) => {
    try {
      const result = await fetchSession(sessionId);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[MAIN] Error in heidi:fetchSession handler:", error);
      return {
        ok: false,
        error: `Failed to fetch session: ${errorMessage}`,
      };
    }
  });

  // Window management IPC handlers
  ipcMain.handle("agent:listWindows", async () => {
    const windows = await listVisibleWindows();
    return { windows };
  });

  ipcMain.handle(
    "agent:setLinkedEmrWindow",
    async (_, window: LinkedWindow) => {
      linkedEmrWindow = window;
      updateAgentState({ linkedEmrWindow: window });
      console.log("[MAIN] Linked EMR window set:", window);

      // Close pairing window after successful link
      if (pairingWindow) {
        pairingWindow.close();
      }

      // Small delay to ensure pairing window closes
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Auto-open main panel after connecting
      // Check if we're in Heidi context (pairing window only shows in Heidi context)
      // Even if frontmost is our pairing window, we should allow opening
      const frontmostInfo = await getFrontmostWindowInfo();
      const isInHeidiContext = frontmostInfo
        ? isHeidiWindow(frontmostInfo.appName, frontmostInfo.windowTitle)
        : lastKnownHeidiContext;

      // If we're in Heidi context or were in Heidi context, allow opening
      if ((isInHeidiContext || lastKnownHeidiContext) && !isPanelVisible) {
        // Ensure Heidi/EMR is frontmost before opening panel (so window pushing works correctly)
        if (isInHeidiContext && frontmostInfo) {
          // We're in Heidi, make sure Heidi is frontmost
          const heidiAppNames = ["Heidi", "heidi"];
          for (const heidiAppName of heidiAppNames) {
            try {
              await activateApplicationWindow(heidiAppName);
              break;
            } catch (error) {
              // Try next app name
              continue;
            }
          }
        } else if (lastKnownHeidiContext) {
          // We were in Heidi context, reactivate Heidi
          const heidiAppNames = ["Heidi", "heidi"];
          for (const heidiAppName of heidiAppNames) {
            try {
              await activateApplicationWindow(heidiAppName);
              break;
            } catch (error) {
              // Try next app name
              continue;
            }
          }
        }

        // Small delay to ensure window activation completes
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Open main panel automatically (this will push the window)
        await togglePanel();
      } else if (floatingIconWindow && !isPanelVisible) {
        // Ensure icon is at bottom-right and visible
        positionIconBottomRight();
        floatingIconWindow.show();
      }

      // Update icon visibility and positioning
      await updateFloatingIconVisibility();

      return { success: true };
    }
  );

  ipcMain.handle("agent:getLinkedEmrWindow", () => {
    return { window: linkedEmrWindow || undefined };
  });

  ipcMain.handle("ui:iconClicked", async () => {
    await handleIconClick();
  });

  // Toggle panel visibility (slide in/out with window push)
  ipcMain.handle("toggle-panel", async () => {
    await togglePanel();
    return { success: true, isVisible: isPanelVisible };
  });

  // Now create windows
  createMainPanelWindow();
  createFloatingIconWindow();

  // Start window watcher
  windowWatcherInterval = setInterval(() => {
    updateFloatingIconVisibility().catch((error) => {
      console.error("[MAIN] Error in window watcher:", error);
    });
  }, 1000);

  // Initial visibility update
  await updateFloatingIconVisibility().catch((error) => {
    console.error("[MAIN] Error in initial window watcher update:", error);
  });

  // Show pairing window initially if not linked and in Heidi context
  const canOpen = await canOpenMainPanel();
  if (!linkedEmrWindow && canOpen) {
    // Small delay to ensure windows are ready
    setTimeout(() => {
      if (!pairingWindow) {
        createPairingWindow();
      } else {
        // Reposition pairing window above icon if it already exists
        const { width: screenWidth, height: screenHeight } =
          screen.getPrimaryDisplay().workAreaSize;
        const pairingWidth = 450;
        const pairingHeight = 400;

        if (floatingIconWindow) {
          const iconBounds = floatingIconWindow.getBounds();
          let x = iconBounds.x + iconBounds.width - pairingWidth;
          let y = iconBounds.y - pairingHeight - 8; // 8px gap above icon

          // Clamp to screen bounds
          x = Math.max(0, Math.min(x, screenWidth - pairingWidth));
          y = Math.max(0, Math.min(y, screenHeight - pairingHeight));

          pairingWindow.setBounds({
            x,
            y,
            width: pairingWidth,
            height: pairingHeight,
          });
        }
      }
      if (pairingWindow) {
        if (
          process.platform === "darwin" &&
          typeof pairingWindow.showInactive === "function"
        ) {
          pairingWindow.showInactive();
        } else {
          pairingWindow.show();
        }
      }
    }, 500);
  }

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

  // Option+Y: Toggle panel (slide in/out with window push)
  globalShortcut.register("Alt+Y", async () => {
    await togglePanel();
  });

  // Option+Tab: Switch between Heidi and linked EMR window
  globalShortcut.register("Alt+Tab", async () => {
    await switchBetweenLinkedWindows();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainPanelWindow();
      createFloatingIconWindow();
    }
  });
});

app.on("will-quit", () => {
  if (windowWatcherInterval) {
    clearInterval(windowWatcherInterval);
    windowWatcherInterval = null;
  }
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
