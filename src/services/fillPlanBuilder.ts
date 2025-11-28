import { HeidiSnapshot } from "../types/agent";
import { EmrLayout } from "../types/emr";
import { FillPlan, FillPlanStep } from "../types/fillPlan";
import { mapEmrFieldToHeidiField } from "./emrHeidiMapper";

/**
 * Build a fill plan from ordered EMR fields and Heidi snapshot
 * The plan maps each EMR field (in tab order) to a Heidi field (or null)
 */
export async function buildFillPlan(
  emrLayout: EmrLayout,
  heidiSnapshot: HeidiSnapshot
): Promise<FillPlan> {
  console.log(
    "[FILLPLAN] Building fill plan from",
    emrLayout.fields.length,
    "EMR fields"
  );

  const steps: FillPlanStep[] = [];

  // Process each EMR field in order (array index = tab order)
  for (const emrField of emrLayout.fields) {
    // Skip display-only fields (they don't need filling)
    if (emrField.type === "display") {
      console.log(`[FILLPLAN] Skipping display field: ${emrField.label}`);
      continue;
    }

    // Map EMR field to Heidi field
    const heidiFieldId = await mapEmrFieldToHeidiField(
      emrField,
      heidiSnapshot,
      `${emrLayout.emrId}:${emrLayout.screenId}`
    );

    const step: FillPlanStep = {
      emrFieldId: emrField.id,
      emrLabel: emrField.label,
      emrType: emrField.type,
      heidiFieldId,
    };

    steps.push(step);

    if (heidiFieldId) {
      const heidiField = heidiSnapshot.fields.find(
        (f) => f.id === heidiFieldId
      );
      console.log(
        `[FILLPLAN] Mapped "${emrField.label}" → "${
          heidiField?.label || heidiFieldId
        }"`
      );
    } else {
      console.log(
        `[FILLPLAN] No match for "${emrField.label}" (will skip or leave blank)`
      );
    }
  }

  console.log(`[FILLPLAN] Fill plan built: ${steps.length} steps`);

  return {
    steps,
    createdAt: Date.now(),
  };
}
