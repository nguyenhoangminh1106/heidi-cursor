/**
 * Heidi API Configuration management
 * Reads from environment variables with safe defaults
 */

export interface HeidiConfig {
  apiKey?: string;
  apiBaseUrl?: string;
  enabled: boolean;
}

/**
 * Get Heidi API configuration from environment variables
 */
export function getHeidiConfig(): HeidiConfig {
  const apiKey = process.env.HEIDI_API_KEY;
  const envBaseUrl = process.env.HEIDI_API_BASE_URL;
  const defaultBaseUrl =
    "https://registrar.api.heidihealth.com/api/v2/ml-scribe/open-api";
  const apiBaseUrl = envBaseUrl || defaultBaseUrl;

  // Log configuration for debugging
  if (envBaseUrl) {
    console.log(
      `[HEIDI] Using HEIDI_API_BASE_URL from environment: ${envBaseUrl}`
    );
  } else {
    console.log(`[HEIDI] Using default base URL: ${defaultBaseUrl}`);
  }

  return {
    apiKey,
    apiBaseUrl,
    enabled: !!apiKey,
  };
}

/**
 * Check if Heidi API is configured and enabled
 */
export function isHeidiApiEnabled(): boolean {
  return getHeidiConfig().enabled;
}

/**
 * Validate Heidi API configuration and log warnings if missing
 */
export function validateHeidiConfig(): void {
  const config = getHeidiConfig();
  if (!config.enabled) {
    console.warn(
      "[HEIDI] Heidi API not configured. Set HEIDI_API_KEY environment variable to enable."
    );
  } else {
    console.log(
      `[HEIDI] Heidi API configured and enabled (base URL: ${config.apiBaseUrl})`
    );
    // Warn if base URL looks incorrect
    if (
      config.apiBaseUrl &&
      !config.apiBaseUrl.includes("registrar.api.heidihealth.com")
    ) {
      console.warn(
        `[HEIDI] WARNING: Base URL "${config.apiBaseUrl}" may be incorrect. Expected URL should contain "registrar.api.heidihealth.com". If you set HEIDI_API_BASE_URL, make sure it's correct.`
      );
    }
  }
}
