import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { db?: Database.Database };

export const db =
  globalForDb.db ?? new Database(path.join(DATA_DIR, "app.db"));
globalForDb.db = db;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id            TEXT PRIMARY KEY,
    student_name  TEXT NOT NULL,
    phone         TEXT,
    email         TEXT,
    country       TEXT NOT NULL DEFAULT 'Australia',
    institution   TEXT,
    course        TEXT,
    intake        TEXT,            -- YYYY-MM
    counsellor    TEXT,
    upload_token  TEXT NOT NULL UNIQUE,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id            TEXT PRIMARY KEY,
    case_id       TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    doc_type      TEXT NOT NULL,
    filename      TEXT NOT NULL,
    stored_name   TEXT,            -- null for seeded demo documents
    mime          TEXT NOT NULL,
    status        TEXT NOT NULL,   -- verified | issues | unchecked | rejected
    ai_json       TEXT,
    uploaded_by   TEXT NOT NULL,   -- student | staff
    superseded    INTEGER NOT NULL DEFAULT 0,
    uploaded_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id            TEXT PRIMARY KEY,
    case_id       TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,
    message       TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_docs_case ON documents(case_id);
  CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id);
`);

export type CaseRow = {
  id: string;
  student_name: string;
  phone: string | null;
  email: string | null;
  country: string;
  institution: string | null;
  course: string | null;
  intake: string | null;
  counsellor: string | null;
  upload_token: string;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  case_id: string;
  doc_type: string;
  filename: string;
  stored_name: string | null;
  mime: string;
  status: "verified" | "issues" | "unchecked" | "rejected";
  ai_json: string | null;
  uploaded_by: "student" | "staff";
  superseded: number;
  uploaded_at: string;
};

export type EventRow = {
  id: string;
  case_id: string;
  type: string;
  message: string;
  created_at: string;
};
