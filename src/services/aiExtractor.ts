import axios from "axios";
import { getVisionAiConfig, isVisionAiEnabled } from "../config/aiConfig";
import {
  AiExtractedField,
  AiExtractionRequest,
  AiExtractionResult,
} from "../types/ai";

/**
 * Convert image buffer to base64 data URL
 */
function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

/**
 * Extract structured fields from Heidi screenshot using AI vision/LLM
 */
export async function extractHeidiFieldsFromImage(
  request: AiExtractionRequest
): Promise<AiExtractionResult> {
  const config = getVisionAiConfig();

  if (!config.enabled) {
    throw new Error(
      "Vision AI not configured. Please set OPENAI_API_KEY (for OpenAI) or CLAUDE_API_KEY (for Claude) environment variables."
    );
  }

  const { imageBuffer, hint } = request;
  const base64Image = bufferToBase64(imageBuffer);

  console.log("[AI] Extracting fields from image using AI...");
  console.log("[AI] Provider:", config.provider, "Model:", config.modelId);

  try {
    const result = await callAiApi(config, base64Image, hint);
    console.log("[AI] Extracted", result.fields.length, "fields");
    return result;
  } catch (error) {
    console.error("[AI] Error extracting fields:", error);
    throw new Error(
      `AI extraction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Call the AI API (OpenAI-compatible format)
 */
async function callAiApi(
  config: ReturnType<typeof getVisionAiConfig>,
  base64Image: string,
  hint?: string
): Promise<AiExtractionResult> {
  const prompt = `You are parsing a clinical note screenshot from a mental health EMR system called Heidi. 

Extract all useful patient and clinical information fields from this image. Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "id": "snake_case_field_id",
    "label": "Human readable label",
    "value": "extracted value",
    "type": "name|date|id|text|number|list",
    "confidence": 0.0-1.0
  }
]

Guidelines:
- Use snake_case for field IDs (e.g., "patient_name", "date_of_birth", "mrn", "primary_diagnosis")
- Extract patient demographics (name, DOB, MRN, insurance, etc.)
- Extract clinical information (diagnoses, medications, notes, visit reason, etc.)
- Set confidence based on how clear/complete the extraction is
- Set type appropriately (name, date, id, text, number, list)
- If a field is not visible or unclear, omit it (don't include low-confidence guesses)
- Return ONLY the JSON array, no markdown, no explanation

${hint ? `\nContext hint: ${hint}\n` : ""}

JSON array:`;

  // Build request based on provider
  let requestBody: any;
  let headers: any = {
    "Content-Type": "application/json",
  };

  if (config.provider === "openai") {
    // OpenAI format
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
      max_tokens: 2000,
      temperature: 0.1,
    };
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else if (config.provider === "claude" || config.provider === "anthropic") {
    // Claude/Anthropic format - text must come first, then image
    requestBody = {
      model: config.modelId,
      max_tokens: 2000,
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
    // Fallback to OpenAI format
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
      max_tokens: 2000,
      temperature: 0.1,
    };
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  let response;
  try {
    response = await axios.post(config.apiUrl!, requestBody, { headers });
  } catch (error: any) {
    if (error.response) {
      console.error("[AI] API Error Response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url,
        model: requestBody.model,
      });
    }
    throw error;
  }

  // Extract JSON from response based on provider
  let jsonText: string;
  if (config.provider === "openai") {
    jsonText = response.data.choices[0]?.message?.content || "";
  } else if (config.provider === "claude" || config.provider === "anthropic") {
    // Claude/Anthropic API format - response.content is an array of content blocks
    const contentBlocks = response.data.content || [];
    // Find the text block (usually the first one)
    const textBlock = contentBlocks.find((block: any) => block.type === "text");
    jsonText = textBlock?.text || contentBlocks[0]?.text || "";
  } else {
    // Fallback for other providers
    jsonText =
      response.data.content ||
      response.data.text ||
      JSON.stringify(response.data);
  }

  // Clean up JSON (remove markdown code blocks if present)
  jsonText = jsonText.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```json\s*/, "")
      .replace(/^```\s*/, "")
      .replace(/```\s*$/, "");
  }

  // Parse JSON
  let fields: AiExtractedField[];
  try {
    fields = JSON.parse(jsonText);
  } catch (parseError) {
    console.error(
      "[AI] Failed to parse JSON response:",
      jsonText.substring(0, 500)
    );
    throw new Error(`Invalid JSON response from AI: ${parseError}`);
  }

  // Validate structure
  if (!Array.isArray(fields)) {
    throw new Error("AI response is not an array");
  }

  // Validate and sanitize each field
  const validatedFields: AiExtractedField[] = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    if (!field || typeof field !== "object") {
      console.warn(`[AI] Invalid field at index ${index}, skipping`);
      continue;
    }

    const validated: AiExtractedField = {
      id: String(field.id || `field_${index}`),
      label: String(field.label || "Unknown"),
      value: String(field.value || ""),
      type: field.type ? String(field.type) : undefined,
      confidence:
        typeof field.confidence === "number"
          ? Math.max(0, Math.min(1, field.confidence))
          : 0.5,
    };

    if (validated.value.length > 0) {
      validatedFields.push(validated);
    }
  }

  return { fields: validatedFields };
}

/**
 * Check if Vision AI extraction is configured
 * @deprecated Use isVisionAiEnabled from config/aiConfig instead
 */
export function isAiExtractionConfigured(): boolean {
  return isVisionAiEnabled();
}
