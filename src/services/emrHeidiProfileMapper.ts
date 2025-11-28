import { SessionField } from "../types/agent";
import { HeidiPatientProfileInput } from "../types/heidi";

/**
 * Map EMR snapshot fields (SessionField[]) to Heidi Patient Profile input
 * Uses field IDs and labels to intelligently map common patient demographics
 */
export function buildHeidiPatientProfileFromEmrSnapshot(
  fields: SessionField[]
): HeidiPatientProfileInput {
  const profile: HeidiPatientProfileInput = {};

  // Create a lookup map for quick field access
  const fieldMap = new Map<string, string>();
  fields.forEach((field) => {
    const key = field.id.toLowerCase();
    fieldMap.set(key, field.value);
    // Also map by label for flexibility
    const labelKey = field.label.toLowerCase().replace(/\s+/g, "_");
    if (!fieldMap.has(labelKey)) {
      fieldMap.set(labelKey, field.value);
    }
  });

  // Helper to find field value by multiple possible keys
  const getFieldValue = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = fieldMap.get(key.toLowerCase());
      if (value && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  };

  // Map patient name
  const firstName = getFieldValue(
    "first_name",
    "firstname",
    "patient_first_name",
    "given_name"
  );
  const lastName = getFieldValue(
    "last_name",
    "lastname",
    "patient_last_name",
    "family_name",
    "surname"
  );
  const fullName = getFieldValue(
    "patient_name",
    "name",
    "full_name",
    "patient_full_name"
  );

  if (fullName && !firstName && !lastName) {
    // Try to split full name
    const nameParts = fullName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      profile.first_name = nameParts[0];
      profile.last_name = nameParts.slice(1).join(" ");
    } else {
      profile.first_name = fullName;
    }
  } else {
    if (firstName) profile.first_name = firstName;
    if (lastName) profile.last_name = lastName;
  }

  // Map date of birth (Heidi API expects YYYY-MM-DD format)
  const dob = getFieldValue("date_of_birth", "dob", "birth_date", "birthdate");
  if (dob) {
    profile.birth_date = normalizeDate(dob);
  }

  // Map EHR Patient ID (Medical Record Number)
  const ehrPatientId = getFieldValue(
    "ehr_patient_id",
    "mrn",
    "medical_record_number",
    "patient_id",
    "patient_mrn",
    "record_number"
  );
  if (ehrPatientId) {
    profile.ehr_patient_id = ehrPatientId;
  }

  // Build demographic_string if we have name and DOB
  if (profile.first_name || profile.last_name || profile.birth_date) {
    const parts: string[] = [];
    if (profile.first_name || profile.last_name) {
      parts.push(
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
      );
    }
    if (profile.birth_date) {
      parts.push(profile.birth_date);
    }
    if (parts.length > 0) {
      profile.demographic_string = parts.join(", ");
    }
  }

  // Map email
  const email = getFieldValue("email", "email_address", "patient_email");
  if (email) {
    profile.email = email;
  }

  // Map phone
  const phone = getFieldValue(
    "phone",
    "phone_number",
    "telephone",
    "mobile",
    "cell_phone",
    "contact_phone"
  );
  if (phone) {
    profile.phone = normalizePhone(phone);
  }

  // Note: Heidi API doesn't have separate address fields in patient profiles
  // Address info can be included in additional_context if needed

  return profile;
}

/**
 * Normalize date string to ISO format (YYYY-MM-DD)
 * Handles common formats like MM/DD/YYYY, DD/MM/YYYY, etc.
 */
function normalizeDate(dateStr: string): string {
  // Remove extra whitespace
  const cleaned = dateStr.trim();

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch;
    // Assume MM/DD/YYYY (US format) - could be made configurable
    const month = part1.padStart(2, "0");
    const day = part2.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Try other formats or return as-is if can't parse
  return cleaned;
}

/**
 * Normalize phone number string
 * Removes common formatting characters, keeps digits
 */
function normalizePhone(phoneStr: string): string {
  // Remove common formatting: spaces, dashes, parentheses, dots
  return phoneStr.replace(/[\s\-\(\)\.]/g, "");
}
