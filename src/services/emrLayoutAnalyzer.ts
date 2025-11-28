import axios from "axios";
import * as crypto from "crypto";
import { getVisionAiConfig, isVisionAiEnabled } from "../config/aiConfig";
import { EmrField, EmrLayout } from "../types/emr";

/**
 * In-memory cache for EMR layouts
 * Key: `${emrId}:${screenId}` or hash of screenshot
 */
const layoutCache = new Map<string, EmrLayout>();

/**
 * Generate a simple hash of an image buffer for cache key
 */
function hashImageBuffer(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex").substring(0, 16);
}

/**
 * Get EMR identifier from active window title
 */
function getEmrId(): string {
  // Try to get active window title
  // For now, use a generic identifier
  // In the future, could detect specific EMR systems
  return "generic_emr";
}

/**
 * Get screen identifier (could be route, form name, etc.)
 * For now, use a hash of the screenshot
 */
function getScreenId(imageHash: string): string {
  return `screen_${imageHash}`;
}

/**
 * Analyze EMR layout from screenshot using AI vision
 */
export async function analyzeEmrLayout(
  imageBuffer: Buffer
): Promise<EmrLayout> {
  const config = getVisionAiConfig();

  if (!config.enabled) {
    throw new Error(
      "Vision AI not configured. Cannot analyze EMR layout without AI."
    );
  }

  const base64Image = imageBuffer.toString("base64");
  const emrId = getEmrId();
  const imageHash = hashImageBuffer(imageBuffer);
  const screenId = getScreenId(imageHash);

  // Check cache first
  const cacheKey = `${emrId}:${screenId}`;
  const cached = layoutCache.get(cacheKey);
  if (cached) {
    console.log("[EMR] Using cached layout:", cacheKey);
    return cached;
  }

  console.log("[EMR] Analyzing EMR layout with AI...");
  console.log("[EMR] Provider:", config.provider, "Model:", config.modelId);

  const prompt = `You are analyzing an EMR (Electronic Medical Record) form screenshot. 

Extract ALL visible input fields, text fields, dropdowns, checkboxes, and display fields from this form. For each field, identify:
1. The field label (e.g., "Patient Name", "Date of Birth", "Medications")
2. The field type (text, number, date, long_text, select, checkbox, display)
3. The bounding box coordinates (x, y, width, height) in pixels relative to the screenshot
4. The section/group it belongs to (e.g., "demographics", "clinical_summary", "medications")

CRITICAL: The order of fields in the array MUST follow the natural Tab order as a user would navigate through the form:
- Top-to-bottom, left-to-right reading order
- The first field in the array should be the first field a user would Tab into
- The last field should be the last field they would Tab into
- Array index = Tab sequence position (fields[0] is first Tab, fields[1] is second Tab, etc.)

Return ONLY a valid JSON object with this exact structure:
{
  "fields": [
    {
      "id": "snake_case_field_id",
      "label": "Field Label",
      "type": "text|number|date|long_text|select|checkbox|display",
      "section": "section_name",
      "boundingBox": {
        "x": 100,
        "y": 200,
        "width": 300,
        "height": 30
      },
      "examples": ["example value if visible"]
    }
  ]
}

Guidelines:
- Use snake_case for field IDs (e.g., "patient_name", "date_of_birth", "medications")
- Include ALL visible fields, even if they're empty
- Bounding boxes should tightly wrap the input area (not just the label)
- If a field spans multiple lines (like a textarea), include the full bounding box
- Group related fields into sections (demographics, clinical, medications, etc.)
- MOST IMPORTANT: Order fields by Tab sequence (top-to-bottom, left-to-right)
- Return ONLY the JSON object, no markdown, no explanation

JSON object:`;

  try {
    const fields = await callAiApiForLayout(config, base64Image, prompt);

    const layout: EmrLayout = {
      emrId,
      screenId,
      fields,
      createdAt: Date.now(),
    };

    // Cache the layout
    layoutCache.set(cacheKey, layout);
    console.log("[EMR] Layout analyzed:", fields.length, "fields found");

    return layout;
  } catch (error) {
    console.error("[EMR] Error analyzing layout:", error);
    throw new Error(
      `EMR layout analysis failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Call AI API to extract EMR layout fields
 */
async function callAiApiForLayout(
  config: ReturnType<typeof getVisionAiConfig>,
  base64Image: string,
  prompt: string
): Promise<EmrField[]> {
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
    // Claude
    jsonText = response.data.content[0]?.text || "";
  }

  // Extract JSON from markdown code blocks if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  }

  // Parse JSON
  let parsed: { fields: any[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    console.error(
      "[EMR] Failed to parse AI response:",
      jsonText.substring(0, 500)
    );
    throw new Error("AI returned invalid JSON");
  }

  // Validate and convert to EmrField[]
  if (!Array.isArray(parsed.fields)) {
    throw new Error("AI response missing 'fields' array");
  }

  const fields: EmrField[] = parsed.fields.map((f: any, index: number) => {
    if (!f.id || !f.label || !f.type || !f.boundingBox) {
      throw new Error(`Field ${index} missing required properties`);
    }

    const bb = f.boundingBox;
    if (
      typeof bb.x !== "number" ||
      typeof bb.y !== "number" ||
      typeof bb.width !== "number" ||
      typeof bb.height !== "number"
    ) {
      throw new Error(`Field ${index} has invalid boundingBox`);
    }

    return {
      id: f.id,
      label: f.label,
      type: f.type,
      section: f.section,
      boundingBox: {
        x: Math.round(bb.x),
        y: Math.round(bb.y),
        width: Math.round(bb.width),
        height: Math.round(bb.height),
      },
      examples: f.examples,
    };
  });

  return fields;
}

/**
 * Get or analyze EMR layout (with caching)
 */
export async function getOrAnalyzeLayout(
  imageBuffer: Buffer
): Promise<EmrLayout> {
  if (!isVisionAiEnabled()) {
    throw new Error("Vision AI not enabled. Cannot analyze EMR layout.");
  }

  return analyzeEmrLayout(imageBuffer);
}

/**
 * Clear layout cache (useful for testing or when EMR layout changes)
 */
export function clearLayoutCache(): void {
  layoutCache.clear();
  console.log("[EMR] Layout cache cleared");
}
