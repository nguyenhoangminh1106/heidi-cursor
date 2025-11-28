/**
 * Represents a single step in the fill plan
 */
export interface FillPlanStep {
  emrFieldId: string;
  emrLabel: string;
  emrType?: string;
  heidiFieldId: string | null; // null if no match found
}

/**
 * Represents the complete fill plan for an EMR form
 */
export interface FillPlan {
  steps: FillPlanStep[];
  createdAt: number;
}
