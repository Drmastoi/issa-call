// Clinical Analysis Engine for QOF, KPI, and NICE Guidelines
import { differenceInYears, differenceInMonths, parseISO } from 'date-fns';
import { QOF_INDICATORS, QOFIndicator } from './qof-codes';

export interface Patient {
  id: string;
  name: string;
  nhs_number: string | null;
  phone_number: string;
  date_of_birth: string | null;
  conditions: string[] | null;
  medications: string[] | null;
  hba1c_mmol_mol: number | null;
  hba1c_date: string | null;
  cholesterol_ldl: number | null;
  cholesterol_hdl: number | null;
  cholesterol_date: string | null;
  frailty_status: string | null;
  last_review_date: string | null;
  cha2ds2_vasc_score: number | null;
}

export interface CallResponse {
  id: string;
  patient_id: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  smoking_status: string | null;
  collected_at: string;
  weight_kg?: number | null;
  height_cm?: number | null;
}

export interface ClinicalAction {
  id: string;
  patient: Patient;
  category: 'QOF' | 'NICE' | 'KPI' | 'Safety';
  code: string;
  title: string;
  reason: string;
  actionRequired: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  indicator?: QOFIndicator;
  dueWithin?: string; // e.g., "7 days", "1 month"
}

// Helper functions
export const getPatientAge = (dob: string | null): number | null => {
  if (!dob) return null;
  return differenceInYears(new Date(), parseISO(dob));
};

export const getMonthsSince = (date: string | null): number | null => {
  if (!date) return null;
  return differenceInMonths(new Date(), parseISO(date));
};

export const hasCondition = (patient: Patient, ...conditions: string[]): boolean => {
  return conditions.some(c => 
    patient.conditions?.some(pc => pc.toLowerCase().includes(c.toLowerCase()))
  );
};

export const hasMedication = (patient: Patient, ...meds: string[]): boolean => {
  return meds.some(m => 
    patient.medications?.some(pm => pm.toLowerCase().includes(m.toLowerCase()))
  );
};

export const getLatestBP = (patientId: string, responses: CallResponse[]): { systolic: number; diastolic: number } | null => {
  const r = responses.find(r => r.patient_id === patientId && r.blood_pressure_systolic);
  return r ? { systolic: r.blood_pressure_systolic!, diastolic: r.blood_pressure_diastolic! } : null;
};

export const getSmokingStatus = (patientId: string, responses: CallResponse[]): string | null => {
  const r = responses.find(r => r.patient_id === patientId && r.smoking_status);
  return r?.smoking_status || null;
};

// Generate all clinical actions for a patient
export function analyzePatient(
  patient: Patient, 
  responses: CallResponse[]
): ClinicalAction[] {
  const actions: ClinicalAction[] = [];
  const age = getPatientAge(patient.date_of_birth);
  const bp = getLatestBP(patient.id, responses);
  const monthsSinceReview = getMonthsSince(patient.last_review_date);
  const monthsSinceHba1c = getMonthsSince(patient.hba1c_date);
  const monthsSinceCholesterol = getMonthsSince(patient.cholesterol_date);
  const smokingStatus = getSmokingStatus(patient.id, responses);

  // ========== QOF INDICATORS ==========

  // Hypertension BP Control (HYP008/HYP009)
  if (hasCondition(patient, 'Hypertension', 'Essential hypertension')) {
    const isOver80 = age && age >= 80;
    const targetSystolic = isOver80 ? 150 : 140;
    const targetDiastolic = 90;
    
    if (!bp) {
      actions.push({
        id: `${patient.id}-hyp-nobp`,
        patient,
        category: 'QOF',
        code: isOver80 ? 'HYP009' : 'HYP008',
        title: 'Blood Pressure Check Required',
        reason: 'No BP reading on record for hypertensive patient',
        actionRequired: 'Record BP and review hypertension management',
        priority: 'high',
        indicator: QOF_INDICATORS.find(i => i.code === (isOver80 ? 'HYP009' : 'HYP008')),
        dueWithin: '14 days'
      });
    } else if (bp.systolic > targetSystolic || bp.diastolic > targetDiastolic) {
      const isUrgent = bp.systolic >= 180 || bp.diastolic >= 110;
      actions.push({
        id: `${patient.id}-hyp-uncontrolled`,
        patient,
        category: 'QOF',
        code: isOver80 ? 'HYP009' : 'HYP008',
        title: 'Hypertension Not Controlled',
        reason: `BP ${bp.systolic}/${bp.diastolic} exceeds target ≤${targetSystolic}/${targetDiastolic}`,
        actionRequired: isUrgent 
          ? 'URGENT: Medication review and consider same-day assessment'
          : 'Medication review and lifestyle counselling',
        priority: isUrgent ? 'critical' : 'high',
        indicator: QOF_INDICATORS.find(i => i.code === (isOver80 ? 'HYP009' : 'HYP008')),
        dueWithin: isUrgent ? '24 hours' : '7 days'
      });
    }
  }

  // Diabetes HbA1c Control (DM006/DM012)
  if (hasCondition(patient, 'Diabetes', 'Type 2 diabetes', 'Type 1 diabetes', 'T2DM', 'T1DM')) {
    const isFrail = patient.frailty_status === 'moderate' || patient.frailty_status === 'severe';
    const targetHba1c = isFrail ? 75 : 58;
    const code = isFrail ? 'DM012' : 'DM006';

    if (!patient.hba1c_mmol_mol || (monthsSinceHba1c && monthsSinceHba1c > 6)) {
      actions.push({
        id: `${patient.id}-dm-nohba1c`,
        patient,
        category: 'QOF',
        code,
        title: 'HbA1c Test Required',
        reason: patient.hba1c_mmol_mol 
          ? `HbA1c last checked ${monthsSinceHba1c} months ago`
          : 'No HbA1c on record',
        actionRequired: 'Order HbA1c blood test and diabetes review',
        priority: 'high',
        indicator: QOF_INDICATORS.find(i => i.code === code),
        dueWithin: '14 days'
      });
    } else if (patient.hba1c_mmol_mol > targetHba1c) {
      const isVeryHigh = patient.hba1c_mmol_mol > 86;
      actions.push({
        id: `${patient.id}-dm-high`,
        patient,
        category: 'QOF',
        code,
        title: 'Diabetes Control Sub-optimal',
        reason: `HbA1c ${patient.hba1c_mmol_mol} mmol/mol exceeds target ≤${targetHba1c}`,
        actionRequired: isVeryHigh
          ? 'URGENT: Diabetes medication intensification and dietary review'
          : 'Diabetes medication review and lifestyle counselling',
        priority: isVeryHigh ? 'critical' : 'high',
        indicator: QOF_INDICATORS.find(i => i.code === code),
        dueWithin: isVeryHigh ? '7 days' : '14 days'
      });
    }

    // Diabetes Statin (DM034/DM035)
    if ((age && age >= 40) || hasCondition(patient, 'CHD', 'Stroke', 'MI', 'TIA')) {
      if (!hasMedication(patient, 'Statin', 'Atorvastatin', 'Simvastatin', 'Rosuvastatin', 'Pravastatin')) {
        const hasCVD = hasCondition(patient, 'CHD', 'Stroke', 'MI', 'TIA', 'Cardiovascular');
        actions.push({
          id: `${patient.id}-dm-statin`,
          patient,
          category: 'QOF',
          code: hasCVD ? 'DM035' : 'DM034',
          title: 'Statin Therapy Required',
          reason: hasCVD 
            ? 'Diabetic with CVD history, not on statin'
            : 'Diabetic aged 40+, not on statin',
          actionRequired: 'Review for statin initiation (Atorvastatin 20mg)',
          priority: hasCVD ? 'high' : 'medium',
          indicator: QOF_INDICATORS.find(i => i.code === (hasCVD ? 'DM035' : 'DM034')),
          dueWithin: '1 month'
        });
      }
    }
  }

  // CVD Secondary Prevention - Statin (CHOL003)
  if (hasCondition(patient, 'CHD', 'Coronary', 'PAD', 'Peripheral arterial', 'Stroke', 'TIA', 'CKD')) {
    if (!hasMedication(patient, 'Statin', 'Atorvastatin', 'Simvastatin', 'Rosuvastatin', 'Pravastatin')) {
      actions.push({
        id: `${patient.id}-chol-statin`,
        patient,
        category: 'QOF',
        code: 'CHOL003',
        title: 'CVD Secondary Prevention - Statin',
        reason: 'High-risk cardiovascular patient not on lipid-lowering therapy',
        actionRequired: 'Initiate high-intensity statin (Atorvastatin 80mg)',
        priority: 'high',
        indicator: QOF_INDICATORS.find(i => i.code === 'CHOL003'),
        dueWithin: '7 days'
      });
    }
  }

  // Atrial Fibrillation Anticoagulation (AF007/AF008)
  if (hasCondition(patient, 'AF', 'Atrial fibrillation', 'Atrial Fibrillation')) {
    const cha2ds2 = patient.cha2ds2_vasc_score ?? (age && age >= 75 ? 2 : 1);
    
    if (cha2ds2 >= 2) {
      const onAnticoag = hasMedication(patient, 'Warfarin', 'Apixaban', 'Rivaroxaban', 'Edoxaban', 'Dabigatran');
      
      if (!onAnticoag) {
        actions.push({
          id: `${patient.id}-af-anticoag`,
          patient,
          category: 'QOF',
          code: 'AF007',
          title: 'Anticoagulation Required for AF',
          reason: `CHA₂DS₂-VASc score ≥2, high stroke risk without anticoagulation`,
          actionRequired: 'Initiate DOAC (e.g., Apixaban, Rivaroxaban) or refer for INR if Warfarin',
          priority: 'critical',
          indicator: QOF_INDICATORS.find(i => i.code === 'AF007'),
          dueWithin: '3 days'
        });
      }
    }
  }

  // Heart Failure (HF003/HF006)
  if (hasCondition(patient, 'Heart failure', 'HF', 'LVSD', 'Left ventricular', 'CCF')) {
    if (!hasMedication(patient, 'ACE', 'ARB', 'Ramipril', 'Lisinopril', 'Enalapril', 'Losartan', 'Candesartan', 'Valsartan', 'Entresto', 'Sacubitril')) {
      actions.push({
        id: `${patient.id}-hf-acei`,
        patient,
        category: 'QOF',
        code: 'HF003',
        title: 'ACE-I/ARB Required for Heart Failure',
        reason: 'Heart failure patient not on ACE inhibitor or ARB',
        actionRequired: 'Initiate Ramipril 1.25mg and titrate, check U&Es',
        priority: 'high',
        indicator: QOF_INDICATORS.find(i => i.code === 'HF003'),
        dueWithin: '7 days'
      });
    }

    if (!hasMedication(patient, 'Beta-blocker', 'Bisoprolol', 'Carvedilol', 'Nebivolol', 'Metoprolol')) {
      actions.push({
        id: `${patient.id}-hf-bb`,
        patient,
        category: 'QOF',
        code: 'HF006',
        title: 'Beta-Blocker Required for Heart Failure',
        reason: 'Heart failure patient not on beta-blocker',
        actionRequired: 'Initiate Bisoprolol 1.25mg and titrate up',
        priority: 'high',
        indicator: QOF_INDICATORS.find(i => i.code === 'HF006'),
        dueWithin: '7 days'
      });
    }
  }

  // Asthma Review (AST007)
  if (hasCondition(patient, 'Asthma')) {
    if (!monthsSinceReview || monthsSinceReview > 12) {
      actions.push({
        id: `${patient.id}-ast-review`,
        patient,
        category: 'QOF',
        code: 'AST007',
        title: 'Annual Asthma Review Due',
        reason: monthsSinceReview 
          ? `Last review ${monthsSinceReview} months ago`
          : 'No asthma review on record',
        actionRequired: 'Asthma review: control assessment, inhaler technique, action plan',
        priority: 'medium',
        indicator: QOF_INDICATORS.find(i => i.code === 'AST007'),
        dueWithin: '1 month'
      });
    }
  }

  // COPD FeV1 (COPD010)
  if (hasCondition(patient, 'COPD', 'Chronic obstructive')) {
    if (!monthsSinceReview || monthsSinceReview > 12) {
      actions.push({
        id: `${patient.id}-copd-review`,
        patient,
        category: 'QOF',
        code: 'COPD010',
        title: 'COPD Review and Spirometry Due',
        reason: monthsSinceReview 
          ? `Last review ${monthsSinceReview} months ago`
          : 'No COPD review on record',
        actionRequired: 'COPD review with FeV1 measurement, inhaler check, exacerbation history',
        priority: 'medium',
        indicator: QOF_INDICATORS.find(i => i.code === 'COPD010'),
        dueWithin: '1 month'
      });
    }
  }

  // Dementia Review (DEM004)
  if (hasCondition(patient, 'Dementia', 'Alzheimer', 'Vascular dementia', 'Lewy body')) {
    if (!monthsSinceReview || monthsSinceReview > 12) {
      actions.push({
        id: `${patient.id}-dem-review`,
        patient,
        category: 'QOF',
        code: 'DEM004',
        title: 'Annual Dementia Review Due',
        reason: monthsSinceReview 
          ? `Last review ${monthsSinceReview} months ago`
          : 'No dementia review on record',
        actionRequired: 'Dementia review including carer support assessment',
        priority: 'medium',
        indicator: QOF_INDICATORS.find(i => i.code === 'DEM004'),
        dueWithin: '1 month'
      });
    }
  }

  // Smoking Status (SMOK002)
  if (patient.conditions && patient.conditions.length > 0) {
    if (!smokingStatus) {
      actions.push({
        id: `${patient.id}-smok-status`,
        patient,
        category: 'QOF',
        code: 'SMOK002',
        title: 'Smoking Status Recording',
        reason: 'Patient with long-term condition - smoking status not recorded in past 12 months',
        actionRequired: 'Record current smoking status and offer cessation support if smoker',
        priority: 'low',
        indicator: QOF_INDICATORS.find(i => i.code === 'SMOK002'),
        dueWithin: '1 month'
      });
    }
  }

  // ========== NICE GUIDELINES ==========

  // NICE - Falls Risk (Frailty + multiple medications)
  if (patient.frailty_status === 'moderate' || patient.frailty_status === 'severe') {
    const medCount = patient.medications?.length || 0;
    if (medCount >= 5) {
      actions.push({
        id: `${patient.id}-nice-falls`,
        patient,
        category: 'NICE',
        code: 'CG161',
        title: 'Falls Risk Assessment',
        reason: `Frail patient (${patient.frailty_status}) on ${medCount} medications`,
        actionRequired: 'Multifactorial falls assessment, medication review, bone health check',
        priority: patient.frailty_status === 'severe' ? 'high' : 'medium',
        dueWithin: '2 weeks'
      });
    }
  }

  // NICE - Polypharmacy Review
  const medCount = patient.medications?.length || 0;
  if (medCount >= 10) {
    actions.push({
      id: `${patient.id}-nice-polypharm`,
      patient,
      category: 'NICE',
      code: 'NG5',
      title: 'Polypharmacy Review Required',
      reason: `Patient on ${medCount} medications - high polypharmacy burden`,
      actionRequired: 'Structured medication review, deprescribing assessment',
      priority: 'medium',
      dueWithin: '1 month'
    });
  }

  // NICE - CKD monitoring (if on ACE/ARB or diabetic)
  if (hasCondition(patient, 'CKD', 'Chronic kidney', 'Renal impairment') || 
      (hasCondition(patient, 'Diabetes') && hasMedication(patient, 'ACE', 'ARB', 'Ramipril', 'Lisinopril'))) {
    // Would check U&E date here - simplified version
    actions.push({
      id: `${patient.id}-nice-ckd`,
      patient,
      category: 'NICE',
      code: 'CG182',
      title: 'Renal Function Monitoring',
      reason: 'CKD patient or diabetic on ACE-I/ARB - regular U&E monitoring needed',
      actionRequired: 'Check U&E, eGFR, and urine ACR',
      priority: 'medium',
      dueWithin: '1 month'
    });
  }

  // ========== KPI / SAFETY ==========

  // Annual Review overdue
  if (!monthsSinceReview || monthsSinceReview > 12) {
    if (patient.conditions && patient.conditions.length >= 2) {
      actions.push({
        id: `${patient.id}-kpi-review`,
        patient,
        category: 'KPI',
        code: 'LTC-REV',
        title: 'Annual Care Review Overdue',
        reason: monthsSinceReview
          ? `Last reviewed ${monthsSinceReview} months ago with multiple conditions`
          : 'No annual review on record',
        actionRequired: 'Comprehensive care review for multiple long-term conditions',
        priority: 'medium',
        dueWithin: '2 weeks'
      });
    }
  }

  // Safety - High-risk medication without monitoring
  if (hasMedication(patient, 'Methotrexate', 'Azathioprine', 'Lithium')) {
    actions.push({
      id: `${patient.id}-safety-dmard`,
      patient,
      category: 'Safety',
      code: 'DMARD-MON',
      title: 'High-Risk Medication Monitoring',
      reason: 'Patient on DMARD/high-risk medication requiring regular blood monitoring',
      actionRequired: 'Check shared care monitoring is in place, review recent bloods',
      priority: 'high',
      dueWithin: '7 days'
    });
  }

  return actions;
}

// Analyze all patients and return sorted actions
export function analyzeAllPatients(
  patients: Patient[],
  responses: CallResponse[]
): ClinicalAction[] {
  const allActions: ClinicalAction[] = [];
  
  patients.forEach(patient => {
    const patientActions = analyzePatient(patient, responses);
    allActions.push(...patientActions);
  });

  // Sort by priority (critical > high > medium > low)
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return allActions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// Get summary statistics
export function getClinicalActionStats(actions: ClinicalAction[]) {
  return {
    total: actions.length,
    critical: actions.filter(a => a.priority === 'critical').length,
    high: actions.filter(a => a.priority === 'high').length,
    medium: actions.filter(a => a.priority === 'medium').length,
    low: actions.filter(a => a.priority === 'low').length,
    byCategory: {
      QOF: actions.filter(a => a.category === 'QOF').length,
      NICE: actions.filter(a => a.category === 'NICE').length,
      KPI: actions.filter(a => a.category === 'KPI').length,
      Safety: actions.filter(a => a.category === 'Safety').length,
    }
  };
}
