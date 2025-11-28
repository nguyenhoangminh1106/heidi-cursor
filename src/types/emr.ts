import { Rect } from "./agent";

/**
 * Unique identifier for an EMR field
 */
export type EmrFieldId = string;

/**
 * Represents a single input/display field in an EMR form
 */
export interface EmrField {
  id: EmrFieldId;
  label: string;
  type:
    | "text"
    | "number"
    | "date"
    | "long_text"
    | "select"
    | "checkbox"
    | "display";
  section?: string; // e.g., "demographics", "clinical_summary"
  boundingBox: Rect; // { x, y, width, height } in screen coordinates
  examples?: string[]; // Optional example values if detected
}

/**
 * Represents a complete EMR form layout/screen
 */
export interface EmrLayout {
  emrId: string; // Identifier for the EMR system (e.g., "acme_emr_v1")
  screenId: string; // Identifier for this specific screen/form (e.g., "patient_form", "consultation_form")
  fields: EmrField[];
  createdAt: number; // Timestamp when layout was analyzed
}

/**
 * Mapping from EMR field to Heidi field
 */
export interface EmrHeidiFieldMapping {
  emrFieldId: EmrFieldId;
  heidiFieldId: string; // HeidiFieldId
}
