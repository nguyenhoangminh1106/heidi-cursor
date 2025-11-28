export interface AiExtractedField {
  id: string;
  label: string;
  value: string;
  type?: string;
  confidence: number;
}

export interface AiExtractionResult {
  fields: AiExtractedField[];
}

export interface AiExtractionRequest {
  imageBuffer: Buffer;
  hint?: string;
}

