# FileFlow — MVP

AI document intake and case tracking for study-abroad consultancies (Australia, subclass 500).

## What it does

- **Student upload link (no login):** each case gets a private link. The counsellor sends it on WhatsApp in one click, with the list of missing documents pre-filled.
- **AI check on every upload:** Claude reads the PDF or photo, confirms it's the right document, flags blurry or cropped scans, missing pages and missing bank stamps, and extracts name, DOB, passport number, dates, course, balances and so on. The student sees the result immediately.
- **Cross-document consistency:** compares name, DOB and passport number across every document, checks passport validity against the course end date, compares the offer letter with what was applied for, the COE with the offer letter, and flags stale English tests and bank statements.
- **Stage is derived, never typed:** the pipeline stage comes from verified documents. Staff record only the three milestones no document can prove: application submitted, visa lodged, decision.
- **Dashboard:** pipeline counts, at-risk cases (critical conflicts, stalled 7+ days, intake close with no COE), and the next action for every case, filterable by counsellor.

## Run it

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY
npm run seed                   # 5 demo cases (wipes existing data)
npm run dev
```

Open http://localhost:3000. Without an API key, uploads are stored and marked "Awaiting review" instead of being checked.

## Stack

Next.js 16 (App Router, server actions), SQLite (`better-sqlite3`, file at `data/app.db`), uploads in `data/uploads/`, Claude (`claude-opus-5`) with structured outputs for document checks.

Key files:
- `src/lib/ai.ts`: document check prompt and schema
- `src/lib/case-state.ts`: cross-document rules, stage derivation, next action, risk
- `src/lib/checklist.ts`: the subclass 500 checklist
- `src/lib/actions.ts`: upload, create case, milestones

## Not production-ready yet

- **No staff authentication.** Anyone who can reach the server can see every case. Add auth before deploying anywhere public.
- Files are stored unencrypted on local disk. Passports, ITRs and bank statements fall under India's DPDP Act, so move them to encrypted object storage with access logging.
- Single consultancy (no multi-tenancy) and Australia only.
- WhatsApp reminders open `wa.me` with a pre-filled message; they aren't sent automatically. Automatic sending needs the WhatsApp Business API.
