/**
 * Shared PII extraction and sanitization utilities
 * GDPR-compliant: PII extracted locally via regex, never sent to AI
 */

export interface ExtractedPII {
  name: string | null;
  phone_number: string | null;
  nhs_number: string | null;
  date_of_birth: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  gp_name: string | null;
  gp_practice: string | null;
  care_home_name: string | null;
}

export function extractPII(text: string): ExtractedPII {
  // NHS number (10 digits, may have spaces)
  const nhsMatch = text.match(/NHS\s*(?:Number|No\.?)?\s*:?\s*(\d{3}\s?\d{3}\s?\d{4})/i) ||
    text.match(/(\d{3}\s?\d{3}\s?\d{4})/);
  const nhs_number = nhsMatch ? nhsMatch[1].replace(/\s/g, '') : null;

  // Phone number (UK formats)
  const phoneMatch = text.match(/(?:Tel|Phone|Mobile|Contact)?\s*:?\s*(\+44\s?\d{4}\s?\d{6}|\+44\s?\d{3}\s?\d{3}\s?\d{4}|0\d{4}\s?\d{6}|0\d{3}\s?\d{3}\s?\d{4}|07\d{3}\s?\d{6})/i);
  let phone_number = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : null;
  if (phone_number && phone_number.startsWith('0')) {
    phone_number = '+44' + phone_number.substring(1);
  }

  // Date of birth
  const dobMatch = text.match(/(?:DOB|Date of Birth|D\.O\.B\.?|Born)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i) ||
    text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
  let date_of_birth: string | null = null;
  if (dobMatch) {
    const parts = dobMatch[1].split(/[\/\-\.]/);
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = parseInt(year) > 30 ? '19' + year : '20' + year;
      date_of_birth = `${year}-${month}-${day}`;
    }
  }

  // Patient name
  const namePatterns = [
    /(?:Patient\s*(?:Name)?)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    /(?:^|\n)\s*Name\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/im,
    /(?:^|\n)\s*(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/im,
  ];
  const medTerms = /\b(review|assessment|allocated|consent|telephone|medication|monitoring|template|oedema|preference|having|likely|care|home|residence|register|steroid|dementia|specialist|end of life)\b/i;
  let name: string | null = null;
  for (const pattern of namePatterns) {
    const m = text.match(pattern);
    if (m && !medTerms.test(m[1].trim()) && m[1].trim().length >= 3 && m[1].trim().length <= 50) {
      name = m[1].trim();
      break;
    }
  }
  if (!name) {
    const fn = text.match(/(?:Forename|First\s*Name|Given\s*Name)\s*:\s*([A-Z][a-z]+)/i);
    const sn = text.match(/(?:Surname|Last\s*Name|Family\s*Name)\s*:\s*([A-Z][a-z]+)/i);
    if (fn && sn) name = `${fn[1].trim()} ${sn[1].trim()}`;
  }

  // Next of kin
  const nokName = text.match(/(?:Next of Kin|NOK|Emergency Contact)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  const nokPhone = text.match(/(?:NOK|Next of Kin|Emergency)\s*(?:Phone|Tel|Contact)?\s*:?\s*(\+44\s?\d{4}\s?\d{6}|\+44\s?\d{3}\s?\d{3}\s?\d{4}|0\d{4}\s?\d{6}|0\d{3}\s?\d{3}\s?\d{4}|07\d{3}\s?\d{6})/i);
  const nokRel = text.match(/(?:Relationship|Relation)\s*:?\s*(Wife|Husband|Partner|Son|Daughter|Mother|Father|Sister|Brother|Friend|Carer|Spouse|Child|Parent)/i);
  let nok_phone = nokPhone ? nokPhone[1].replace(/\s/g, '') : null;
  if (nok_phone && nok_phone.startsWith('0')) nok_phone = '+44' + nok_phone.substring(1);

  // GP info
  const gpName = text.match(/(?:GP|Doctor|Dr\.?)\s*:?\s*(?:Dr\.?\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  const gpPractice = text.match(/(?:Practice|Surgery|Medical Centre|Health Centre)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*(?:Practice|Surgery|Medical Centre|Health Centre)?)/i);

  // Care home
  const careHome = text.match(/(?:Care Home|Nursing Home|Residential Home|Facility)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);

  return {
    name,
    phone_number,
    nhs_number,
    date_of_birth,
    next_of_kin_name: nokName ? nokName[1].trim() : null,
    next_of_kin_phone: nok_phone,
    next_of_kin_relationship: nokRel ? nokRel[1].trim() : null,
    gp_name: gpName ? gpName[1].trim() : null,
    gp_practice: gpPractice ? gpPractice[1].trim() : null,
    care_home_name: careHome ? careHome[1].trim() : null,
  };
}

export function sanitizeForAI(text: string): string {
  return text
    .replace(/\b\d{3}\s?\d{3}\s?\d{4}\b/g, '[NHS_NUMBER]')
    .replace(/(\+44|0)\s?\d{3,4}\s?\d{3}\s?\d{3,4}/g, '[PHONE]')
    .replace(/(?:DOB|Date of Birth|D\.O\.B\.?|Born)\s*:?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/gi, '[DOB]')
    .replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/g, '[DATE]')
    .replace(/(?:Patient\s*(?:Name)?|Name)\s*:?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/gi, 'Patient: [NAME]')
    .replace(/(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi, '[PERSON]')
    .replace(/(?:Next of Kin|NOK|Emergency Contact)\s*:?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/gi, 'Next of Kin: [NAME]')
    .replace(/(?:GP|Doctor)\s*:?\s*(?:Dr\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi, 'GP: [NAME]')
    .replace(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Lane|Avenue|Close|Drive|Way|Court|Crescent|Place|Gardens|Terrace|Mews)\s*,?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*,?\s*[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}/gi, '[ADDRESS]')
    .replace(/[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}/gi, '[POSTCODE]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '[EMAIL]');
}

export const CLINICAL_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    dnacpr_status: { type: "string", enum: ["In Place", "Not in Place", "Unknown"] },
    dnacpr_date: { type: "string", description: "DNACPR decision date YYYY-MM-DD" },
    allergies: { type: "array", items: { type: "string" } },
    mobility_status: { type: "string" },
    dietary_requirements: { type: "string" },
    communication_needs: { type: "string" },
    conditions: { type: "array", items: { type: "string" } },
    medications: { type: "array", items: { type: "string" } },
    frailty_status: { type: "string", enum: ["mild", "moderate", "severe"] },
    // Lab values
    hba1c_mmol_mol: { type: "number", description: "HbA1c in mmol/mol" },
    hba1c_date: { type: "string", description: "HbA1c test date YYYY-MM-DD" },
    cholesterol_ldl: { type: "number", description: "LDL cholesterol mmol/L" },
    cholesterol_hdl: { type: "number", description: "HDL cholesterol mmol/L" },
    cholesterol_date: { type: "string", description: "Cholesterol test date YYYY-MM-DD" },
    cha2ds2_vasc_score: { type: "integer", description: "CHA2DS2-VASc score 0-9" },
    egfr: { type: "number", description: "eGFR mL/min/1.73m2" },
    creatinine: { type: "number", description: "Creatinine umol/L" },
    blood_pressure_systolic: { type: "integer" },
    blood_pressure_diastolic: { type: "integer" },
    smoking_status: { type: "string", enum: ["current_smoker", "ex_smoker", "never_smoked", "unknown"] },
    alcohol_units_per_week: { type: "integer" },
    weight_kg: { type: "number" },
    height_cm: { type: "number" },
    last_review_date: { type: "string", description: "Last clinical review date YYYY-MM-DD" },
    summary: { type: "string", description: "Brief clinical summary (NO patient names)" },
  },
  required: [],
  additionalProperties: false,
};

export const CLINICAL_SYSTEM_PROMPT = `You are a medical data extraction assistant for a UK care home management system.
Extract ONLY clinical information from the provided document.
DO NOT extract any personally identifiable information (names, addresses, phone numbers, NHS numbers).
The document has been pre-sanitized - any [NAME], [PHONE], [ADDRESS] tokens should be ignored.
Extract ALL lab values, vital signs, and clinical scores when present.
For dates, use ISO format YYYY-MM-DD.`;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
