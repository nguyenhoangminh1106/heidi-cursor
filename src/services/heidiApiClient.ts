import axios, { AxiosError } from "axios";
import { getHeidiConfig } from "../config/heidiConfig";

/**
 * Token cache to avoid unnecessary JWT requests
 */
interface TokenCache {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let tokenCache: TokenCache | null = null;

/**
 * Fetch JWT token from Heidi API /jwt endpoint
 * Uses Heidi-Api-Key header for authentication
 */
async function fetchJwtToken(
  email: string = "user@example.com",
  userId: string | number = 12345
): Promise<{ token: string; expirationTime: string }> {
  const config = getHeidiConfig();
  if (!config.apiKey) {
    throw new Error("HEIDI_API_KEY is not configured");
  }

  const jwtUrl = `${config.apiBaseUrl}/jwt`;
  const params = {
    email: email,
    third_party_internal_id: String(userId),
  };

  console.log(`[HEIDI] Fetching JWT from: ${jwtUrl}`);
  console.log(`[HEIDI] Params:`, params);
  console.log(`[HEIDI] Using API Key: ${config.apiKey?.substring(0, 10)}...`);

  try {
    const response = await axios.get(jwtUrl, {
      params: params,
      headers: {
        "Heidi-Api-Key": config.apiKey,
      },
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });

    if (response.status >= 200 && response.status < 300) {
      console.log(
        `[HEIDI] JWT fetched successfully (status: ${response.status})`
      );
      return {
        token: response.data.token,
        expirationTime: response.data.expiration_time,
      };
    } else {
      // Handle 4xx errors
      const errorMsg = `Heidi API JWT error: ${response.status} ${
        response.statusText
      } - ${
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data)
      }`;
      console.error(`[HEIDI] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const errorMsg = `Heidi API JWT error: ${axiosError.response.status} ${
          axiosError.response.statusText
        } - ${
          typeof axiosError.response.data === "string"
            ? axiosError.response.data
            : JSON.stringify(axiosError.response.data)
        }`;
        console.error(`[HEIDI] ${errorMsg}`);
        throw new Error(errorMsg);
      } else if (axiosError.request) {
        // Request was made but no response received
        console.error(`[HEIDI] JWT request failed - no response received`);
        console.error(`[HEIDI] Request URL: ${jwtUrl}`);
        console.error(`[HEIDI] Request config:`, {
          params: params,
          headers: { "Heidi-Api-Key": config.apiKey ? "***" : "missing" },
        });
        console.error(`[HEIDI] Error code:`, axiosError.code);
        console.error(`[HEIDI] Error message:`, axiosError.message);
        throw new Error(
          `Heidi API JWT request failed: No response received. URL: ${jwtUrl}, Error: ${
            axiosError.message || axiosError.code || "Unknown"
          }`
        );
      } else {
        const errorMsg = `Heidi API JWT request error: ${axiosError.message}`;
        console.error(`[HEIDI] ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[HEIDI] Unexpected error fetching JWT:`, errorMsg);
    throw error;
  }
}

/**
 * Get Heidi API access token (JWT)
 * Uses cached token if still valid, otherwise fetches a new one
 */
export async function getHeidiAccessToken(
  email: string = "user@example.com",
  userId: number = 12345
): Promise<string> {
  const config = getHeidiConfig();
  if (!config.enabled) {
    throw new Error(
      "Heidi API is not configured. Set HEIDI_API_KEY environment variable."
    );
  }

  // Check if we have a valid cached token
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    // Token is still valid (with 1 minute buffer)
    console.log("[HEIDI] Using cached JWT token");
    return tokenCache.token;
  }

  // Fetch new token
  console.log(
    `[HEIDI] Fetching new JWT token for email: ${email}, userId: ${userId}`
  );
  try {
    const jwtResponse = await fetchJwtToken(email, userId);
    const expirationTime = new Date(jwtResponse.expirationTime).getTime();

    // Cache the token
    tokenCache = {
      token: jwtResponse.token,
      expiresAt: expirationTime,
    };

    console.log(
      `[HEIDI] JWT token fetched and cached (expires: ${jwtResponse.expirationTime})`
    );

    return jwtResponse.token;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[HEIDI] Failed to fetch JWT token:", errorMessage);
    console.error("[HEIDI] Full error:", error);
    throw error;
  }
}

/**
 * Fetch documents for a session from Heidi API
 * Note: This function returns documents associated with the session, not the session itself
 */
export async function fetchSession(
  sessionId: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const config = getHeidiConfig();
  if (!config.enabled) {
    return {
      ok: false,
      error:
        "Heidi API is not configured. Set HEIDI_API_KEY environment variable.",
    };
  }

  try {
    // Get a valid JWT token
    const token = await getHeidiAccessToken();

    // Make API request to fetch session documents
    // Endpoint: GET /sessions/{sessionId}/documents
    const response = await axios.get(
      `${config.apiBaseUrl}/sessions/${sessionId}/documents`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      }
    );

    return {
      ok: true,
      data: response.data,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // API returned an error response
        return {
          ok: false,
          error: `Heidi API error: ${axiosError.response.status} ${
            axiosError.response.statusText
          } - ${
            typeof axiosError.response.data === "string"
              ? axiosError.response.data
              : JSON.stringify(axiosError.response.data)
          }`,
        };
      } else if (axiosError.request) {
        // Request was made but no response received
        return {
          ok: false,
          error: "Heidi API request failed: No response received",
        };
      } else {
        // Error setting up request
        return {
          ok: false,
          error: `Heidi API request error: ${axiosError.message}`,
        };
      }
    } else {
      // Non-Axios error
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        ok: false,
        error: `Heidi API error: ${errorMessage}`,
      };
    }
  }
}
