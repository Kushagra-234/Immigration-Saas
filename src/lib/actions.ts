"use server";

import Anthropic from "@anthropic-ai/sdk";
import { customAlphabet, nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { aiEnabled, checkDocument, isSupportedMime, type DocCheck } from "./ai";
import { deriveCaseState, MANUAL_MILESTONES, STAGES, type Milestone } from "./case-state";
import { DOC_LABEL, isDocType } from "./checklist";
import { db, UPLOAD_DIR, type CaseRow, type DocumentRow, type EventRow } from "./db";

// NOTE: MVP has no staff login. Staff actions trust the caller; the student
// portal is protected only by its unguessable upload token. Add auth before
// putting this on the internet.

const token = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 20);

function logEvent(caseId: string, type: string, message: string) {
  db.prepare("INSERT INTO events (id, case_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
    nanoid(),
    caseId,
    type,
    message,
    new Date().toISOString(),
  );
}

function stageOf(caseId: string) {
  const c = db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId) as CaseRow;
  const docs = db.prepare("SELECT * FROM documents WHERE case_id = ?").all(caseId) as DocumentRow[];
  const events = db.prepare("SELECT * FROM events WHERE case_id = ?").all(caseId) as EventRow[];
  return deriveCaseState(c, docs, events).stage;
}

// Runs a mutation and records an event if it moved the case to a new stage.
function withStageTracking(caseId: string, fn: () => void) {
  const before = stageOf(caseId);
  fn();
  const after = stageOf(caseId);
  if (after !== before) {
    logEvent(caseId, "stage_changed", `Stage moved: ${STAGES[before]} → ${STAGES[after]}`);
  }
}

export async function createCase(formData: FormData) {
  const name = String(formData.get("student_name") ?? "").trim();
  if (!name) throw new Error("Student name is required");
  const id = nanoid(10);
  const field = (k: string) => String(formData.get(k) ?? "").trim() || null;
  db.prepare(
    `INSERT INTO cases (id, student_name, phone, email, country, institution, course, intake, counsellor, upload_token, created_at)
     VALUES (?, ?, ?, ?, 'Australia', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    field("phone"),
    field("email"),
    field("institution"),
    field("course"),
    field("intake"),
    field("counsellor"),
    token(),
    new Date().toISOString(),
  );
  logEvent(id, "case_created", "Case opened");
  redirect(`/cases/${id}`);
}

export type UploadResult = {
  ok: boolean;
  status?: DocumentRow["status"];
  message: string;
  issues?: string[];
};

export async function uploadDocument(_prev: UploadResult | null, formData: FormData): Promise<UploadResult> {
  const docType = String(formData.get("doc_type") ?? "");
  const file = formData.get("file");
  const uploadToken = formData.get("token");
  const caseIdField = formData.get("case_id");

  if (!isDocType(docType)) return { ok: false, message: "Unknown document type." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file first." };

  const c = (
    uploadToken
      ? db.prepare("SELECT * FROM cases WHERE upload_token = ?").get(String(uploadToken))
      : db.prepare("SELECT * FROM cases WHERE id = ?").get(String(caseIdField))
  ) as CaseRow | undefined;
  if (!c) return { ok: false, message: "Case not found." };
  const uploadedBy = uploadToken ? "student" : "staff";

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type;
  let status: DocumentRow["status"];
  let check: DocCheck | null = null;
  let message: string;

  if (!isSupportedMime(mime)) {
    status = "rejected";
    message = `${file.name} is not a PDF or image. Please upload a PDF, JPG or PNG.`;
  } else if (!aiEnabled()) {
    status = "unchecked";
    message = "Received. Automatic checking is off (no ANTHROPIC_API_KEY), so staff will review it.";
  } else {
    try {
      check = await checkDocument(docType, bytes, mime);
    } catch (err) {
      const reason =
        err instanceof Anthropic.APIError ? `AI service error ${err.status}` : (err as Error).message;
      return { ok: false, message: `Could not check the document: ${reason}. Please try again.` };
    }
    const problems = [...check.issues];
    if (!check.matches_expected)
      problems.unshift(`This looks like a ${check.detected_type.replace("_", " ")}, not a ${DOC_LABEL[docType]}.`);
    status = problems.length === 0 && check.legible && check.complete ? "verified" : "issues";
    check = { ...check, issues: problems };
    message =
      status === "verified"
        ? `${DOC_LABEL[docType]} looks good.`
        : `${DOC_LABEL[docType]} needs to be re-uploaded.`;
  }

  const id = nanoid();
  const ext = path.extname(file.name).slice(0, 8) || "";
  const storedName = `${id}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), bytes);

  withStageTracking(c.id, () => {
    db.prepare("UPDATE documents SET superseded = 1 WHERE case_id = ? AND doc_type = ?").run(c.id, docType);
    db.prepare(
      `INSERT INTO documents (id, case_id, doc_type, filename, stored_name, mime, status, ai_json, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      c.id,
      docType,
      file.name,
      storedName,
      mime,
      status,
      check ? JSON.stringify(check) : null,
      uploadedBy,
      new Date().toISOString(),
    );
    const outcome = { verified: "verified", issues: "has issues", unchecked: "awaiting review", rejected: "rejected" }[status];
    logEvent(c.id, "document_uploaded", `${DOC_LABEL[docType]} uploaded by ${uploadedBy} — ${outcome}`);
  });

  refresh();
  return { ok: status !== "rejected", status, message, issues: check?.issues };
}

export async function recordMilestone(caseId: string, milestone: Milestone) {
  if (!(milestone in MANUAL_MILESTONES)) throw new Error("Unknown milestone");
  withStageTracking(caseId, () => logEvent(caseId, milestone, MANUAL_MILESTONES[milestone].label));
  refresh();
}

export async function markVerified(docId: string) {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(docId) as DocumentRow | undefined;
  if (!doc) return;
  withStageTracking(doc.case_id, () => {
    db.prepare("UPDATE documents SET status = 'verified' WHERE id = ?").run(docId);
    logEvent(doc.case_id, "document_verified", `${DOC_LABEL[doc.doc_type as keyof typeof DOC_LABEL]} manually approved by staff`);
  });
  refresh();
}
