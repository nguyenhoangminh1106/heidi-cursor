import axios, { AxiosError } from "axios";
import { getHeidiConfig } from "../config/heidiConfig";
import {
  HeidiApiResponse,
  HeidiAskHeidiRequest,
  HeidiAskHeidiResponse,
  HeidiCoding,
  HeidiConsultNote,
  HeidiDocument,
  HeidiDocumentInput,
  HeidiPatientProfile,
  HeidiPatientProfileInput,
  HeidiSession,
  HeidiSessionContext,
  HeidiSessionInput,
  HeidiSessionOverview,
  HeidiTranscription,
  HeidiTranscriptionInput,
} from "../types/heidi";

/**
 * Token cache to avoid unnecessary JWT requests
 */
interface TokenCache {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let tokenCache: TokenCache | null = null;

/**
 * Request options for heidiRequest helper
 */
interface HeidiRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  params?: Record<string, any>;
  data?: any;
}

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
 * Core request helper for Heidi API
 * Handles JWT authentication, error handling, and response formatting
 */
async function heidiRequest<T = any>(
  options: HeidiRequestOptions
): Promise<HeidiApiResponse<T>> {
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

    // Build full URL
    const url = `${config.apiBaseUrl}${options.path}`;

    // Build request config
    const requestConfig: any = {
      method: options.method,
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000, // 10 second timeout
    };

    // Add query params for GET requests
    if (options.params) {
      requestConfig.params = options.params;
    }

    // Add request body for POST/PUT requests
    if (
      options.data &&
      (options.method === "POST" || options.method === "PUT")
    ) {
      requestConfig.data = options.data;
    }

    // Log request (without sensitive data)
    if (options.params) {
      console.log(
        `[HEIDI] ${options.method} ${url}?${new URLSearchParams(
          options.params
        ).toString()}`
      );
    } else {
      console.log(`[HEIDI] ${options.method} ${url}`);
    }

    const response = await axios(requestConfig);

    return {
      ok: true,
      data: response.data,
      status: response.status,
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
          status: axiosError.response.status,
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

// ============================================================================
// Patient Profiles
// Documentation: https://www.heidihealth.com/developers/heidi-api/patient-profiles
// ============================================================================

/**
 * Create a patient profile in Heidi
 * POST /patient-profiles
 */
export async function createPatientProfile(
  profile: HeidiPatientProfileInput
): Promise<HeidiApiResponse<HeidiPatientProfile>> {
  return heidiRequest<HeidiPatientProfile>({
    method: "POST",
    path: `/patient-profiles`,
    data: profile,
  });
}

/**
 * Get a patient profile by ID
 * GET /patient-profiles/{id}
 */
export async function getPatientProfile(
  id: string
): Promise<HeidiApiResponse<HeidiPatientProfile>> {
  return heidiRequest<HeidiPatientProfile>({
    method: "GET",
    path: `/patient-profiles/${id}`,
  });
}

/**
 * Update a patient profile
 * PUT /patient-profiles/{id}
 */
export async function updatePatientProfile(
  id: string,
  profile: HeidiPatientProfileInput
): Promise<HeidiApiResponse<HeidiPatientProfile>> {
  return heidiRequest<HeidiPatientProfile>({
    method: "PUT",
    path: `/patient-profiles/${id}`,
    data: profile,
  });
}

// ============================================================================
// Sessions
// Documentation: https://www.heidihealth.com/developers/heidi-api/sessions
// ============================================================================

/**
 * Create a new session
 * POST /sessions
 */
export async function createSession(
  session: HeidiSessionInput
): Promise<HeidiApiResponse<HeidiSession>> {
  return heidiRequest<HeidiSession>({
    method: "POST",
    path: `/sessions`,
    data: session,
  });
}

/**
 * Get a session by ID (returns session overview)
 * GET /sessions/{id}
 */
export async function getSession(
  sessionId: string
): Promise<HeidiApiResponse<HeidiSession>> {
  return heidiRequest<HeidiSession>({
    method: "GET",
    path: `/sessions/${sessionId}`,
  });
}

/**
 * Get session overview
 * GET /sessions/{id}
 * Note: This may return the same data as getSession, or may be a separate endpoint
 */
export async function getSessionOverview(
  sessionId: string
): Promise<HeidiApiResponse<HeidiSessionOverview>> {
  return heidiRequest<HeidiSessionOverview>({
    method: "GET",
    path: `/sessions/${sessionId}`,
  });
}

/**
 * Get session context
 * GET /sessions/{id}/context
 * Note: If this endpoint doesn't exist, context may be included in the session response
 */
export async function getSessionContext(
  sessionId: string
): Promise<HeidiApiResponse<HeidiSessionContext>> {
  return heidiRequest<HeidiSessionContext>({
    method: "GET",
    path: `/sessions/${sessionId}/context`,
  });
}

/**
 * Get session coding (ICD/CPT codes)
 * GET /sessions/{id}/coding
 */
export async function getSessionCoding(
  sessionId: string
): Promise<HeidiApiResponse<HeidiCoding>> {
  return heidiRequest<HeidiCoding>({
    method: "GET",
    path: `/sessions/${sessionId}/coding`,
  });
}

// ============================================================================
// Transcription
// Documentation: https://www.heidihealth.com/developers/heidi-api/transcription
// ============================================================================

/**
 * Upload audio for transcription
 * POST /sessions/{session_id}/transcription
 */
export async function uploadTranscription(
  sessionId: string,
  transcriptionInput: HeidiTranscriptionInput
): Promise<HeidiApiResponse<HeidiTranscription>> {
  // Note: This endpoint expects multipart/form-data with audio file
  // Implementation may need to be adjusted based on actual API requirements
  return heidiRequest<HeidiTranscription>({
    method: "POST",
    path: `/sessions/${sessionId}/transcription`,
    data: transcriptionInput,
  });
}

/**
 * Get session transcription
 * GET /sessions/{id}/transcription
 * Note: If this endpoint doesn't exist, transcription may be in documents
 */
export async function getSessionTranscription(
  sessionId: string
): Promise<HeidiApiResponse<HeidiTranscription>> {
  return heidiRequest<HeidiTranscription>({
    method: "GET",
    path: `/sessions/${sessionId}/transcription`,
  });
}

// ============================================================================
// Consult Notes
// Documentation: https://www.heidihealth.com/developers/heidi-api/consult-notes
// ============================================================================

/**
 * Get session consult notes
 * GET /sessions/{id}/consult-notes
 * Note: Consult notes may also be returned as documents with a specific type
 */
export async function getSessionConsultNotes(
  sessionId: string
): Promise<HeidiApiResponse<HeidiConsultNote>> {
  return heidiRequest<HeidiConsultNote>({
    method: "GET",
    path: `/sessions/${sessionId}/consult-notes`,
  });
}

// ============================================================================
// Documents
// Documentation: https://www.heidihealth.com/developers/heidi-api/documents
// ============================================================================

/**
 * Create a document for a session
 * POST /sessions/{session_id}/documents
 */
export async function createDocument(
  sessionId: string,
  documentInput: HeidiDocumentInput
): Promise<HeidiApiResponse<HeidiDocument>> {
  return heidiRequest<HeidiDocument>({
    method: "POST",
    path: `/sessions/${sessionId}/documents`,
    data: documentInput,
  });
}

/**
 * Get documents for a session
 * GET /sessions/{session_id}/documents
 */
export async function getSessionDocuments(
  sessionId: string
): Promise<HeidiApiResponse<HeidiDocument[]>> {
  return heidiRequest<HeidiDocument[]>({
    method: "GET",
    path: `/sessions/${sessionId}/documents`,
  });
}

/**
 * Fetch documents for a session (alias for getSessionDocuments)
 * @deprecated Use getSessionDocuments instead
 */
export async function fetchSession(
  sessionId: string
): Promise<HeidiApiResponse> {
  return getSessionDocuments(sessionId);
}

// ============================================================================
// Ask Heidi
// Documentation: https://www.heidihealth.com/developers/heidi-api/ask-heidi
// ============================================================================

/**
 * Ask Heidi a question
 * POST /ask-heidi
 */
export async function askHeidi(
  request: HeidiAskHeidiRequest
): Promise<HeidiApiResponse<HeidiAskHeidiResponse>> {
  return heidiRequest<HeidiAskHeidiResponse>({
    method: "POST",
    path: `/ask-heidi`,
    data: request,
  });
}
