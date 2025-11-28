import { EmrField, EmrLayout } from "../types/emr";

/**
 * Find the EMR field at a given point (cursor position)
 * Returns the field whose bounding box contains the point
 * If multiple fields overlap, returns the smallest one (most specific)
 */
export function findFieldAtPoint(
  layout: EmrLayout,
  point: { x: number; y: number },
  tolerance: number = 5 // pixels tolerance for edge cases
): EmrField | null {
  const { x, y } = point;
  const candidates: Array<{ field: EmrField; area: number; distance: number }> = [];

  for (const field of layout.fields) {
    const bb = field.boundingBox;
    
    // Check if point is within bounding box (with tolerance)
    const isWithinX = x >= bb.x - tolerance && x <= bb.x + bb.width + tolerance;
    const isWithinY = y >= bb.y - tolerance && y <= bb.y + bb.height + tolerance;

    if (isWithinX && isWithinY) {
      const area = bb.width * bb.height;
      const centerX = bb.x + bb.width / 2;
      const centerY = bb.y + bb.height / 2;
      const distance = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
      );

      candidates.push({ field, area, distance });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // If multiple candidates, prefer:
  // 1. Smaller area (more specific field)
  // 2. Closer to center (if areas are similar)
  candidates.sort((a, b) => {
    // First sort by area (smaller is better)
    if (Math.abs(a.area - b.area) > 100) {
      return a.area - b.area;
    }
    // If areas are similar, prefer closer to center
    return a.distance - b.distance;
  });

  return candidates[0].field;
}

/**
 * Find all fields near a point (within a radius)
 * Useful for debugging or showing nearby fields
 */
export function findFieldsNearPoint(
  layout: EmrLayout,
  point: { x: number; y: number },
  radius: number = 50
): EmrField[] {
  const { x, y } = point;
  const fields: EmrField[] = [];

  for (const field of layout.fields) {
    const bb = field.boundingBox;
    const centerX = bb.x + bb.width / 2;
    const centerY = bb.y + bb.height / 2;
    const distance = Math.sqrt(
      Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
    );

    if (distance <= radius) {
      fields.push(field);
    }
  }

  // Sort by distance
  fields.sort((a, b) => {
    const aCenterX = a.boundingBox.x + a.boundingBox.width / 2;
    const aCenterY = a.boundingBox.y + a.boundingBox.height / 2;
    const bCenterX = b.boundingBox.x + b.boundingBox.width / 2;
    const bCenterY = b.boundingBox.y + b.boundingBox.height / 2;
    
    const aDist = Math.sqrt(
      Math.pow(x - aCenterX, 2) + Math.pow(y - aCenterY, 2)
    );
    const bDist = Math.sqrt(
      Math.pow(x - bCenterX, 2) + Math.pow(y - bCenterY, 2)
    );
    
    return aDist - bDist;
  });

  return fields;
}

