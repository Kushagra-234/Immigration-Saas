// Seeds demo cases with pre-computed AI results so the dashboard, pipeline
// and cross-document checks can be explored without an API key.
// Usage: npm run seed   (wipes existing data)

import { nanoid } from "nanoid";
import type { DocCheck } from "../src/lib/ai";
import { deriveCaseState, STAGES } from "../src/lib/case-state";
import { DOC_LABEL, type DocType } from "../src/lib/checklist";
import { db, type CaseRow, type DocumentRow, type EventRow } from "../src/lib/db";

db.exec("DELETE FROM events; DELETE FROM documents; DELETE FROM cases;");

const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const EMPTY: DocCheck["fields"] = {
  full_name: null, date_of_birth: null, passport_number: null, passport_expiry: null,
  institution: null, course: null, course_start: null, course_end: null,
  test_type: null, overall_score: null, test_date: null, balance_amount: null,
  currency: null, statement_end_date: null, annual_income: null, assessment_year: null,
  amount_paid: null,
};

type DocSpec = {
  type: DocType;
  daysAgo: number;
  fields: Partial<DocCheck["fields"]>;
  issues?: string[];
  summary: string;
  status?: DocumentRow["status"];
};

type CaseSpec = {
  name: string;
  phone: string;
  institution: string;
  course: string;
  intake: string;
  counsellor: string;
  openedDaysAgo: number;
  docs: DocSpec[];
  milestones?: { type: string; label: string; daysAgo: number }[];
};

function addCase(spec: CaseSpec) {
  const id = nanoid(10);
  db.prepare(
    `INSERT INTO cases (id, student_name, phone, email, country, institution, course, intake, counsellor, upload_token, created_at)
     VALUES (?, ?, ?, NULL, 'Australia', ?, ?, ?, ?, ?, ?)`,
  ).run(id, spec.name, spec.phone, spec.institution, spec.course, spec.intake, spec.counsellor, nanoid(20), ago(spec.openedDaysAgo));

  // Replay docs and milestones in time order so stage-change events land
  // where they would have in real use.
  type Step = { at: string; run: () => void };
  const steps: Step[] = [
    { at: ago(spec.openedDaysAgo), run: () => event(id, "case_created", "Case opened", ago(spec.openedDaysAgo)) },
  ];
  for (const d of spec.docs) {
    const at = ago(d.daysAgo);
    steps.push({
      at,
      run: () => {
        const issues = d.issues ?? [];
        const check: DocCheck = {
          detected_type: d.type,
          matches_expected: true,
          legible: !issues.some((i) => /blur|legib|dark/i.test(i)),
          complete: !issues.some((i) => /missing|page/i.test(i)),
          signature_or_stamp_present: issues.some((i) => /stamp|sign/i.test(i)) ? false : null,
          fields: { ...EMPTY, ...d.fields },
          issues,
          summary: d.summary,
        };
        const status = d.status ?? (issues.length ? "issues" : "verified");
        db.prepare(
          `INSERT INTO documents (id, case_id, doc_type, filename, stored_name, mime, status, ai_json, uploaded_by, uploaded_at)
           VALUES (?, ?, ?, ?, NULL, 'application/pdf', ?, ?, ?, ?)`,
        ).run(nanoid(), id, d.type, `${d.type}.pdf`, status, JSON.stringify(check),
          d.type === "offer_letter" || d.type === "coe" ? "staff" : "student", at);
        const outcome = status === "verified" ? "verified" : "has issues";
        event(id, "document_uploaded", `${DOC_LABEL[d.type]} uploaded — ${outcome}`, at);
      },
    });
  }
  for (const m of spec.milestones ?? []) {
    steps.push({ at: ago(m.daysAgo), run: () => event(id, m.type, m.label, ago(m.daysAgo)) });
  }
  steps.sort((a, b) => a.at.localeCompare(b.at));

  for (const step of steps) {
    const before = stage(id);
    step.run();
    const after = stage(id);
    if (after !== before) event(id, "stage_changed", `Stage moved: ${STAGES[before]} → ${STAGES[after]}`, step.at);
  }
}

function event(caseId: string, type: string, message: string, at: string) {
  db.prepare("INSERT INTO events (id, case_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)").run(nanoid(), caseId, type, message, at);
}

function stage(caseId: string) {
  const c = db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId) as CaseRow;
  const docs = db.prepare("SELECT * FROM documents WHERE case_id = ?").all(caseId) as DocumentRow[];
  const events = db.prepare("SELECT * FROM events WHERE case_id = ?").all(caseId) as EventRow[];
  return deriveCaseState(c, docs, events).stage;
}

// 1. Offer in hand, but passport expires mid-course; GS bank statement unstamped.
addCase({
  name: "Aarav Sharma",
  phone: "9876543210",
  institution: "Monash University",
  course: "Master of Data Science",
  intake: ymd(80).slice(0, 7),
  counsellor: "Priya",
  openedDaysAgo: 41,
  docs: [
    { type: "passport", daysAgo: 40, summary: "Indian passport, photo and address pages.", fields: { full_name: "AARAV SHARMA", date_of_birth: "2001-04-12", passport_number: "W1234567", passport_expiry: ymd(420) } },
    { type: "class10", daysAgo: 40, summary: "CBSE Class X marksheet.", fields: { full_name: "AARAV SHARMA", date_of_birth: "2001-04-12" } },
    { type: "class12", daysAgo: 38, summary: "CBSE Class XII marksheet.", fields: { full_name: "AARAV SHARMA" } },
    { type: "bachelors", daysAgo: 38, summary: "B.Tech degree and consolidated transcript, VIT.", fields: { full_name: "AARAV SHARMA", institution: "VIT University", course: "B.Tech Computer Science" } },
    { type: "english_test", daysAgo: 35, summary: "IELTS Academic TRF, overall 7.0.", fields: { full_name: "AARAV SHARMA", date_of_birth: "2001-04-12", test_type: "IELTS Academic", overall_score: "7.0", test_date: ymd(-200), passport_number: "W1234567" } },
    { type: "offer_letter", daysAgo: 12, summary: "Full offer letter from Monash University.", fields: { full_name: "Aarav Sharma", date_of_birth: "2001-04-12", institution: "Monash University", course: "Master of Data Science", course_start: ymd(80), course_end: ymd(80 + 730), passport_number: "W1234567" } },
    { type: "bank_statement", daysAgo: 3, summary: "SBI savings account statement, 6 months.", issues: ["No bank stamp or signature on the statement — get it stamped by the branch or download the signed e-statement."], fields: { full_name: "RAJESH SHARMA", balance_amount: 4200000, currency: "INR", statement_end_date: ymd(-5) } },
  ],
  milestones: [{ type: "application_submitted", label: "Application submitted", daysAgo: 30 }],
});

// 2. Name and DOB inconsistencies across academics; stalled for 9 days.
addCase({
  name: "Simranjeet Kaur",
  phone: "9812345678",
  institution: "Deakin University",
  course: "Bachelor of Nursing",
  intake: ymd(110).slice(0, 7),
  counsellor: "Rahul",
  openedDaysAgo: 20,
  docs: [
    { type: "passport", daysAgo: 18, summary: "Indian passport, photo page and last page.", fields: { full_name: "SIMRANJEET KAUR", date_of_birth: "2005-09-02", passport_number: "Z7654321", passport_expiry: ymd(3000) } },
    { type: "class10", daysAgo: 9, summary: "PSEB Class 10 certificate.", fields: { full_name: "SIMRAN KAUR", date_of_birth: "2005-09-02" } },
    { type: "class12", daysAgo: 9, summary: "PSEB Class 12 marksheet.", fields: { full_name: "SIMRANJEET KAUR", date_of_birth: "2005-02-09" } },
  ],
});

// 3. Clean file, COE received — ready to lodge.
addCase({
  name: "Rohan Mehta",
  phone: "9988776655",
  institution: "University of Technology Sydney",
  course: "Master of Information Technology",
  intake: ymd(60).slice(0, 7),
  counsellor: "Priya",
  openedDaysAgo: 75,
  docs: [
    { type: "passport", daysAgo: 74, summary: "Indian passport.", fields: { full_name: "ROHAN MEHTA", date_of_birth: "2000-11-23", passport_number: "V9988776", passport_expiry: ymd(2500) } },
    { type: "class10", daysAgo: 74, summary: "ICSE Class X marksheet.", fields: { full_name: "ROHAN MEHTA", date_of_birth: "2000-11-23" } },
    { type: "class12", daysAgo: 73, summary: "ISC Class XII marksheet.", fields: { full_name: "ROHAN MEHTA" } },
    { type: "bachelors", daysAgo: 73, summary: "B.Sc IT degree, Mumbai University.", fields: { full_name: "ROHAN MEHTA", course: "B.Sc Information Technology" } },
    { type: "english_test", daysAgo: 72, summary: "PTE Academic score report, overall 68.", fields: { full_name: "ROHAN MEHTA", date_of_birth: "2000-11-23", test_type: "PTE Academic", overall_score: "68", test_date: ymd(-120) } },
    { type: "offer_letter", daysAgo: 50, summary: "Offer letter, UTS.", fields: { full_name: "Rohan Mehta", date_of_birth: "2000-11-23", institution: "University of Technology Sydney", course: "Master of Information Technology", course_start: ymd(60), course_end: ymd(60 + 730), passport_number: "V9988776" } },
    { type: "bank_statement", daysAgo: 40, summary: "HDFC statement with bank seal.", fields: { full_name: "SUNIL MEHTA", balance_amount: 5100000, currency: "INR", statement_end_date: ymd(-42) } },
    { type: "itr", daysAgo: 40, summary: "ITR-V acknowledgements AY 2023-24 to 2025-26.", fields: { full_name: "SUNIL MEHTA", annual_income: 1850000, assessment_year: "2025-26" } },
    { type: "fee_receipt", daysAgo: 30, summary: "UTS tuition deposit receipt.", fields: { full_name: "Rohan Mehta", institution: "University of Technology Sydney", amount_paid: 21000, currency: "AUD" } },
    { type: "oshc", daysAgo: 29, summary: "Allianz OSHC certificate, single cover.", fields: { full_name: "Rohan Mehta", date_of_birth: "2000-11-23" } },
    { type: "medical", daysAgo: 25, summary: "HAP ID letter from panel physician.", fields: { full_name: "ROHAN MEHTA", date_of_birth: "2000-11-23", passport_number: "V9988776" } },
    { type: "coe", daysAgo: 4, summary: "Electronic Confirmation of Enrolment.", fields: { full_name: "Rohan Mehta", date_of_birth: "2000-11-23", institution: "University of Technology Sydney", course: "Master of Information Technology", course_start: ymd(60), course_end: ymd(60 + 730) } },
  ],
  milestones: [{ type: "application_submitted", label: "Application submitted", daysAgo: 70 }],
});

// 4. Just started; first upload was a bad scan.
addCase({
  name: "Neha Patel",
  phone: "9123456780",
  institution: "RMIT University",
  course: "Master of Business Administration",
  intake: ymd(200).slice(0, 7),
  counsellor: "Rahul",
  openedDaysAgo: 2,
  docs: [
    { type: "passport", daysAgo: 1, summary: "Photo page of an Indian passport, photographed on a table.", issues: ["Photo is blurry — passport number and dates can't be read reliably.", "Back (address) page is missing."], fields: { full_name: "NEHA PATEL" } },
  ],
});

// 5. Completed case.
addCase({
  name: "Karan Singh",
  phone: "9001122334",
  institution: "University of Queensland",
  course: "Master of Engineering",
  intake: ymd(-20).slice(0, 7),
  counsellor: "Priya",
  openedDaysAgo: 150,
  docs: [
    { type: "passport", daysAgo: 149, summary: "Indian passport.", fields: { full_name: "KARAN SINGH", date_of_birth: "1999-06-30", passport_number: "U1122334", passport_expiry: ymd(2800) } },
    { type: "class10", daysAgo: 148, summary: "CBSE Class X.", fields: { full_name: "KARAN SINGH", date_of_birth: "1999-06-30" } },
    { type: "class12", daysAgo: 148, summary: "CBSE Class XII.", fields: { full_name: "KARAN SINGH" } },
    { type: "english_test", daysAgo: 147, summary: "IELTS Academic, 6.5.", fields: { full_name: "KARAN SINGH", test_type: "IELTS Academic", overall_score: "6.5", test_date: ymd(-300) } },
    { type: "offer_letter", daysAgo: 120, summary: "UQ offer letter.", fields: { full_name: "Karan Singh", institution: "University of Queensland", course: "Master of Engineering", course_start: ymd(-20), course_end: ymd(-20 + 730) } },
    { type: "bank_statement", daysAgo: 110, summary: "PNB statement with seal.", fields: { full_name: "HARPREET SINGH", balance_amount: 3900000, currency: "INR", statement_end_date: ymd(-112) } },
    { type: "itr", daysAgo: 110, summary: "ITR acknowledgements, 3 years.", fields: { full_name: "HARPREET SINGH", annual_income: 1400000 } },
    { type: "fee_receipt", daysAgo: 100, summary: "UQ fee receipt.", fields: { full_name: "Karan Singh", amount_paid: 24000, currency: "AUD" } },
    { type: "oshc", daysAgo: 99, summary: "Bupa OSHC certificate.", fields: { full_name: "Karan Singh" } },
    { type: "medical", daysAgo: 95, summary: "HAP ID letter.", fields: { full_name: "KARAN SINGH" } },
    { type: "coe", daysAgo: 80, summary: "UQ COE.", fields: { full_name: "Karan Singh", institution: "University of Queensland", course: "Master of Engineering" } },
  ],
  milestones: [
    { type: "application_submitted", label: "Application submitted", daysAgo: 140 },
    { type: "visa_lodged", label: "Visa lodged", daysAgo: 75 },
    { type: "visa_granted", label: "Visa granted", daysAgo: 45 },
  ],
});

const count = (db.prepare("SELECT COUNT(*) AS n FROM cases").get() as { n: number }).n;
console.log(`Seeded ${count} demo cases.`);
