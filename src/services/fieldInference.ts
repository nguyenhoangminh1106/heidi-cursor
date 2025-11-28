import axios from "axios";
import { EmrFieldContext, HeidiFieldValue, AgentFieldMapping } from "../types/agent";
import { OcrResult } from "./ocr";
import { heidiFieldSchema } from "../fieldsConfig";

export interface HeidiField {
  id: string;
  label: string;
  examples: string[];
}

export interface FieldInferenceResult {
  fieldId: string | null;
  confidence: number;
  reasoning?: string;
}

/**
 * Infer which Heidi field the user is currently editing based on OCR text
 * Uses a simple LLM call (can be OpenAI, Anthropic, or local)
 */
export async function inferFieldFromOCR(
  ocrText: string,
  heidiFields: HeidiField[]
): Promise<FieldInferenceResult> {
  // For now, use a simple heuristic-based approach
  // In production, this would call an LLM API

  const normalizedText = ocrText.toLowerCase();

  // Try to match field labels and examples
  for (const field of heidiFields) {
    const fieldLabelLower = field.label.toLowerCase();

    // Check if OCR text contains the field label
    if (normalizedText.includes(fieldLabelLower)) {
      return {
        fieldId: field.id,
        confidence: 0.9,
        reasoning: `Matched field label: ${field.label}`,
      };
    }

    // Check examples
    for (const example of field.examples) {
      if (normalizedText.includes(example.toLowerCase())) {
        return {
          fieldId: field.id,
          confidence: 0.85,
          reasoning: `Matched example: ${example}`,
        };
      }
    }
  }

  // Fallback: try partial matches
  for (const field of heidiFields) {
    const keywords = field.label.toLowerCase().split(/\s+/);
    const matchCount = keywords.filter((kw) =>
      normalizedText.includes(kw)
    ).length;

    if (matchCount >= keywords.length * 0.5) {
      return {
        fieldId: field.id,
        confidence: 0.7,
        reasoning: `Partial match with ${matchCount}/${keywords.length} keywords`,
      };
    }
  }

  return {
    fieldId: null,
    confidence: 0,
    reasoning: "No match found",
  };
}

/**
 * Call LLM API for field inference (optional - for more sophisticated matching)
 * This is a placeholder that can be wired to OpenAI/Anthropic/etc.
 */
export async function inferFieldWithLLM(
  ocrText: string,
  heidiFields: HeidiField[],
  apiKey?: string,
  apiUrl?: string
): Promise<FieldInferenceResult> {
  // If no API configured, fall back to heuristic
  if (!apiKey || !apiUrl) {
    return inferFieldFromOCR(ocrText, heidiFields);
  }

  const prompt = `Given this EMR form text snippet extracted via OCR:
"${ocrText}"

And these Heidi fields:
${heidiFields
  .map((f) => `- ${f.id}: ${f.label} (examples: ${f.examples.join(", ")})`)
  .join("\n")}

Which Heidi field is the user currently editing? Respond with ONLY the field id (e.g., "patientName") or "NONE" if no match.

Field ID:`;

  try {
    // Example OpenAI API call (adjust based on your LLM provider)
    const response = await axios.post(
      apiUrl,
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 50,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const fieldId = response.data.choices[0]?.message?.content?.trim() || null;

    if (fieldId === "NONE" || !fieldId) {
      return {
        fieldId: null,
        confidence: 0,
        reasoning: "LLM returned NONE",
      };
    }

    // Validate fieldId exists in our schema
    const matchedField = heidiFields.find((f) => f.id === fieldId);
    if (matchedField) {
      return {
        fieldId,
        confidence: 0.95,
        reasoning: `LLM matched: ${matchedField.label}`,
      };
    }

    // Fallback to heuristic if LLM returned invalid ID
    return inferFieldFromOCR(ocrText, heidiFields);
  } catch (error) {
    console.error(
      "[INFERENCE] LLM API error, falling back to heuristic:",
      error
    );
    return inferFieldFromOCR(ocrText, heidiFields);
  }
}

/**
 * Infer EMR field context from OCR result near cursor
 */
export async function inferCurrentEmrFieldContext(
  ocrResult: OcrResult,
  centerPoint?: { x: number; y: number }
): Promise<EmrFieldContext | null> {
  const text = ocrResult.plainText;
  if (!text || text.trim().length === 0) {
    console.log("[INFERENCE] No OCR text available");
    return null;
  }

  console.log("[INFERENCE] Inferring EMR field from OCR text:", text.substring(0, 100));

  // Find the best label candidate from OCR blocks
  let bestLabel = "";
  let bestConfidence = 0;

  // If we have blocks with bounds, prefer those near center
  if (ocrResult.blocks.length > 0 && centerPoint) {
    console.log("[INFERENCE] Using", ocrResult.blocks.length, "OCR blocks with bounds");
    for (const block of ocrResult.blocks) {
      if (block.bounds) {
        const blockCenterX = block.bounds.x + block.bounds.width / 2;
        const blockCenterY = block.bounds.y + block.bounds.height / 2;
        const distance = Math.sqrt(
          Math.pow(blockCenterX - centerPoint.x, 2) +
          Math.pow(blockCenterY - centerPoint.y, 2)
        );
        
        // Prefer blocks closer to center
        const confidence = 1 / (1 + distance / 100);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestLabel = block.text;
        }
      }
    }
  }

  // Fallback: use plain text and try to extract label
  if (!bestLabel) {
    // Look for common label patterns
    const labelPatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[:]/i,  // "Patient Name:"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-]/i,  // "Patient Name -"
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,       // Start of line
    ];

    for (const pattern of labelPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        bestLabel = match[1].trim();
        bestConfidence = 0.7;
        console.log("[INFERENCE] Found label via pattern:", bestLabel);
        break;
      }
    }

    // If no pattern match, use first line or first few words
    if (!bestLabel) {
      const firstLine = text.split(/[\n\r]+/)[0].trim();
      const words = firstLine.split(/\s+/).slice(0, 3);
      bestLabel = words.join(" ");
      bestConfidence = 0.5;
      console.log("[INFERENCE] Using first line as label:", bestLabel);
    }
  }

  if (!bestLabel) {
    console.log("[INFERENCE] Could not extract label from OCR text");
    return null;
  }

  // Generate a field ID from the label (no longer tied to fixed schema)
  const fieldId = bestLabel.toLowerCase().replace(/\s+/g, "_").replace(/[^\w_]/g, "");
  console.log("[INFERENCE] Generated field ID:", fieldId);

  return {
    id: fieldId,
    labelText: bestLabel,
    // bounds would be set if we had detailed OCR block info
  };
}

/**
 * Map a label text to a Heidi field ID
 */
function mapLabelToFieldId(
  labelText: string,
  schema: HeidiField[]
): string | null {
  const normalizedLabel = labelText.toLowerCase();

  // Try exact matches first
  for (const field of schema) {
    const fieldLabelLower = field.label.toLowerCase();
    if (normalizedLabel === fieldLabelLower || normalizedLabel.includes(fieldLabelLower)) {
      return field.id;
    }

    // Check examples
    for (const example of field.examples) {
      if (normalizedLabel.includes(example.toLowerCase())) {
        return field.id;
      }
    }
  }

  // Try partial matches
  for (const field of schema) {
    const keywords = field.label.toLowerCase().split(/\s+/);
    const matchCount = keywords.filter((kw) => normalizedLabel.includes(kw)).length;
    
    if (matchCount >= keywords.length * 0.5) {
      return field.id;
    }
  }

  return null;
}

/**
 * Heuristic field matcher using string similarity and type hints
 */
function matchFieldHeuristically(
  emrText: string,
  heidiFields: HeidiFieldValue[]
): HeidiFieldValue | null {
  const emrTextLower = emrText.toLowerCase();
  let bestMatch: HeidiFieldValue | null = null;
  let bestScore = 0;
  const MIN_SCORE_THRESHOLD = 0.5;

  for (const heidiField of heidiFields) {
    const heidiLabelLower = heidiField.label.toLowerCase();
    const heidiIdLower = heidiField.id.toLowerCase();
    let score = 0;

    // Exact label match (highest score)
    if (emrTextLower === heidiLabelLower) {
      score = 1.0;
    } else if (emrTextLower.includes(heidiLabelLower) || heidiLabelLower.includes(emrTextLower)) {
      score = 0.85;
    }

    // ID match
    if (emrTextLower.includes(heidiIdLower) || heidiIdLower.includes(emrTextLower)) {
      score = Math.max(score, 0.8);
    }

    // Keyword overlap
    const heidiKeywords = heidiLabelLower.split(/\s+/).filter((kw) => kw.length > 2);
    const emrKeywords = emrTextLower.split(/\s+/).filter((kw) => kw.length > 2);

    const matchingKeywords = heidiKeywords.filter((kw) =>
      emrKeywords.some((ekw) => ekw.includes(kw) || kw.includes(ekw))
    );

    if (heidiKeywords.length > 0) {
      const keywordScore = matchingKeywords.length / Math.max(heidiKeywords.length, emrKeywords.length);
      score = Math.max(score, keywordScore * 0.7);
    }

    // Type-based matching (if AI provided type hints)
    if (heidiField.type) {
      const emrType = inferEmrFieldType(emrText);
      if (emrType && heidiField.type.toLowerCase() === emrType.toLowerCase()) {
        score = Math.max(score, score * 1.1); // Boost score if types match
      }
    }

    // Confidence boost from AI
    if (heidiField.confidence) {
      score = score * (0.7 + heidiField.confidence * 0.3); // Scale by AI confidence
    }

    if (score > bestScore && score >= MIN_SCORE_THRESHOLD) {
      bestScore = score;
      bestMatch = heidiField;
    }
  }

  if (bestMatch) {
    console.log(
      "[INFERENCE] Heuristic match:",
      bestMatch.label,
      "score:",
      bestScore.toFixed(2)
    );
  }

  return bestMatch;
}

/**
 * Infer field type from EMR text (simple heuristics)
 */
function inferEmrFieldType(text: string): string | null {
  const lower = text.toLowerCase();

  // Date patterns
  if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text) || lower.includes("date") || lower.includes("dob")) {
    return "date";
  }

  // ID patterns
  if (/\d{8,}/.test(text) || lower.includes("id") || lower.includes("mrn") || lower.includes("medicare")) {
    return "id";
  }

  // Name patterns
  if (lower.includes("name") || lower.includes("patient")) {
    return "name";
  }

  // Number patterns
  if (/^\d+$/.test(text.trim())) {
    return "number";
  }

  return null;
}

/**
 * Match an EMR field to the best Heidi field using heuristics
 */
export function matchHeidiFieldToEmrField(
  emrField: EmrFieldContext,
  heidiFields: HeidiFieldValue[]
): HeidiFieldValue | null {
  const emrText = emrField.labelText;
  console.log("[INFERENCE] Matching EMR field:", emrText, "to", heidiFields.length, "Heidi fields");

  // Use heuristic matcher
  return matchFieldHeuristically(emrText, heidiFields);
}

/**
 * Create an agent field mapping from EMR context and Heidi fields
 */
export async function getMappingForCurrentField(
  ocrResult: OcrResult,
  heidiFields: HeidiFieldValue[],
  centerPoint?: { x: number; y: number }
): Promise<AgentFieldMapping | null> {
  const emrField = await inferCurrentEmrFieldContext(ocrResult, centerPoint);
  if (!emrField) {
    return null;
  }

  const heidiField = matchHeidiFieldToEmrField(emrField, heidiFields);

  return {
    emrField,
    heidiField,
  };
}
