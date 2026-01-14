// QOF (Quality and Outcomes Framework) code mappings for EMIS Web integration

export interface QOFIndicator {
  id: string;
  code: string;
  name: string;
  category: string;
  subcategory?: string;
  readCode?: string;
  snomedCode?: string;
  description: string;
  targetPercent: number;
  ageGroup?: 'under80' | 'over80' | 'all' | '40plus';
  condition?: string;
}

// Comprehensive NHS QOF Indicators 2024/25
export const QOF_INDICATORS: QOFIndicator[] = [
  // ============ Cardiovascular Disease (CVD) Prevention ============
  {
    id: 'chol003',
    code: 'CHOL003',
    name: 'Statin Prescription (CVD)',
    category: 'Cardiovascular',
    subcategory: 'Cholesterol',
    description: 'Patients with CHD, PAD, Stroke/TIA, or CKD (G3a-G5) prescribed a statin or other lipid-lowering therapy',
    targetPercent: 80,
    condition: 'CHD/PAD/Stroke/CKD'
  },
  {
    id: 'chol004',
    code: 'CHOL004',
    name: 'Cholesterol Target Met',
    category: 'Cardiovascular',
    subcategory: 'Cholesterol',
    description: 'Patients with CHD, PAD, or Stroke/TIA with cholesterol ≤2.0 mmol/L (LDL) or ≤2.6 mmol/L (non-HDL) in preceding 12 months',
    targetPercent: 45,
    condition: 'CHD/PAD/Stroke'
  },
  {
    id: 'hyp008',
    code: 'HYP008',
    name: 'Hypertension BP Control (≤79)',
    category: 'Cardiovascular',
    subcategory: 'Hypertension',
    description: 'Patients with hypertension aged ≤79 years with BP ≤140/90 mmHg',
    targetPercent: 77,
    ageGroup: 'under80',
    condition: 'Hypertension'
  },
  {
    id: 'hyp009',
    code: 'HYP009',
    name: 'Hypertension BP Control (≥80)',
    category: 'Cardiovascular',
    subcategory: 'Hypertension',
    description: 'Patients with hypertension aged ≥80 years with BP ≤150/90 mmHg',
    targetPercent: 77,
    ageGroup: 'over80',
    condition: 'Hypertension'
  },
  {
    id: 'chd015',
    code: 'CHD015',
    name: 'CHD BP Control (≤79)',
    category: 'Cardiovascular',
    subcategory: 'CHD',
    description: 'Patients with CHD aged ≤79 years with BP ≤140/90 mmHg',
    targetPercent: 77,
    ageGroup: 'under80',
    condition: 'CHD'
  },
  {
    id: 'chd016',
    code: 'CHD016',
    name: 'CHD BP Control (≥80)',
    category: 'Cardiovascular',
    subcategory: 'CHD',
    description: 'Patients with CHD aged ≥80 years with BP ≤150/90 mmHg',
    targetPercent: 77,
    ageGroup: 'over80',
    condition: 'CHD'
  },
  {
    id: 'stia014',
    code: 'STIA014',
    name: 'Stroke/TIA BP Control (≤79)',
    category: 'Cardiovascular',
    subcategory: 'Stroke/TIA',
    description: 'Patients with Stroke/TIA aged ≤79 years with BP ≤140/90 mmHg',
    targetPercent: 77,
    ageGroup: 'under80',
    condition: 'Stroke/TIA'
  },
  {
    id: 'stia015',
    code: 'STIA015',
    name: 'Stroke/TIA BP Control (≥80)',
    category: 'Cardiovascular',
    subcategory: 'Stroke/TIA',
    description: 'Patients with Stroke/TIA aged ≥80 years with BP ≤150/90 mmHg',
    targetPercent: 77,
    ageGroup: 'over80',
    condition: 'Stroke/TIA'
  },
  {
    id: 'af007',
    code: 'AF007',
    name: 'AF Anticoagulation',
    category: 'Cardiovascular',
    subcategory: 'Atrial Fibrillation',
    description: 'Patients with AF (CHA2DS2-VASc score ≥2) currently treated with anticoagulation drug therapy',
    targetPercent: 85,
    condition: 'Atrial Fibrillation'
  },
  {
    id: 'af008',
    code: 'AF008',
    name: 'AF DOAC Prescription',
    category: 'Cardiovascular',
    subcategory: 'Atrial Fibrillation',
    description: 'Patients with AF (CHA2DS2-VASc score ≥2) prescribed a DOAC or Vitamin K antagonist if DOAC unsuitable',
    targetPercent: 85,
    condition: 'Atrial Fibrillation'
  },

  // ============ Diabetes Mellitus ============
  {
    id: 'dm036',
    code: 'DM036',
    name: 'Diabetes BP Control (≤79)',
    category: 'Diabetes',
    subcategory: 'Blood Pressure',
    description: 'Patients with diabetes aged ≤79 years (without moderate/severe frailty) with BP ≤140/90 mmHg',
    targetPercent: 77,
    ageGroup: 'under80',
    condition: 'Diabetes'
  },
  {
    id: 'dm034',
    code: 'DM034',
    name: 'Diabetes Statin (No CVD)',
    category: 'Diabetes',
    subcategory: 'Cholesterol',
    description: 'Patients with diabetes aged 40+ (no CVD history) treated with a statin',
    targetPercent: 80,
    ageGroup: '40plus',
    condition: 'Diabetes'
  },
  {
    id: 'dm035',
    code: 'DM035',
    name: 'Diabetes Statin (With CVD)',
    category: 'Diabetes',
    subcategory: 'Cholesterol',
    description: 'Patients with diabetes and a history of CVD treated with a statin',
    targetPercent: 85,
    condition: 'Diabetes+CVD'
  },
  {
    id: 'dm006',
    code: 'DM006',
    name: 'HbA1c ≤58 mmol/mol',
    category: 'Diabetes',
    subcategory: 'Glycaemic Control',
    description: 'Patients with diabetes (no moderate/severe frailty) with HbA1c ≤58 mmol/mol',
    targetPercent: 70,
    condition: 'Diabetes'
  },
  {
    id: 'dm012',
    code: 'DM012',
    name: 'HbA1c ≤75 mmol/mol (Frail)',
    category: 'Diabetes',
    subcategory: 'Glycaemic Control',
    description: 'Patients with diabetes (with moderate/severe frailty) with HbA1c ≤75 mmol/mol',
    targetPercent: 70,
    condition: 'Diabetes+Frailty'
  },

  // ============ Respiratory (Asthma & COPD) ============
  {
    id: 'ast007',
    code: 'AST007',
    name: 'Asthma Review',
    category: 'Respiratory',
    subcategory: 'Asthma',
    description: 'Patients with asthma who had a review in preceding 12 months (control assessment, exacerbations, inhaler technique, action plan)',
    targetPercent: 70,
    condition: 'Asthma'
  },
  {
    id: 'ast012',
    code: 'AST012',
    name: 'Asthma Objective Test',
    category: 'Respiratory',
    subcategory: 'Asthma',
    description: 'Patients with new diagnosis of asthma (from April 2025) with objective test record (FeNO, spirometry, PEFR)',
    targetPercent: 75,
    condition: 'Asthma (New)'
  },
  {
    id: 'copd010',
    code: 'COPD010',
    name: 'COPD FeV1 Recording',
    category: 'Respiratory',
    subcategory: 'COPD',
    description: 'Patients with COPD with a record of FeV1 in the preceding 12 months',
    targetPercent: 70,
    condition: 'COPD'
  },
  {
    id: 'copd014',
    code: 'COPD014',
    name: 'COPD Pulmonary Rehab Referral',
    category: 'Respiratory',
    subcategory: 'COPD',
    description: 'Referral to pulmonary rehabilitation for COPD patients with MRC dyspnoea scale ≥3',
    targetPercent: 65,
    condition: 'COPD (MRC≥3)'
  },

  // ============ Mental Health & Dementia ============
  {
    id: 'mh002',
    code: 'MH002',
    name: 'SMI Care Plan',
    category: 'Mental Health',
    subcategory: 'Serious Mental Illness',
    description: 'Patients with schizophrenia, bipolar affective disorder, or other psychoses who have a comprehensive care plan',
    targetPercent: 60,
    condition: 'SMI'
  },
  {
    id: 'dem004',
    code: 'DEM004',
    name: 'Dementia Review',
    category: 'Mental Health',
    subcategory: 'Dementia',
    description: 'Patients with dementia who have had a review in the preceding 12 months (including support for carers)',
    targetPercent: 75,
    condition: 'Dementia'
  },
  {
    id: 'ndh002',
    code: 'NDH002',
    name: 'Pre-Diabetes Monitoring',
    category: 'Mental Health',
    subcategory: 'Pre-Diabetes',
    description: 'Patients with non-diabetic hyperglycaemia who have had an HbA1c or fasting glucose test in preceding 12 months',
    targetPercent: 80,
    condition: 'NDH'
  },

  // ============ Heart Failure ============
  {
    id: 'hf003',
    code: 'HF003',
    name: 'Heart Failure ACE-I/ARB',
    category: 'Heart Failure',
    subcategory: 'Treatment',
    description: 'Patients with heart failure (LVSD) currently treated with an ACE-I or ARB',
    targetPercent: 85,
    condition: 'Heart Failure (LVSD)'
  },
  {
    id: 'hf006',
    code: 'HF006',
    name: 'Heart Failure Beta-Blocker',
    category: 'Heart Failure',
    subcategory: 'Treatment',
    description: 'Patients with heart failure (LVSD) currently treated with a beta-blocker',
    targetPercent: 85,
    condition: 'Heart Failure (LVSD)'
  },

  // ============ Other Areas ============
  {
    id: 'vi001',
    code: 'VI001-003',
    name: 'Vaccination & Immunisation',
    category: 'Preventive Care',
    subcategory: 'Immunisation',
    description: 'Childhood immunisations and 65+ flu vaccinations',
    targetPercent: 90,
    condition: 'All eligible'
  },
  {
    id: 'smok002',
    code: 'SMOK002',
    name: 'Smoking Status Recording',
    category: 'Lifestyle',
    subcategory: 'Smoking',
    readCode: '1375.',
    snomedCode: '365981007',
    description: 'Patients with any long-term condition who have had their smoking status recorded in preceding 12 months',
    targetPercent: 90,
    condition: 'LTC'
  },
];

// Categories for grouping
export const QOF_CATEGORIES = [
  { id: 'cardiovascular', name: 'Cardiovascular Disease Prevention', icon: 'Heart' },
  { id: 'diabetes', name: 'Diabetes Mellitus', icon: 'Activity' },
  { id: 'respiratory', name: 'Respiratory (Asthma & COPD)', icon: 'Wind' },
  { id: 'mental-health', name: 'Mental Health & Dementia', icon: 'Brain' },
  { id: 'heart-failure', name: 'Heart Failure', icon: 'HeartPulse' },
  { id: 'preventive-care', name: 'Preventive Care', icon: 'Shield' },
  { id: 'lifestyle', name: 'Lifestyle', icon: 'Cigarette' },
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
  { metricType: 'alcohol_units', readCode: '136..', snomedCode: '228273003', description: 'Alcohol consumption' },
  { metricType: 'hba1c', readCode: '42W..', snomedCode: '43396009', description: 'HbA1c level' },
  { metricType: 'cholesterol_ldl', readCode: '44P5.', snomedCode: '1005671000000105', description: 'LDL cholesterol' },
  { metricType: 'cholesterol_hdl', readCode: '44P6.', snomedCode: '1005681000000107', description: 'HDL cholesterol' },
  { metricType: 'fev1', readCode: '339A.', snomedCode: '59328004', description: 'FEV1 measurement' },
];

export function getReadCodeForMetric(metricType: string): ReadCodeMapping | undefined {
  return READ_CODE_MAPPINGS.find(m => m.metricType === metricType);
}

export function getIndicatorsByCategory(category: string): QOFIndicator[] {
  return QOF_INDICATORS.filter(i => i.category.toLowerCase() === category.toLowerCase());
}

export function calculateQOFProgress(
  indicator: QOFIndicator,
  recorded: number,
  total: number
): { percent: number; status: 'good' | 'warning' | 'poor'; pointsEarned: number; gap: number } {
  const percent = total > 0 ? Math.round((recorded / total) * 100) : 0;
  const status = percent >= indicator.targetPercent ? 'good' : percent >= indicator.targetPercent * 0.8 ? 'warning' : 'poor';
  const pointsEarned = Math.min(percent, indicator.targetPercent);
  const gap = Math.max(0, indicator.targetPercent - percent);
  
  return { percent, status, pointsEarned, gap };
}
