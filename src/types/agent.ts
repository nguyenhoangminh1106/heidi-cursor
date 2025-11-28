export type HeidiFieldId = string;

export interface HeidiFieldValue {
  id: HeidiFieldId;
  label: string;
  value: string;
  type?: string; // Semantic type: "name", "date", "id", "text", "number", "list", etc.
  confidence?: number; // 0-1 confidence score from AI extraction
}

export interface HeidiSnapshot {
  source: 'ocr' | 'api' | 'ai';
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
  labelText: string;        // OCR label, e.g. "Patient Name"
  placeholderText?: string; // if available
  bounds?: Rect;            // approx. bounding box if OCR provides it
}

export interface AgentFieldMapping {
  emrField: EmrFieldContext;
  heidiField: HeidiFieldValue | null; // null if no match
}

export type AgentStatus = 'idle' | 'synced' | 'filling' | 'error';

// Import EMR layout types
import { EmrField, EmrLayout } from './emr';
import { FillPlan } from './fillPlan';

export interface AgentState {
  status: AgentStatus;
  mapping: AgentFieldMapping[]; // Legacy: kept for backward compatibility
  currentIndex: number; // Legacy: index into mapping
  lastError?: string;
  currentEmrField?: EmrField; // Current EMR field under cursor (from layout analysis)
  emrLayout?: EmrLayout; // Current EMR layout if analyzed
  fillPlan?: FillPlan; // Linear fill plan (new approach)
  fillIndex?: number; // Current position in fill plan (0-based)
}

