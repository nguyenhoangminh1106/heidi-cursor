import { AgentState } from "./agent";

export interface AgentStateUpdate {
  state: AgentState;
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
