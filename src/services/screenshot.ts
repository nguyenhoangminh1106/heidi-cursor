import { desktopCapturer, screen } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";
import { Rect } from "../types/agent";

export interface ScreenshotResult {
  imagePath: string;
  width: number;
  height: number;
}

/**
 * Captures a screenshot of the frontmost window or full screen
 * @deprecated Use captureFullScreen, captureRegion, or captureAroundPoint instead
 */
export async function captureScreenshot(cropAroundMouse?: {
  x: number;
  y: number;
  width?: number;
  height?: number;
}): Promise<ScreenshotResult> {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 1920, height: 1080 },
  });

  // Try to find the frontmost window first
  let source = sources.find(
    (s) => s.name !== "Electron" && s.name !== "Screen"
  );

  // Fallback to full screen if no window found
  if (!source) {
    source = sources.find((s) => s.name === "Screen");
  }

  if (!source) {
    throw new Error("Could not capture screenshot - no source found");
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

  // Save screenshot to temp file
  const tempDir = os.tmpdir();
  const imagePath = path.join(
    tempDir,
    `heidi-cursor-screenshot-${Date.now()}.png`
  );

  // Get the thumbnail image
  const image = source.thumbnail;
  if (!image) {
    throw new Error("Could not get screenshot thumbnail");
  }

  // Convert nativeImage to buffer
  const imageBuffer = image.toPNG();

  let finalBuffer = imageBuffer;
  let finalWidth = image.getSize().width;
  let finalHeight = image.getSize().height;

  // Crop around mouse position if specified
  if (cropAroundMouse) {
    const { x, y, width = 400, height = 300 } = cropAroundMouse;

    // Calculate crop region (ensure it's within bounds)
    const cropX = Math.max(0, Math.min(x - width / 2, finalWidth - width));
    const cropY = Math.max(0, Math.min(y - height / 2, finalHeight - height));
    const cropWidth = Math.min(width, finalWidth - cropX);
    const cropHeight = Math.min(height, finalHeight - cropY);

    finalBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor(cropX),
        top: Math.floor(cropY),
        width: Math.floor(cropWidth),
        height: Math.floor(cropHeight),
      })
      .toBuffer();

    finalWidth = cropWidth;
    finalHeight = cropHeight;
  }

  // Save to file
  await fs.promises.writeFile(imagePath, finalBuffer);

  return {
    imagePath,
    width: finalWidth,
    height: finalHeight,
  };
}

/**
 * Captures full screen screenshot
 */
export async function captureFullScreen(): Promise<Buffer> {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 1920, height: 1080 },
  });

  let source = sources.find((s) => s.name === "Screen");
  if (!source) {
    source = sources.find((s) => s.name !== "Electron");
  }

  if (!source || !source.thumbnail) {
    throw new Error("Could not capture screenshot - no source found");
  }

  return source.thumbnail.toPNG();
}

/**
 * Captures a specific region of the screen
 */
export async function captureRegion(rect: Rect): Promise<Buffer> {
  const fullScreenBuffer = await captureFullScreen();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

  // Ensure rect is within bounds
  const cropX = Math.max(0, Math.min(rect.x, screenWidth - rect.width));
  const cropY = Math.max(0, Math.min(rect.y, screenHeight - rect.height));
  const cropWidth = Math.min(rect.width, screenWidth - cropX);
  const cropHeight = Math.min(rect.height, screenHeight - cropY);

  return await sharp(fullScreenBuffer)
    .extract({
      left: Math.floor(cropX),
      top: Math.floor(cropY),
      width: Math.floor(cropWidth),
      height: Math.floor(cropHeight),
    })
    .toBuffer();
}

/**
 * Captures a region around a point (centered)
 */
export async function captureAroundPoint(
  point: { x: number; y: number },
  radius: number = 200
): Promise<Buffer> {
  const rect: Rect = {
    x: point.x - radius,
    y: point.y - radius,
    width: radius * 2,
    height: radius * 2,
  };
  return captureRegion(rect);
}

/**
 * Captures the Heidi region (full screen)
 */
export async function captureHeidiRegion(): Promise<Buffer> {
  // Capture full screen to get all Heidi data
  return captureFullScreen();
}

/**
 * Saves a buffer to a temporary file (for compatibility with existing code)
 */
export async function saveBufferToTempFile(
  buffer: Buffer,
  prefix: string = "heidi-cursor"
): Promise<string> {
  const tempDir = os.tmpdir();
  const imagePath = path.join(tempDir, `${prefix}-${Date.now()}.png`);
  await fs.promises.writeFile(imagePath, buffer);
  return imagePath;
}

/**
 * Get current mouse position using AppleScript
 * @deprecated Use mousePosition service instead
 */
export async function getMousePosition(): Promise<{
  x: number;
  y: number;
} | null> {
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  try {
    // Use a simpler approach that works better with osascript
    const script = `tell application "System Events" to get mouse location`;

    const { stdout } = await execAsync(`osascript -e '${script}'`);
    const output = stdout.trim();

    // Output format is typically "{x, y}" or "x, y"
    // Parse the coordinates
    const match = output.match(/\{?(\d+),\s*(\d+)\}?/);
    if (match) {
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      return { x, y };
    }

    // Fallback: try splitting by comma
    const parts = output.split(",").map((s: string) => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { x: parts[0], y: parts[1] };
    }

    console.error("[SCREENSHOT] Could not parse mouse position:", output);
    return null;
  } catch (error) {
    console.error("[SCREENSHOT] Failed to get mouse position:", error);
    return null;
  }
}
