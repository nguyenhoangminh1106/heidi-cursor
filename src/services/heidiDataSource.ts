import { isVisionAiEnabled } from "../config/aiConfig";
import { heidiFieldSchema } from "../fieldsConfig";
import { HeidiFieldValue, HeidiSnapshot } from "../types/agent";
import { extractHeidiFieldsFromImage } from "./aiExtractor";
import { recognize } from "./ocr";
import { captureHeidiRegion } from "./screenshot";

export interface HeidiDataSource {
  refreshSnapshot(): Promise<HeidiSnapshot>;
  getSnapshot(): HeidiSnapshot | null;
}

/**
 * AI-based Heidi data source with OCR fallback
 * Captures Heidi screen region and extracts structured field data via AI vision/LLM
 * Falls back to OCR-based heuristics if AI is not configured
 */
export class OcrHeidiDataSource implements HeidiDataSource {
  private currentSnapshot: HeidiSnapshot | null = null;

  async refreshSnapshot(): Promise<HeidiSnapshot> {
    // Capture Heidi region (full screen)
    const imageBuffer = await captureHeidiRegion();
    console.log("[HEIDI] Captured Heidi region");

    // Try Vision AI extraction first if configured
    if (isVisionAiEnabled()) {
      try {
        console.log("[HEIDI] Using AI extraction...");
        const aiResult = await extractHeidiFieldsFromImage({
          imageBuffer,
          hint: "This is a mental health clinical note from Heidi EMR system",
        });

        // Map AI extracted fields to HeidiFieldValue
        const fields: HeidiFieldValue[] = aiResult.fields.map((aiField) => ({
          id: aiField.id,
          label: aiField.label,
          value: aiField.value,
          type: aiField.type,
          confidence: aiField.confidence,
        }));

        const snapshot: HeidiSnapshot = {
          source: "ai",
          capturedAt: Date.now(),
          fields,
        };

        this.currentSnapshot = snapshot;
        console.log(
          "[HEIDI] AI snapshot created with",
          fields.length,
          "fields"
        );
        return snapshot;
      } catch (error) {
        console.warn(
          "[HEIDI] AI extraction failed, falling back to OCR:",
          error
        );
        // Fall through to OCR fallback
      }
    }

    // Fallback to OCR-based extraction
    console.log("[HEIDI] Using OCR-based extraction...");
    try {
      const ocrResult = await recognize(imageBuffer);
      console.log(
        "[HEIDI] OCR completed, text length:",
        ocrResult.plainText.length
      );

      // Parse OCR text into structured fields using heuristics
      const fields = this.parseHeidiFieldsFallback(ocrResult);

      const snapshot: HeidiSnapshot = {
        source: "ocr",
        capturedAt: Date.now(),
        fields,
      };

      this.currentSnapshot = snapshot;
      console.log("[HEIDI] OCR snapshot created with", fields.length, "fields");
      return snapshot;
    } catch (error) {
      console.error("[HEIDI] Error refreshing snapshot:", error);
      throw new Error(
        `Failed to refresh Heidi snapshot: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  getSnapshot(): HeidiSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * Parse OCR text into structured Heidi fields using heuristics (fallback method)
   */
  private parseHeidiFieldsFallback(ocrResult: any): HeidiFieldValue[] {
    const text = ocrResult.plainText;
    const normalizedText = text.toLowerCase();
    const fields: HeidiFieldValue[] = [];

    console.log(
      "[HEIDI] Parsing Heidi fields from OCR text (length:",
      text.length,
      ")"
    );
    console.log("[HEIDI] First 500 chars of OCR text:", text.substring(0, 500));

    // Extract fields using pattern matching
    for (const schemaField of heidiFieldSchema) {
      const value = this.extractFieldValue(
        text,
        normalizedText,
        schemaField,
        heidiFieldSchema
      );
      if (value) {
        console.log(
          "[HEIDI] Extracted field:",
          schemaField.label,
          "=",
          value.substring(0, 50)
        );
        fields.push({
          id: schemaField.id,
          label: schemaField.label,
          value,
        });
      } else {
        console.log("[HEIDI] Could not extract field:", schemaField.label);
      }
    }

    console.log("[HEIDI] Parsed", fields.length, "fields from Heidi OCR");
    return fields;
  }

  /**
   * Extract a single field value from OCR text
   */
  private extractFieldValue(
    text: string,
    normalizedText: string,
    schemaField: { id: string; label: string; examples: string[] },
    allFields: Array<{ id: string; label: string; examples: string[] }>
  ): string | null {
    const labelLower = schemaField.label.toLowerCase();
    const examplesLower = schemaField.examples.map((e) => e.toLowerCase());

    // Try to find the field label or example in the text
    let labelIndex = -1;
    let labelPattern = "";
    let foundInOriginalCase = false;

    // First, try to find the full label (case-insensitive but preserve original)
    const labelRegex = new RegExp(
      schemaField.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    const labelMatch = text.match(labelRegex);
    if (labelMatch) {
      labelIndex = labelMatch.index!;
      labelPattern = labelMatch[0];
      foundInOriginalCase = true;
    }

    // Check for example matches
    if (labelIndex === -1) {
      for (const example of examplesLower) {
        // Try case-insensitive search
        const exampleRegex = new RegExp(
          example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
        const match = text.match(exampleRegex);
        if (match) {
          labelIndex = match.index!;
          labelPattern = match[0];
          foundInOriginalCase = true;
          break;
        }
      }
    }

    // Fallback to word-by-word matching
    if (labelIndex === -1) {
      const labelWords = labelLower.split(/\s+/).filter((w) => w.length > 2);
      for (const word of labelWords) {
        const wordRegex = new RegExp(
          "\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
          "i"
        );
        const match = text.match(wordRegex);
        if (match) {
          labelIndex = match.index!;
          labelPattern = match[0];
          foundInOriginalCase = true;
          break;
        }
      }
    }

    if (labelIndex === -1) {
      return null;
    }

    // Extract value after the label
    const afterLabel = text.substring(labelIndex + labelPattern.length);

    // Find where the next field label starts (to stop extraction)
    let nextFieldIndex = text.length;
    for (const otherField of allFields) {
      if (otherField.id === schemaField.id) continue;

      const otherLabelLower = otherField.label.toLowerCase();
      const otherExamples = otherField.examples.map((e) => e.toLowerCase());

      // Check if this other field appears after our current label
      const searchStart = labelIndex + labelPattern.length;
      const remainingText = normalizedText.substring(searchStart);

      for (const example of otherExamples) {
        const idx = remainingText.indexOf(example);
        if (idx !== -1 && idx < nextFieldIndex - searchStart) {
          nextFieldIndex = searchStart + idx;
        }
      }

      // Also check the full label
      const idx = remainingText.indexOf(otherLabelLower);
      if (idx !== -1 && idx < nextFieldIndex - searchStart) {
        nextFieldIndex = searchStart + idx;
      }
    }

    // Extract text between label and next field (or end of text)
    const valueText = text.substring(
      labelIndex + labelPattern.length,
      nextFieldIndex
    );

    // Try different delimiters and patterns
    const patterns = [
      /:\s*([^\n\r:]+?)(?:\n|$|(?=\s*[A-Z][a-z]+\s*[:]))/, // "Label: Value" stop at next label or newline
      /-\s*([^\n\r-]+?)(?:\n|$|(?=\s*[A-Z][a-z]+\s*[-]))/, // "Label - Value"
      /\s+([^\n\r]+?)(?:\n|$|(?=\s*[A-Z][a-z]+))/, // "Label Value" (stop before next capitalized word that might be a label)
    ];

    for (const pattern of patterns) {
      const match = valueText.match(pattern);
      if (match && match[1]) {
        let value = match[1].trim();

        // Clean up common OCR artifacts
        value = value
          .replace(/[|]/g, "l") // Common OCR mistake: | -> l
          .replace(/[0O]/g, (m, offset) => {
            // Context-aware: if surrounded by digits, likely 0; if in text, likely O
            const before = value.substring(Math.max(0, offset - 1), offset);
            const after = value.substring(
              offset + 1,
              Math.min(value.length, offset + 2)
            );
            if (/\d/.test(before) && /\d/.test(after)) return "0";
            return m;
          })
          .replace(/\s+/g, " ")
          .trim();

        // Validate value length and content
        if (value.length > 0 && value.length < 500 && !/^[^\w]*$/.test(value)) {
          return value;
        }
      }
    }

    // Fallback: extract first line or first meaningful chunk
    const lines = valueText
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length > 0) {
      let value = lines[0];

      // Stop at common field delimiters or next likely field label
      const stopPattern = /^(.+?)(?:\s*[:\-]\s*[A-Z]|$)/;
      const stopMatch = value.match(stopPattern);
      if (stopMatch) {
        value = stopMatch[1].trim();
      }

      // Clean up
      value = value.replace(/[|]/g, "l").replace(/\s+/g, " ").trim();

      if (value.length > 0 && value.length < 500 && !/^[^\w]*$/.test(value)) {
        return value;
      }
    }

    return null;
  }
}

// Export singleton instance
export const heidiDataSource = new OcrHeidiDataSource();
