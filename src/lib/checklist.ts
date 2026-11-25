// Australia student visa (subclass 500) document checklist, grouped by the
// stage at which each document is needed. Order matters: it drives the UI.

export type DocType =
  | "passport"
  | "class10"
  | "class12"
  | "bachelors"
  | "english_test"
  | "offer_letter"
  | "bank_statement"
  | "itr"
  | "gap_explanation"
  | "fee_receipt"
  | "oshc"
  | "medical"
  | "coe";

export type ChecklistItem = {
  type: DocType;
  label: string;
  phase: Phase;
  optional?: boolean;
  hint: string;
};

export type Phase = "application" | "offer" | "gs" | "pre_coe" | "coe";

export const PHASE_LABELS: Record<Phase, string> = {
  application: "University application",
  offer: "Offer letter",
  gs: "Genuine Student (GS) & financials",
  pre_coe: "Fee, insurance & medical",
  coe: "Confirmation of Enrolment",
};

export const CHECKLIST: ChecklistItem[] = [
  { type: "passport", label: "Passport (front & back pages)", phase: "application", hint: "Clear colour scan of the photo page and the last page." },
  { type: "class10", label: "Class 10 marksheet", phase: "application", hint: "Marksheet showing name and date of birth." },
  { type: "class12", label: "Class 12 marksheet", phase: "application", hint: "Final marksheet from the board." },
  { type: "bachelors", label: "Bachelor's degree & transcripts", phase: "application", optional: true, hint: "Only for postgraduate applications." },
  { type: "english_test", label: "IELTS / PTE / TOEFL scorecard", phase: "application", hint: "Official test report form." },
  { type: "offer_letter", label: "Offer letter", phase: "offer", hint: "Uploaded by the consultancy when the university issues it." },
  { type: "bank_statement", label: "Bank statement (sponsor)", phase: "gs", hint: "Last 3–6 months, stamped by the bank." },
  { type: "itr", label: "ITR (sponsor, last 3 years)", phase: "gs", hint: "Income tax returns / acknowledgement." },
  { type: "gap_explanation", label: "Gap explanation & evidence", phase: "gs", optional: true, hint: "Only if there is a study gap." },
  { type: "fee_receipt", label: "Tuition fee receipt", phase: "pre_coe", hint: "RTGS / university payment receipt." },
  { type: "oshc", label: "OSHC insurance certificate", phase: "pre_coe", hint: "Overseas Student Health Cover policy." },
  { type: "medical", label: "Medical (HAP ID / receipt)", phase: "pre_coe", hint: "Panel physician receipt or HAP ID letter." },
  { type: "coe", label: "COE", phase: "coe", hint: "Confirmation of Enrolment from the university." },
];

export const DOC_LABEL: Record<DocType, string> = Object.fromEntries(
  CHECKLIST.map((c) => [c.type, c.label]),
) as Record<DocType, string>;

export const DOC_TYPES = CHECKLIST.map((c) => c.type) as [DocType, ...DocType[]];

export function isDocType(v: string): v is DocType {
  return (DOC_TYPES as string[]).includes(v);
}
