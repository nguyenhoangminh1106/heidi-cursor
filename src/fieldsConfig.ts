export interface Field {
  id: string;
  label: string;
  value: string;
}

export const demoFields: Field[] = [
  {
    id: 'patientName',
    label: 'Patient Name',
    value: 'John Smith',
  },
  {
    id: 'dob',
    label: 'Date of Birth',
    value: '01/01/1980',
  },
  {
    id: 'medicareId',
    label: 'Medicare / ID',
    value: '2525305501970924',
  },
  {
    id: 'reason',
    label: 'Reason for Visit',
    value: 'Follow-up for hypertension',
  },
  {
    id: 'notes',
    label: 'Clinical Notes',
    value: 'Patient reports improved BP control. Continue current medication regimen.',
  },
];

