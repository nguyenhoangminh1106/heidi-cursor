export type HeidiFieldId = string;

export interface HeidiFieldValue {
  id: HeidiFieldId;
  label: string;
  value: string;
  type?: string; // Semantic type: "name", "date", "id", "text", "number", "list", etc.
  confidence?: number; // 0-1 confidence score from AI extraction
}

export interface HeidiSnapshot {
  source: "ocr" | "api" | "ai";
  capturedAt: number;
  fields: HeidiFieldValue[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type EmrFieldId = string;

export interface EmrFieldContext {
  id: EmrFieldId;
  labelText: string; // OCR label, e.g. "Patient Name"
  placeholderText?: string; // if available
  bounds?: Rect; // approx. bounding box if OCR provides it
}

export interface AgentFieldMapping {
  emrField: EmrFieldContext;
  heidiField: HeidiFieldValue | null; // null if no match
}

export type AgentStatus = "idle" | "capturing" | "typing" | "error";

export interface SessionField {
  id: string;
  label: string;
  value: string;
  source?: "heidi" | "emr" | "other";
}

export interface AgentState {
  status: AgentStatus;
  sessionId?: string; // Unique identifier for the current session
  sessionFields: SessionField[]; // Generic key/value pairs captured in this session
  currentIndex: number; // Index into sessionFields (selected key)
  lastError?: string;
}
