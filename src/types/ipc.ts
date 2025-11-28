import { AgentFieldMapping, AgentState } from "./agent";

export interface AgentStateUpdate {
  state: AgentState;
}

export interface SyncRequest {
  // Empty for now, could include options later
}

export interface SyncResponse {
  success: boolean;
  mapping?: AgentFieldMapping;
  error?: string;
  ocrText?: string;
  reasoning?: string;
}

export interface FillNextRequest {
  // Empty for now
}

export interface FillNextResponse {
  success: boolean;
  error?: string;
  mapping?: AgentFieldMapping;
}

export interface RefreshHeidiRequest {
  // Empty for now
}

export interface RefreshHeidiResponse {
  success: boolean;
  snapshot?: {
    source: "ocr" | "api" | "ai";
    capturedAt: number;
    fields: Array<{ id: string; label: string; value: string }>;
  };
  error?: string;
}
