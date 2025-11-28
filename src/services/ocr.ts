import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Rect } from "../types/agent";

const execAsync = promisify(exec);

export interface OcrBlock {
  text: string;
  bounds?: Rect;
}

export interface OcrResult {
  plainText: string;
  blocks: OcrBlock[];
}

/**
 * Legacy OCRResult interface for backward compatibility
 * @deprecated Use OcrResult instead
 */
export interface OCRResult {
  text: string;
  confidence?: number;
}

/**
 * Run OCR on an image buffer using Tesseract
 * Requires tesseract to be installed: brew install tesseract
 */
export async function recognize(imageBuffer: Buffer): Promise<OcrResult> {
  // Check if tesseract is available
  try {
    await execAsync("which tesseract");
  } catch (error) {
    throw new Error(
      "Tesseract OCR not found. Please install it: brew install tesseract"
    );
  }

  // Save buffer to temp file
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `ocr-temp-${Date.now()}.png`);
  await fs.promises.writeFile(tempPath, imageBuffer);

  try {
    // Run tesseract OCR with layout analysis (--psm 6)
    // This gives us better text extraction but not detailed bounding boxes
    // For more detailed blocks, we'd need to parse hOCR or use tesseract.js
    const command = `tesseract "${tempPath}" stdout -l eng --psm 6 2>/dev/null`;
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes("Warning")) {
      console.warn("[OCR] Tesseract stderr:", stderr);
    }

    const plainText = stdout.trim();

    // For now, create a single block with all text
    // In the future, we could parse hOCR output for detailed blocks
    const blocks: OcrBlock[] = plainText
      ? [
          {
            text: plainText,
            // bounds not available from simple tesseract output
          },
        ]
      : [];

    // Clean up temp file
    try {
      await fs.promises.unlink(tempPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    return {
      plainText,
      blocks,
    };
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.promises.unlink(tempPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    console.error("[OCR] Error running OCR:", error);
    throw new Error(
      `OCR failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Run OCR on an image file using Tesseract (legacy method)
 * @deprecated Use recognize() with a buffer instead
 */
export async function runOCR(imagePath: string): Promise<OCRResult> {
  const buffer = await fs.promises.readFile(imagePath);
  const result = await recognize(buffer);
  
  return {
    text: result.plainText,
    confidence: result.plainText.length > 0 ? 0.8 : 0,
  };
}

/**
 * Extract text from a screenshot region
 * @deprecated Use recognize() directly
 */
export async function extractTextFromRegion(
  imagePath: string,
  region?: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const result = await runOCR(imagePath);
  return result.text;
}
