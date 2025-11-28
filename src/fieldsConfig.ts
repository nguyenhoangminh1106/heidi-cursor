export interface Field {
  id: string;
  label: string;
  value: string;
  examples?: string[];
}

export interface HeidiFieldSchema {
  id: string;
  label: string;
  examples: string[];
}

export const demoFields: Field[] = [
  {
    id: 'patientName',
    label: 'Patient Name',
    value: 'John Smith',
    examples: ['Name', 'Full name', 'Patient name', 'First name', 'Last name'],
  },
  {
    id: 'dob',
    label: 'Date of Birth',
    value: '01/01/1980',
    examples: ['DOB', 'Date of birth', 'Birth date', 'Date of Birth', 'Birthday'],
  },
  {
    id: 'medicareId',
    label: 'Medicare / ID',
    value: '2525305501970924',
    examples: ['Medicare', 'ID', 'Medicare ID', 'Patient ID', 'Identifier'],
  },
  {
    id: 'reason',
    label: 'Reason for Visit',
    value: 'Follow-up for hypertension',
    examples: ['Reason', 'Reason for visit', 'Chief complaint', 'Presenting complaint', 'Visit reason'],
  },
  {
    id: 'notes',
    label: 'Clinical Notes',
    value: 'Patient reports improved BP control. Continue current medication regimen.',
    examples: ['Notes', 'Clinical notes', 'Notes', 'Comments', 'Assessment'],
  },
];

export const heidiFieldSchema: HeidiFieldSchema[] = demoFields.map((field) => ({
  id: field.id,
  label: field.label,
  examples: field.examples || [],
}));

