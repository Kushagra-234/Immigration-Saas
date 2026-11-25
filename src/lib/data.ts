import { connection } from "next/server";
import { deriveCaseState } from "./case-state";
import { db, type CaseRow, type DocumentRow, type EventRow } from "./db";

// better-sqlite3 is synchronous, so every read must opt out of prerendering.

export async function listCases() {
  await connection();
  const cases = db.prepare("SELECT * FROM cases ORDER BY created_at DESC").all() as CaseRow[];
  const docs = db.prepare("SELECT * FROM documents").all() as DocumentRow[];
  const events = db.prepare("SELECT * FROM events").all() as EventRow[];
  const now = new Date();
  return cases.map((c) => ({
    ...c,
    state: deriveCaseState(
      c,
      docs.filter((d) => d.case_id === c.id),
      events.filter((e) => e.case_id === c.id),
      now,
    ),
  }));
}

export async function getCase(id: string) {
  await connection();
  const c = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
  if (!c) return null;
  return loadCase(c);
}

export async function getCaseByToken(token: string) {
  await connection();
  const c = db.prepare("SELECT * FROM cases WHERE upload_token = ?").get(token) as
    | CaseRow
    | undefined;
  if (!c) return null;
  return loadCase(c);
}

function loadCase(c: CaseRow) {
  const docs = db
    .prepare("SELECT * FROM documents WHERE case_id = ? ORDER BY uploaded_at DESC")
    .all(c.id) as DocumentRow[];
  const events = db
    .prepare("SELECT * FROM events WHERE case_id = ? ORDER BY created_at DESC")
    .all(c.id) as EventRow[];
  return { case: c, docs, events, state: deriveCaseState(c, docs, events) };
}
