// Derives everything about a case — checklist status, cross-document flags,
// pipeline stage, next action and risk — from its documents and events.
// Nothing here is stored: stage is never updated by hand.

import type { DocCheck } from "./ai";
import { CHECKLIST, DOC_LABEL, type DocType } from "./checklist";
import type { CaseRow, DocumentRow, EventRow } from "./db";

export const STAGES = [
  "Collecting documents",
  "Ready to apply",
  "Application submitted",
  "Offer received",
  "GS documents ready",
  "Fee, OSHC & medical done",
  "COE received",
  "Visa lodged",
  "Decision received",
] as const;

// Milestones staff record because no document proves them.
export const MANUAL_MILESTONES = {
  application_submitted: { stage: 2, label: "Application submitted" },
  visa_lodged: { stage: 7, label: "Visa lodged" },
  visa_granted: { stage: 8, label: "Visa granted" },
  visa_refused: { stage: 8, label: "Visa refused" },
} as const;
export type Milestone = keyof typeof MANUAL_MILESTONES;

export type Flag = {
  severity: "critical" | "warning";
  title: string;
  detail: string;
};

export type ItemStatus = "missing" | "verified" | "issues" | "unchecked" | "rejected";

export type ChecklistEntry = {
  type: DocType;
  label: string;
  hint: string;
  optional: boolean;
  phase: (typeof CHECKLIST)[number]["phase"];
  status: ItemStatus;
  doc: DocumentRow | null;
  check: DocCheck | null;
};

export type CaseState = {
  checklist: ChecklistEntry[];
  flags: Flag[];
  stage: number;
  stageLabel: string;
  nextAction: string;
  missingNow: ChecklistEntry[];
  atRisk: string[];
  lastActivity: string;
  daysSinceActivity: number;
  decision: "granted" | "refused" | null;
};

// Phases whose documents must be in before the case can move past each stage.
const PHASE_FOR_STAGE: Record<number, ChecklistEntry["phase"][]> = {
  0: ["application"],
  1: ["application"],
  2: ["application"],
  3: ["application", "gs"],
  4: ["application", "gs", "pre_coe"],
};

const STUDENT_IDENTITY_DOCS: DocType[] = [
  "passport", "class10", "class12", "bachelors", "english_test",
  "offer_letter", "coe", "oshc", "medical",
];

const DAY = 86_400_000;

export function parseCheck(doc: DocumentRow | null): DocCheck | null {
  if (!doc?.ai_json) return null;
  try {
    return JSON.parse(doc.ai_json) as DocCheck;
  } catch {
    return null;
  }
}

function nameTokens(name: string) {
  return new Set(
    name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((t) => t.length > 1),
  );
}

function compareNames(a: string, b: string): "same" | "partial" | "different" {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return "same";
  const shared = [...ta].filter((t) => tb.has(t)).length;
  if (shared === ta.size && shared === tb.size) return "same";
  if (shared === Math.min(ta.size, tb.size)) return "partial";
  return "different";
}

function normId(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function textOverlaps(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const stop = new Set(["OF", "THE", "AND", "IN", "UNIVERSITY", "BACHELOR", "MASTER", "MASTERS"]);
  const meaningful = [...ta].filter((t) => !stop.has(t));
  if (meaningful.length === 0) return true;
  return meaningful.filter((t) => tb.has(t)).length / meaningful.length >= 0.6;
}

function toDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s.length === 7 ? `${s}-01` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function crossCheck(c: CaseRow, byType: Map<DocType, ChecklistEntry>, now: Date): Flag[] {
  const flags: Flag[] = [];
  const get = (t: DocType) => byType.get(t)?.check ?? null;

  // Identity reference: passport first, then Class 10 (the document Indian
  // DOB records are anchored to).
  const passport = get("passport");
  const refDoc: DocType | null = passport?.fields.full_name
    ? "passport"
    : get("class10")?.fields.full_name
      ? "class10"
      : null;
  const ref = refDoc ? get(refDoc)! : null;

  if (ref) {
    for (const t of STUDENT_IDENTITY_DOCS) {
      if (t === refDoc) continue;
      const f = get(t)?.fields;
      if (!f) continue;

      if (f.full_name && ref.fields.full_name) {
        const cmp = compareNames(ref.fields.full_name, f.full_name);
        if (cmp === "different") {
          flags.push({
            severity: "critical",
            title: `Name mismatch: ${DOC_LABEL[t]}`,
            detail: `"${f.full_name}" vs "${ref.fields.full_name}" on ${DOC_LABEL[refDoc!]}.`,
          });
        } else if (cmp === "partial") {
          flags.push({
            severity: "warning",
            title: `Name differs slightly: ${DOC_LABEL[t]}`,
            detail: `"${f.full_name}" vs "${ref.fields.full_name}" — check for a missing middle name or surname. Universities and the Department reject files with inconsistent names.`,
          });
        }
      }

      if (f.date_of_birth && ref.fields.date_of_birth && f.date_of_birth !== ref.fields.date_of_birth) {
        flags.push({
          severity: "critical",
          title: `Date of birth mismatch: ${DOC_LABEL[t]}`,
          detail: `${f.date_of_birth} vs ${ref.fields.date_of_birth} on ${DOC_LABEL[refDoc!]}.`,
        });
      }

      if (
        passport?.fields.passport_number &&
        f.passport_number &&
        normId(f.passport_number) !== normId(passport.fields.passport_number)
      ) {
        flags.push({
          severity: "critical",
          title: `Passport number mismatch: ${DOC_LABEL[t]}`,
          detail: `${f.passport_number} vs ${passport.fields.passport_number} on the passport.`,
        });
      }
    }
  }

  // Passport validity against course length.
  const expiry = toDate(passport?.fields.passport_expiry);
  if (expiry) {
    const courseEnd = toDate(get("coe")?.fields.course_end ?? get("offer_letter")?.fields.course_end);
    if (expiry < now) {
      flags.push({ severity: "critical", title: "Passport has expired", detail: `Expired on ${fmt(expiry)}.` });
    } else if (courseEnd && expiry < courseEnd) {
      flags.push({
        severity: "critical",
        title: "Passport expires before course ends",
        detail: `Passport expires ${fmt(expiry)}, course ends ${fmt(courseEnd)}. Renew before visa lodgement.`,
      });
    } else if (expiry.getTime() - now.getTime() < 183 * DAY) {
      flags.push({
        severity: "warning",
        title: "Passport expires within 6 months",
        detail: `Expires ${fmt(expiry)}.`,
      });
    }
  }

  // Offer letter vs what the counsellor applied for.
  const offer = get("offer_letter");
  if (offer) {
    if (c.course && offer.fields.course && !textOverlaps(c.course, offer.fields.course)) {
      flags.push({
        severity: "warning",
        title: "Offer letter course differs from application",
        detail: `Applied for "${c.course}", offer says "${offer.fields.course}".`,
      });
    }
    if (c.institution && offer.fields.institution && !textOverlaps(c.institution, offer.fields.institution)) {
      flags.push({
        severity: "critical",
        title: "Offer letter is from a different institution",
        detail: `Applied to "${c.institution}", offer is from "${offer.fields.institution}".`,
      });
    }
    const start = toDate(offer.fields.course_start);
    const intake = toDate(c.intake);
    if (start && intake && Math.abs(start.getTime() - intake.getTime()) > 45 * DAY) {
      flags.push({
        severity: "warning",
        title: "Offer letter intake differs",
        detail: `Planned intake ${fmt(intake)}, offer course starts ${fmt(start)}.`,
      });
    }
  }

  // COE must match the offer it came from.
  const coe = get("coe");
  if (coe && offer) {
    if (coe.fields.course && offer.fields.course && !textOverlaps(offer.fields.course, coe.fields.course)) {
      flags.push({
        severity: "critical",
        title: "COE course differs from offer letter",
        detail: `Offer: "${offer.fields.course}", COE: "${coe.fields.course}".`,
      });
    }
  }

  // English test validity (most providers accept 2 years).
  const testDate = toDate(get("english_test")?.fields.test_date);
  if (testDate) {
    const by = toDate(c.intake) ?? now;
    if (by.getTime() - testDate.getTime() > 730 * DAY) {
      flags.push({
        severity: "warning",
        title: "English test older than 2 years at intake",
        detail: `Test taken ${fmt(testDate)}. Most universities and the Department require a score under 2 years old.`,
      });
    }
  }

  // Bank statements go stale quickly for GS.
  const stmtEnd = toDate(get("bank_statement")?.fields.statement_end_date);
  if (stmtEnd && now.getTime() - stmtEnd.getTime() > 30 * DAY) {
    flags.push({
      severity: "warning",
      title: "Bank statement is more than 30 days old",
      detail: `Statement ends ${fmt(stmtEnd)}. GS assessors expect a recent statement.`,
    });
  }

  return flags;
}

export function deriveCaseState(
  c: CaseRow,
  docs: DocumentRow[],
  events: EventRow[],
  now = new Date(),
): CaseState {
  const current = new Map<string, DocumentRow>();
  for (const d of docs) {
    if (d.superseded) continue;
    const prev = current.get(d.doc_type);
    if (!prev || prev.uploaded_at < d.uploaded_at) current.set(d.doc_type, d);
  }

  const checklist: ChecklistEntry[] = CHECKLIST.map((item) => {
    const doc = current.get(item.type) ?? null;
    return {
      type: item.type,
      label: item.label,
      hint: item.hint,
      optional: Boolean(item.optional),
      phase: item.phase,
      status: doc ? doc.status : "missing",
      doc,
      check: parseCheck(doc),
    };
  });
  const byType = new Map(checklist.map((e) => [e.type, e]));

  const docFlags: Flag[] = checklist
    .filter((e) => e.status === "issues" || e.status === "rejected")
    .map((e) => ({
      severity: e.check && !e.check.matches_expected ? "critical" : "warning",
      title: `${e.label}: needs re-upload`,
      detail: e.check?.issues.join(" · ") || "Unsupported file type.",
    }));

  const flags = [...docFlags, ...crossCheck(c, byType, now)].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
  );

  // A phase is done when every required document in it is verified.
  // "unchecked" (AI disabled) counts as received but not verified.
  const phaseDone = (phase: ChecklistEntry["phase"]) =>
    checklist
      .filter((e) => e.phase === phase && !e.optional)
      .every((e) => e.status === "verified");
  const has = (t: DocType) => byType.get(t)!.status === "verified";

  const milestones = new Set(events.map((e) => e.type));
  let stage = 0;
  if (phaseDone("application")) stage = 1;
  if (milestones.has("application_submitted")) stage = 2;
  if (has("offer_letter")) stage = 3;
  if (stage >= 3 && phaseDone("gs")) stage = 4;
  if (stage >= 4 && phaseDone("pre_coe")) stage = 5;
  if (has("coe")) stage = 6;
  if (milestones.has("visa_lodged")) stage = 7;
  const decision = milestones.has("visa_granted")
    ? "granted"
    : milestones.has("visa_refused")
      ? "refused"
      : null;
  if (decision) stage = 8;

  // Documents the student owes right now (offer letter and COE come from
  // the university, so they're never asked of the student).
  const duePhases = PHASE_FOR_STAGE[stage] ?? ["application", "gs", "pre_coe"];
  const missingNow = checklist.filter(
    (e) =>
      duePhases.includes(e.phase) &&
      !e.optional &&
      (e.status === "missing" || e.status === "issues" || e.status === "rejected"),
  );

  const critical = flags.filter((f) => f.severity === "critical");
  let nextAction: string;
  if (critical.length > 0) nextAction = `Resolve: ${critical[0].title}`;
  else if (missingNow.length > 0)
    nextAction = `Chase student for ${missingNow.length} document${missingNow.length > 1 ? "s" : ""}: ${missingNow.map((m) => m.label.split(" (")[0]).join(", ")}`;
  else
    nextAction = [
      "Collect application documents",
      `Submit application to ${c.institution ?? "university"}, then mark it submitted`,
      "Waiting on offer letter — upload it when it arrives",
      "Collect GS financials",
      "Collect fee receipt, OSHC and medical",
      "Waiting on COE from university — upload it when it arrives",
      "Lodge the visa application, then mark it lodged",
      "Awaiting visa decision",
      decision === "granted" ? "Visa granted — case complete" : "Visa refused — review refusal reasons",
    ][stage];

  const activityTimes = [
    c.created_at,
    ...docs.map((d) => d.uploaded_at),
    ...events.map((e) => e.created_at),
  ].sort();
  const lastActivity = activityTimes[activityTimes.length - 1];
  const daysSinceActivity = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / DAY);

  const atRisk: string[] = [];
  if (stage < 8) {
    if (critical.length > 0) atRisk.push(`${critical.length} critical issue${critical.length > 1 ? "s" : ""}`);
    if (daysSinceActivity >= 7) atRisk.push(`No activity for ${daysSinceActivity} days`);
    const intake = toDate(c.intake);
    if (intake && stage < 6) {
      const daysToIntake = Math.floor((intake.getTime() - now.getTime()) / DAY);
      if (daysToIntake <= 75) atRisk.push(`Intake in ${daysToIntake} days, no COE yet`);
    }
  }

  return {
    checklist,
    flags,
    stage,
    stageLabel: decision ? `Visa ${decision}` : STAGES[stage],
    nextAction,
    missingNow,
    atRisk,
    lastActivity,
    daysSinceActivity,
    decision,
  };
}
