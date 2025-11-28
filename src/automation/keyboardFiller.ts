import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const KEY_DELAY_MS = 100;
const TAB_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Escape special characters for AppleScript
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Use AppleScript to type text on macOS
async function typeText(text: string): Promise<void> {
  console.log(`[AUTOMATION] typeText called with value: "${text}"`);
  console.log(`[AUTOMATION] Text length: ${text.length} characters`);

  const escapedText = escapeAppleScript(text);
  console.log(`[AUTOMATION] Escaped text: "${escapedText}"`);

  const script = `
    tell application "System Events"
      keystroke "${escapedText}"
    end tell
  `;

  console.log(`[AUTOMATION] AppleScript to execute:`, script);
  const command = `osascript -e '${script}'`;
  console.log(`[AUTOMATION] Full command: ${command}`);

  try {
    console.log(`[AUTOMATION] Executing osascript command...`);
    const result = await execAsync(command);
    console.log(`[AUTOMATION] Command executed successfully`);
    if (result.stdout) console.log(`[AUTOMATION] stdout: ${result.stdout}`);
    if (result.stderr) console.log(`[AUTOMATION] stderr: ${result.stderr}`);
    await sleep(KEY_DELAY_MS);
    console.log(`[AUTOMATION] typeText completed successfully`);
  } catch (error) {
    console.error(`[AUTOMATION] Error in typeText:`, error);
    if (error instanceof Error) {
      console.error(`[AUTOMATION] Error message: ${error.message}`);
      console.error(`[AUTOMATION] Error stack: ${error.stack}`);
      if (
        error.message.includes("not allowed assistive") ||
        error.message.includes("assistive")
      ) {
        throw new Error(
          "Accessibility permissions required. Please grant permissions in System Settings → Privacy & Security → Accessibility."
        );
      }
      throw new Error(`Failed to type text: ${error.message}`);
    }
    throw error;
  }
}

// Use AppleScript to press Tab key
async function pressTab(): Promise<void> {
  console.log(`[AUTOMATION] pressTab called`);
  // Use keystroke "\\t" which is more reliable than key code for Tab
  const script = `
    tell application "System Events"
      keystroke tab
    end tell
  `;

  console.log(`[AUTOMATION] Tab script:`, script);
  const command = `osascript -e '${script}'`;
  console.log(`[AUTOMATION] Tab command: ${command}`);

  try {
    console.log(`[AUTOMATION] Executing Tab command...`);
    const result = await execAsync(command);
    console.log(`[AUTOMATION] Tab command executed successfully`);
    if (result.stdout) console.log(`[AUTOMATION] Tab stdout: ${result.stdout}`);
    if (result.stderr) console.log(`[AUTOMATION] Tab stderr: ${result.stderr}`);
    await sleep(TAB_DELAY_MS);
    console.log(`[AUTOMATION] pressTab completed successfully`);
  } catch (error) {
    console.error(`[AUTOMATION] Error in pressTab:`, error);
    if (error instanceof Error) {
      console.error(`[AUTOMATION] Tab error message: ${error.message}`);
      console.error(`[AUTOMATION] Tab error stack: ${error.stack}`);
      if (
        error.message.includes("not allowed assistive") ||
        error.message.includes("assistive")
      ) {
        throw new Error(
          "Accessibility permissions required. Please grant permissions in System Settings → Privacy & Security → Accessibility."
        );
      }
      throw new Error(`Failed to press Tab: ${error.message}`);
    }
    throw error;
  }
}

export async function fillField(value: string): Promise<void> {
  console.log(`[AUTOMATION] fillField called with value: "${value}"`);
  try {
    await typeText(value);
    console.log(`[AUTOMATION] fillField completed successfully`);
  } catch (error) {
    console.error(`[AUTOMATION] Error in fillField:`, error);
    throw error;
  }
}

export async function fillFieldAndTab(value: string): Promise<void> {
  console.log(`[AUTOMATION] ========================================`);
  console.log(`[AUTOMATION] fillFieldAndTab STARTED`);
  console.log(`[AUTOMATION] Value to fill: "${value}"`);
  console.log(`[AUTOMATION] ========================================`);

  try {
    console.log(`[AUTOMATION] Step 1: Calling fillField...`);
    await fillField(value);
    console.log(`[AUTOMATION] Step 1: fillField completed`);

    // Add extra delay before Tab to ensure field value is fully entered
    console.log(`[AUTOMATION] Waiting before Tab...`);
    await sleep(100);

    console.log(`[AUTOMATION] Step 2: Calling pressTab...`);
    await pressTab();
    console.log(`[AUTOMATION] Step 2: pressTab completed`);

    console.log(`[AUTOMATION] ========================================`);
    console.log(`[AUTOMATION] fillFieldAndTab COMPLETED SUCCESSFULLY`);
    console.log(`[AUTOMATION] ========================================`);
  } catch (error) {
    console.error(`[AUTOMATION] ========================================`);
    console.error(`[AUTOMATION] fillFieldAndTab FAILED`);
    console.error(`[AUTOMATION] Error:`, error);
    console.error(`[AUTOMATION] ========================================`);

    // Provide more helpful error messages
    if (error instanceof Error) {
      if (error.message.includes("Accessibility permissions")) {
        throw error; // Re-throw with the helpful message
      }
      throw new Error(`Automation failed: ${error.message}`);
    }
    throw error;
  }
}
