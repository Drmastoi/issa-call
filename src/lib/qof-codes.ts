// QOF (Quality and Outcomes Framework) code mappings for EMIS Web integration

export interface QOFIndicator {
  id: string;
  name: string;
  category: string;
  readCode: string;
  snomedCode: string;
  description: string;
  targetPercent: number;
}

export const QOF_INDICATORS: QOFIndicator[] = [
  {
    id: 'hypertension_monitoring',
    name: 'Hypertension Monitoring',
    category: 'Cardiovascular',
    readCode: 'XaJ4k',
    snomedCode: '401311000000103',
    description: 'Patients with hypertension having BP recorded in last 12 months',
    targetPercent: 80
  },
  {
    id: 'smoking_status',
    name: 'Smoking Status Recording',
    category: 'Lifestyle',
    readCode: '1375.',
    snomedCode: '365981007',
    description: 'Patients with smoking status recorded',
    targetPercent: 85
  },
  {
    id: 'smoking_cessation',
    name: 'Smoking Cessation Advice',
    category: 'Lifestyle',
    readCode: '8CAL.',
    snomedCode: '710081004',
    description: 'Smokers offered smoking cessation support',
    targetPercent: 90
  },
  {
    id: 'bmi_recording',
    name: 'BMI Recording',
    category: 'Obesity',
    readCode: '22K..',
    snomedCode: '60621009',
    description: 'Adult patients with BMI recorded in last 12 months',
    targetPercent: 75
  },
  {
    id: 'alcohol_screening',
    name: 'Alcohol Screening',
    category: 'Lifestyle',
    readCode: '136..',
    snomedCode: '228273003',
    description: 'Patients screened for alcohol consumption',
    targetPercent: 70
  }
];

export interface ReadCodeMapping {
  metricType: string;
  readCode: string;
  snomedCode: string;
  description: string;
}

export const READ_CODE_MAPPINGS: ReadCodeMapping[] = [
  { metricType: 'blood_pressure', readCode: '246.', snomedCode: '75367002', description: 'Blood pressure reading' },
  { metricType: 'blood_pressure_systolic', readCode: '2469.', snomedCode: '271649006', description: 'Systolic blood pressure' },
  { metricType: 'blood_pressure_diastolic', readCode: '246A.', snomedCode: '271650006', description: 'Diastolic blood pressure' },
  { metricType: 'pulse_rate', readCode: '242..', snomedCode: '78564009', description: 'Pulse rate' },
  { metricType: 'weight', readCode: '22A..', snomedCode: '27113001', description: 'Weight' },
  { metricType: 'height', readCode: '229..', snomedCode: '50373000', description: 'Height' },
  { metricType: 'bmi', readCode: '22K..', snomedCode: '60621009', description: 'Body mass index' },
  { metricType: 'smoking_status', readCode: '1375.', snomedCode: '365981007', description: 'Smoking status' },
  { metricType: 'alcohol_units', readCode: '136..', snomedCode: '228273003', description: 'Alcohol consumption' }
];

export function getReadCodeForMetric(metricType: string): ReadCodeMapping | undefined {
  return READ_CODE_MAPPINGS.find(m => m.metricType === metricType);
}

export function calculateQOFProgress(
  indicator: QOFIndicator,
  recorded: number,
  total: number
): { percent: number; status: 'good' | 'warning' | 'poor'; pointsEarned: number } {
  const percent = total > 0 ? Math.round((recorded / total) * 100) : 0;
  const status = percent >= indicator.targetPercent ? 'good' : percent >= indicator.targetPercent * 0.8 ? 'warning' : 'poor';
  const pointsEarned = Math.min(percent, indicator.targetPercent);
  
  return { percent, status, pointsEarned };
}
