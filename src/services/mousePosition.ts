import { screen } from "electron";

/**
 * Get current mouse position using Electron's screen API
 * Works on macOS, Windows, and Linux
 */
export async function getCurrentPosition(): Promise<{
  x: number;
  y: number;
} | null> {
  try {
    const point = screen.getCursorScreenPoint();
    if (
      typeof point?.x === "number" &&
      typeof point?.y === "number" &&
      !Number.isNaN(point.x) &&
      !Number.isNaN(point.y)
    ) {
      return { x: point.x, y: point.y };
    }

    console.error(
      "[MOUSE] screen.getCursorScreenPoint returned invalid point:",
      point
    );
    return null;
  } catch (error) {
    console.error("[MOUSE] Failed to get mouse position:", error);
    return null;
  }
}
