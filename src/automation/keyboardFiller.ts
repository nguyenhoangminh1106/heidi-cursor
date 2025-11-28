import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PASTE_DELAY_MS = 100;
const TAB_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Escape for AppleScript string literal
function escapeAppleScriptString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Type the text directly character-by-character for maximum reliability
// This is slower but much more stable across different EMR systems
async function typeTextDirect(text: string): Promise<void> {
  console.log(`[AUTOMATION] Typing ${text.length} characters directly...`);

  // For short text (< 50 chars), type all at once (faster)
  // For longer text, type character-by-character (more reliable)
  if (text.length <= 50) {
    const escaped = escapeAppleScriptString(text);
    const script = `
      tell application "System Events"
        keystroke "${escaped}"
      end tell
    `;
    try {
      await execAsync(`osascript -e '${script}'`);
      await sleep(100 + text.length * 10); // Delay proportional to length
    } catch (error) {
      console.error(
        `[AUTOMATION] Bulk typing failed, falling back to character-by-character:`,
        error
      );
      // Fall through to character-by-character method
      await typeTextCharacterByCharacter(text);
    }
  } else {
    // Long text: type character-by-character for reliability
    await typeTextCharacterByCharacter(text);
  }
}

// Type text character-by-character (most reliable but slower)
async function typeTextCharacterByCharacter(text: string): Promise<void> {
  console.log(`[AUTOMATION] Typing character-by-character for reliability...`);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const escaped = escapeAppleScriptString(char);

    const script = `
      tell application "System Events"
        keystroke "${escaped}"
      end tell
    `;

    try {
      await execAsync(`osascript -e '${script}'`);
      // Small delay between characters (10-20ms)
      await sleep(15);
    } catch (error) {
      console.error(
        `[AUTOMATION] Error typing character "${char}" at position ${i}:`,
        error
      );
      // Continue with next character even if one fails
    }
  }

  // Final delay to ensure all characters are processed
  await sleep(100);
}

// Use AppleScript to press Tab key
export async function pressTab(): Promise<void> {
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

// Replace fillField to use direct typing (no clipboard)
export async function fillField(value: string): Promise<void> {
  console.log(`[AUTOMATION] fillField called with value: "${value}"`);
  try {
    await typeTextDirect(value);
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
