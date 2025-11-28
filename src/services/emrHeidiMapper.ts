import axios from "axios";
import { getVisionAiConfig, isVisionAiEnabled } from "../config/aiConfig";
import { EmrField } from "../types/emr";
import { HeidiFieldId, HeidiSnapshot } from "../types/agent";

/**
 * In-memory cache for EMR→Heidi field mappings
 * Key: `${emrLayoutId}:${emrFieldId}` → `heidiFieldId`
 */
const mappingCache = new Map<string, HeidiFieldId | null>();

/**
 * Normalize a string for comparison (lowercase, remove punctuation, collapse spaces)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate simple string similarity (0-1)
 */
function stringSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);

  if (norm1 === norm2) {
    return 1.0;
  }

  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.85;
  }

  // Token overlap
  const tokens1 = new Set(norm1.split(/\s+/));
  const tokens2 = new Set(norm2.split(/\s+/));
  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  if (union.size === 0) {
    return 0;
  }

  return intersection.size / union.size;
}

/**
 * Heuristic matching: try to match EMR field to Heidi field using string similarity
 */
function matchHeuristically(
  emrField: EmrField,
  heidiFields: HeidiSnapshot["fields"]
): HeidiFieldId | null {
  let bestMatch: HeidiFieldId | null = null;
  let bestScore = 0;
  const MIN_SCORE_THRESHOLD = 0.5;

  for (const heidiField of heidiFields) {
    // Compare against label
    const labelScore = stringSimilarity(emrField.label, heidiField.label);
    
    // Compare against ID
    const idScore = stringSimilarity(emrField.id, heidiField.id);

    // Use the best score
    const score = Math.max(labelScore, idScore);

    // Boost score if types match
    if (emrField.type && heidiField.type) {
      const typeMatch = emrField.type.toLowerCase() === heidiField.type.toLowerCase();
      if (typeMatch) {
        const boostedScore = score * 1.1;
        if (boostedScore > bestScore) {
          bestScore = boostedScore;
          bestMatch = heidiField.id;
        }
        continue;
      }
    }

    // Boost score if AI provided high confidence
    if (heidiField.confidence) {
      const confidenceBoosted = score * (0.7 + heidiField.confidence * 0.3);
      if (confidenceBoosted > bestScore) {
        bestScore = confidenceBoosted;
        bestMatch = heidiField.id;
      }
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = heidiField.id;
    }
  }

  if (bestScore >= MIN_SCORE_THRESHOLD && bestMatch) {
    console.log(
      `[MAPPER] Heuristic match: "${emrField.label}" → "${bestMatch}" (score: ${bestScore.toFixed(2)})`
    );
    return bestMatch;
  }

  console.log(
    `[MAPPER] No heuristic match for "${emrField.label}" (best score: ${bestScore.toFixed(2)})`
  );
  return null;
}

/**
 * Use AI to map EMR field to Heidi field
 */
async function matchWithAI(
  emrField: EmrField,
  heidiFields: HeidiSnapshot["fields"]
): Promise<HeidiFieldId | null> {
  const config = getVisionAiConfig();

  if (!config.enabled) {
    return null;
  }

  const prompt = `You are mapping an EMR (Electronic Medical Record) field to a Heidi field.

EMR Field:
- ID: ${emrField.id}
- Label: "${emrField.label}"
- Type: ${emrField.type}
- Section: ${emrField.section || "N/A"}

Available Heidi Fields:
${heidiFields
  .map(
    (f) =>
      `- ID: ${f.id}, Label: "${f.label}", Type: ${f.type || "unknown"}, Value: "${f.value.substring(0, 50)}${f.value.length > 50 ? "..." : ""}"`
  )
  .join("\n")}

Which Heidi field ID best matches this EMR field? Consider:
- Semantic meaning (e.g., "Patient Name" → "patient_name")
- Field types should be compatible
- Section context (demographics vs clinical)

Respond with ONLY the Heidi field ID (e.g., "patient_name") or "NONE" if no good match exists.

Heidi Field ID:`;

  try {
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
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      };
      headers.Authorization = `Bearer ${config.apiKey}`;
    } else if (config.provider === "claude" || config.provider === "anthropic") {
      requestBody = {
        model: config.modelId,
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      };
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      return null;
    }

    const response = await axios.post(config.apiUrl!, requestBody, { headers });

    let text: string;
    if (config.provider === "openai") {
      text = response.data.choices[0]?.message?.content?.trim() || "";
    } else {
      text = response.data.content[0]?.text?.trim() || "";
    }

    if (text === "NONE" || !text) {
      return null;
    }

    // Validate that the returned ID exists in Heidi fields
    const matchedField = heidiFields.find((f) => f.id === text);
    if (matchedField) {
      console.log(
        `[MAPPER] AI match: "${emrField.label}" → "${text}"`
      );
      return text;
    }

    // If AI returned invalid ID, fall back to heuristic
    console.warn(`[MAPPER] AI returned invalid field ID: "${text}", falling back to heuristic`);
    return matchHeuristically(emrField, heidiFields);
  } catch (error) {
    console.error("[MAPPER] AI mapping error:", error);
    return matchHeuristically(emrField, heidiFields);
  }
}

/**
 * Map an EMR field to a Heidi field ID
 * Uses heuristic matching first, then AI if enabled and heuristic fails
 */
export async function mapEmrFieldToHeidiField(
  emrField: EmrField,
  heidiSnapshot: HeidiSnapshot,
  emrLayoutId?: string
): Promise<HeidiFieldId | null> {
  // Check cache first
  if (emrLayoutId) {
    const cacheKey = `${emrLayoutId}:${emrField.id}`;
    const cached = mappingCache.get(cacheKey);
    if (cached !== undefined) {
      console.log(`[MAPPER] Using cached mapping: ${cacheKey} → ${cached || "null"}`);
      return cached;
    }
  }

  // Try heuristic first (fast, no API call)
  const heuristicMatch = matchHeuristically(emrField, heidiSnapshot.fields);
  if (heuristicMatch) {
    // Cache the result
    if (emrLayoutId) {
      mappingCache.set(`${emrLayoutId}:${emrField.id}`, heuristicMatch);
    }
    return heuristicMatch;
  }

  // If heuristic failed and AI is enabled, try AI matching
  if (isVisionAiEnabled()) {
    const aiMatch = await matchWithAI(emrField, heidiSnapshot.fields);
    // Cache the result (even if null)
    if (emrLayoutId) {
      mappingCache.set(`${emrLayoutId}:${emrField.id}`, aiMatch);
    }
    return aiMatch;
  }

  // No match found
  if (emrLayoutId) {
    mappingCache.set(`${emrLayoutId}:${emrField.id}`, null);
  }
  return null;
}

/**
 * Clear mapping cache (useful for testing or when Heidi fields change)
 */
export function clearMappingCache(): void {
  mappingCache.clear();
  console.log("[MAPPER] Mapping cache cleared");
}

