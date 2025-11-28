/**
 * Vision AI Configuration management
 * Supports OpenAI and Claude (Anthropic) for screenshot analysis
 * Reads from environment variables with sensible defaults
 */

export interface VisionAiConfig {
  apiKey?: string;
  apiUrl?: string;
  modelId?: string;
  provider?: "openai" | "claude" | "anthropic" | "custom";
  enabled: boolean;
}

/**
 * Get Vision AI configuration from environment variables
 * Supports both OpenAI and Claude (Anthropic)
 */
export function getVisionAiConfig(): VisionAiConfig {
  // Check which provider is configured
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const providerEnv = (
    process.env.VISION_AI_PROVIDER ||
    process.env.AI_PROVIDER ||
    ""
  ).toLowerCase();

  let apiKey: string | undefined;
  let apiUrl: string | undefined;
  let modelId: string | undefined;
  let provider: "openai" | "claude" | "anthropic" | "custom";

  // Determine provider based on env vars
  if (providerEnv === "claude" || providerEnv === "anthropic" || claudeKey) {
    // Claude / Anthropic
    provider = "claude";
    apiKey = claudeKey;
    apiUrl =
      process.env.CLAUDE_API_URL ||
      process.env.ANTHROPIC_API_URL ||
      "https://api.anthropic.com/v1/messages";
    modelId =
      process.env.CLAUDE_MODEL_ID ||
      process.env.ANTHROPIC_MODEL_ID ||
      "claude-sonnet-4-5-20250929";
  } else if (providerEnv === "openai" || openaiKey) {
    // OpenAI (default)
    provider = "openai";
    apiKey = openaiKey;
    apiUrl =
      process.env.OPENAI_API_URL ||
      "https://api.openai.com/v1/chat/completions";
    modelId = process.env.OPENAI_MODEL_ID || "gpt-4-vision-preview";
  } else {
    // Not configured
    provider = "openai";
  }

  return {
    apiKey,
    apiUrl,
    modelId,
    provider,
    enabled: !!(apiKey && apiUrl),
  };
}

/**
 * Check if Vision AI extraction is configured and enabled
 */
export function isVisionAiEnabled(): boolean {
  return getVisionAiConfig().enabled;
}

/**
 * @deprecated Use isVisionAiEnabled instead
 */
export function isAiExtractionEnabled(): boolean {
  return isVisionAiEnabled();
}

/**
 * @deprecated Use getVisionAiConfig instead
 */
export function getAiConfig() {
  return getVisionAiConfig();
}
