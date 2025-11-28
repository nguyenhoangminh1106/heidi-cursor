/**
 * Heidi API Types
 * Types for Heidi API requests and responses
 */

/**
 * Patient Profile input for creating/updating profiles in Heidi
 * Based on Heidi API documentation: https://www.heidihealth.com/developers/heidi-api/patient-profiles
 */
export interface HeidiPatientProfileInput {
  first_name?: string;
  last_name?: string;
  birth_date?: string; // YYYY-MM-DD format
  gender?: "MALE" | "FEMALE" | "OTHER";
  ehr_patient_id?: string; // Patient's ID in your system
  phone?: string;
  email?: string;
  demographic_string?: string; // Display string for the patient
  additional_context?: string; // Additional context about the patient
  [key: string]: any;
}

/**
 * Patient Profile response from Heidi API
 */
export interface HeidiPatientProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  ehr_patient_id?: string;
  phone?: string;
  email?: string;
  demographic_string?: string;
  additional_context?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

/**
 * Session input for creating a session
 * Based on Heidi API documentation: https://www.heidihealth.com/developers/heidi-api/sessions
 */
export interface HeidiSessionInput {
  patient_profile_id?: string;
  session_name?: string;
  session_type?: string;
  language?: string; // e.g., "en-US"
  context?: string;
  additional_context?: string;
  [key: string]: any;
}

/**
 * Session response from Heidi API
 */
export interface HeidiSession {
  id: string;
  patient_profile_id?: string;
  session_name?: string;
  session_type?: string;
  language?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

/**
 * Session Overview response
 * May be returned from GET /sessions/{id}
 */
export interface HeidiSessionOverview {
  id: string;
  patient_profile_id?: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  duration?: number;
  [key: string]: any;
}

/**
 * Session Context response
 */
export interface HeidiSessionContext {
  patientHistory?: any;
  previousNotes?: any[];
  clinicalContext?: any;
  [key: string]: any;
}

/**
 * Transcription input for uploading audio
 * Based on Heidi API documentation: https://www.heidihealth.com/developers/heidi-api/transcription
 */
export interface HeidiTranscriptionInput {
  audio_file?: File | Blob | Buffer;
  [key: string]: any;
}

/**
 * Transcription response from Heidi API
 */
export interface HeidiTranscription {
  id?: string;
  session_id: string;
  transcript?: string;
  segments?: Array<{
    speaker?: string;
    text?: string;
    timestamp?: number;
    [key: string]: any;
  }>;
  status?: string;
  [key: string]: any;
}

/**
 * Consult Notes response
 * Based on Heidi API documentation: https://www.heidihealth.com/developers/heidi-api/consult-notes
 */
export interface HeidiConsultNote {
  id?: string;
  session_id: string;
  content?: string;
  format?: string; // MARKDOWN, HTML, etc.
  created_at?: string;
  [key: string]: any;
}

/**
 * Coding response (ICD/CPT codes)
 * Based on Heidi API documentation: https://www.heidihealth.com/developers/heidi-api/sessions/coding
 */
export interface HeidiCoding {
  session_id: string;
  icd_codes?: Array<{
    code?: string;
    description?: string;
    [key: string]: any;
  }>;
  cpt_codes?: Array<{
    code?: string;
    description?: string;
    [key: string]: any;
  }>;
  diagnosis_codes?: Array<{
    code?: string;
    description?: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * Document input for creating a document
 * Based on Heidi API documentation: https://www.heidihealth.com/developers/heidi-api/documents
 */
export interface HeidiDocumentInput {
  document_tab_type?: "DOCUMENT";
  generation_method?: "TEMPLATE";
  template_id?: string;
  voice_style?:
    | "GOLDILOCKS"
    | "DETAILED"
    | "BRIEF"
    | "SUPER_DETAILED"
    | "MY_VOICE";
  brain?: "LEFT" | "RIGHT";
  content_type?: "MARKDOWN" | "HTML";
  [key: string]: any;
}

/**
 * Document response from Heidi API
 */
export interface HeidiDocument {
  id: string;
  session_id: string;
  document_tab_type?: string;
  content?: string;
  content_type?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

/**
 * Ask Heidi request
 * Based on Heidi API documentation: https://www.heidihealth.com/developers/heidi-api/ask-heidi
 */
export interface HeidiAskHeidiRequest {
  session_id?: string;
  question?: string;
  context?: string;
  [key: string]: any;
}

/**
 * Ask Heidi response
 */
export interface HeidiAskHeidiResponse {
  answer?: string;
  session_id?: string;
  [key: string]: any;
}

/**
 * Generic Heidi API response wrapper
 */
export interface HeidiApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}
