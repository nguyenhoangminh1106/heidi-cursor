import axios from "axios";
import { getVisionAiConfig } from "../config/aiConfig";
import { SessionField } from "../types/agent";
import { AiExtractedField } from "../types/ai";

/**
 * Extract session fields from a screenshot using AI
 * Generic extraction that works for any app (Heidi, EMR, etc.)
 */
export async function extractSessionFieldsFromImage(
  imageBuffer: Buffer
): Promise<SessionField[]> {
  const config = getVisionAiConfig();

  if (!config.enabled) {
    throw new Error(
      "Vision AI not configured. Please set OPENAI_API_KEY or CLAUDE_API_KEY environment variables."
    );
  }

  const base64Image = imageBuffer.toString("base64");

  console.log("[SESSION] Extracting session fields from image using AI...");
  console.log("[SESSION] Provider:", config.provider, "Model:", config.modelId);

  // Use a generic prompt that works for any clinical/medical app
  const prompt = `You are analyzing a screenshot from a clinical or medical application (could be Heidi, EMR, or any other system).

Extract all useful information fields from this image. Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "id": "snake_case_field_id",
    "label": "Human readable label",
    "value": "extracted value",
    "type": "name|date|id|text|number|list",
    "confidence": 0.0-1.0
  }
]

CRITICAL GUIDELINES:
- Extract clear key/value pairs where labels are obvious (e.g., "Patient Name", "MRN", "Date of Birth", "Diagnosis")
- For LONG, CONTINUOUS NOTES or narratives: return them as ONE or a FEW large fields (e.g., "note_page_1", "clinical_note", "progress_note"), NOT broken down line-by-line
- Only extract fields where you have HIGH CONFIDENCE (confidence >= 0.7). Skip ambiguous or unclear fields
- Use snake_case for field IDs (e.g., "patient_name", "date_of_birth", "mrn", "clinical_note")
- Set confidence based on how clear/complete the extraction is
- If a field is not visible or unclear, omit it (don't include low-confidence guesses)
- Return ONLY the JSON array, no markdown, no explanation

JSON array:`;

  try {
    // Call AI API directly with custom prompt
    const base64Image = imageBuffer.toString("base64");
    const fields = await callAiApiForSessionFields(config, base64Image, prompt);

    console.log(
      `[SESSION] Extracted ${fields.length} high-confidence fields from image`
    );
    return fields;
  } catch (error) {
    console.error("[SESSION] Error extracting fields:", error);
    throw new Error(
      `Session field extraction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Call AI API to extract session fields with custom prompt
 */
async function callAiApiForSessionFields(
  config: ReturnType<typeof getVisionAiConfig>,
  base64Image: string,
  prompt: string
): Promise<SessionField[]> {
  let requestBody: any;
  let headers: any = {
    "Content-Type": "application/json",
  };

  if (config.provider === "openai") {
    requestBody = {
      model: config.modelId,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    };
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else if (config.provider === "claude" || config.provider === "anthropic") {
    requestBody = {
      model: config.modelId,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image,
              },
            },
          ],
        },
      ],
    };
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    throw new Error(`Unsupported AI provider: ${config.provider}`);
  }

  const response = await axios.post(config.apiUrl!, requestBody, { headers });

  let jsonText: string;
  if (config.provider === "openai") {
    jsonText = response.data.choices[0]?.message?.content || "";
  } else {
    // Claude/Anthropic API format - response.content is an array of content blocks
    const contentBlocks = response.data.content || [];
    const textBlock = contentBlocks.find((block: any) => block.type === "text");
    jsonText = textBlock?.text || contentBlocks[0]?.text || "";
  }

  // Clean up JSON (remove markdown code blocks if present)
  jsonText = jsonText.trim();

  // Try to extract JSON from markdown code blocks (handles both objects and arrays)
  if (jsonText.startsWith("```")) {
    // Remove opening ```json or ```
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "");
    // Remove closing ```
    jsonText = jsonText.replace(/\n?```\s*$/, "");
    jsonText = jsonText.trim();
  }

  // Try to find JSON array in the text if it's not already clean JSON
  if (!jsonText.startsWith("[") && !jsonText.startsWith("{")) {
    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
    }
  }

  // Parse JSON
  let parsed: AiExtractedField[];
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    // If parsing fails, try to extract valid JSON array from truncated response
    console.warn(
      "[SESSION] Initial JSON parse failed, attempting to extract valid array:",
      jsonText.substring(0, 500)
    );

    // Try to find and parse a complete array by finding matching brackets
    let bracketCount = 0;
    let lastValidIndex = -1;
    for (let i = 0; i < jsonText.length; i++) {
      if (jsonText[i] === "[") bracketCount++;
      if (jsonText[i] === "]") bracketCount--;
      if (bracketCount === 0 && jsonText[i] === "]") {
        lastValidIndex = i;
        break;
      }
    }

    if (lastValidIndex > 0) {
      try {
        const truncatedJson = jsonText.substring(0, lastValidIndex + 1);
        parsed = JSON.parse(truncatedJson);
        console.log(
          `[SESSION] Successfully parsed truncated JSON (${parsed.length} fields)`
        );
      } catch (truncatedError) {
        console.error(
          "[SESSION] Failed to parse truncated JSON:",
          jsonText.substring(0, 1000)
        );
        throw new Error("AI returned invalid JSON");
      }
    } else {
      console.error(
        "[SESSION] Failed to parse AI response:",
        jsonText.substring(0, 1000)
      );
      throw new Error("AI returned invalid JSON");
    }
  }

  // Validate and convert to SessionField[], filtering low-confidence fields
  if (!Array.isArray(parsed)) {
    throw new Error("AI response is not an array");
  }

  const fields: SessionField[] = parsed
    .filter((f) => (f.confidence ?? 0.5) >= 0.7) // Only high-confidence fields
    .map((f) => ({
      id: String(f.id || `field_${Date.now()}`),
      label: String(f.label || "Unknown"),
      value: String(f.value || ""),
      source: "other" as const,
    }))
    .filter((f) => f.value.length > 0); // Only fields with values

  return fields;
}

/**
 * Calculate Jaccard similarity between two strings (token-based)
 */
function jaccardSimilarity(str1: string, str2: string): number {
  const tokens1 = new Set(
    str1
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );
  const tokens2 = new Set(
    str2
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );

  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Check if two values overlap significantly
 */
function valuesOverlap(value1: string, value2: string): boolean {
  // Check if one is a substring of the other
  const v1Lower = value1.toLowerCase().trim();
  const v2Lower = value2.toLowerCase().trim();

  if (v1Lower.length > 0 && v2Lower.length > 0) {
    if (v1Lower.includes(v2Lower) || v2Lower.includes(v1Lower)) {
      return true;
    }
  }

  // Check token-based similarity (Jaccard)
  const similarity = jaccardSimilarity(value1, value2);
  const OVERLAP_THRESHOLD = 0.5; // 50% token overlap = overlapping content

  return similarity >= OVERLAP_THRESHOLD;
}

/**
 * Merge incoming fields into existing session fields
 * Prevents overlapping content and enriches existing keys
 */
export function mergeSessionFields(
  existing: SessionField[],
  incoming: SessionField[]
): SessionField[] {
  const merged: SessionField[] = [...existing];
  const existingById = new Map<string, SessionField>();
  existing.forEach((f) => existingById.set(f.id, f));

  for (const incomingField of incoming) {
    const existingField = existingById.get(incomingField.id);

    if (!existingField) {
      // New field - add it
      merged.push(incomingField);
      console.log(
        `[SESSION] Added new field: "${incomingField.label}" (${incomingField.id})`
      );
    } else {
      // Field already exists - check for overlap
      if (valuesOverlap(existingField.value, incomingField.value)) {
        // Overlapping content - skip to avoid duplication
        console.log(
          `[SESSION] Skipped overlapping field "${incomingField.label}": content overlaps with existing`
        );
        continue;
      }

      // Non-overlapping content - check if it's a continuation
      // If the incoming value is significantly different and longer, append it
      const existingLength = existingField.value.length;
      const incomingLength = incomingField.value.length;

      if (
        incomingLength > existingLength * 0.5 && // Incoming is substantial
        !valuesOverlap(existingField.value, incomingField.value)
      ) {
        // Append with separator (likely continuation from scrolling)
        const updatedValue = `${existingField.value}\n\n${incomingField.value}`;
        const updatedField: SessionField = {
          ...existingField,
          value: updatedValue,
        };

        // Replace in merged array
        const index = merged.findIndex((f) => f.id === incomingField.id);
        if (index !== -1) {
          merged[index] = updatedField;
        }

        console.log(
          `[SESSION] Enriched field "${incomingField.label}": appended continuation`
        );
      } else {
        // Similar length or not clearly a continuation - skip
        console.log(
          `[SESSION] Skipped field "${incomingField.label}": similar content already exists`
        );
      }
    }
  }

  return merged;
}
