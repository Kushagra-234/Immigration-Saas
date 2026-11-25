import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CopyUploadLink, WhatsAppReminder } from "@/components/share-actions";
import { Card, CardHeader, StatusPill, Tag, formatIntake, timeAgo } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import { markVerified, recordMilestone } from "@/lib/actions";
import { MANUAL_MILESTONES, STAGES, type ChecklistEntry, type Milestone } from "@/lib/case-state";
import { PHASE_LABELS, type Phase } from "@/lib/checklist";
import { getCase } from "@/lib/data";

export default function CasePage(props: PageProps<"/cases/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading case…</p>}>
      <CaseView params={props.params} />
    </Suspense>
  );
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "Name",
  date_of_birth: "Date of birth",
  passport_number: "Passport no.",
  passport_expiry: "Passport expiry",
  institution: "Institution",
  course: "Course",
  course_start: "Course start",
  course_end: "Course end",
  test_type: "Test",
  overall_score: "Overall score",
  test_date: "Test date",
  balance_amount: "Balance",
  currency: "Currency",
  statement_end_date: "Statement to",
  annual_income: "Annual income",
  assessment_year: "Assessment year",
  amount_paid: "Amount paid",
};

async function CaseView({ params }: { params: PageProps<"/cases/[id]">["params"] }) {
  const { id } = await params;
  const data = await getCase(id);
  if (!data) notFound();
  const { case: c, events, state } = data;
  const uploadPath = `/u/${c.upload_token}`;
  const phases = Object.keys(PHASE_LABELS) as Phase[];

  const nextMilestone: Milestone[] =
    state.stage >= 8
      ? []
      : state.stage >= 7
        ? ["visa_granted", "visa_refused"]
        : state.stage >= 6
          ? ["visa_lodged"]
          : state.stage <= 2 && !events.some((e) => e.type === "application_submitted")
            ? ["application_submitted"]
            : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">← Dashboard</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{c.student_name}</h1>
            <p className="text-sm text-slate-500">
              {c.course ?? "Course TBD"} · {c.institution ?? "University TBD"} · Intake {formatIntake(c.intake)} ·
              Counsellor {c.counsellor ?? "unassigned"}
              {c.phone && <> · {c.phone}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {state.atRisk.map((r) => (
              <Tag key={r} tone="red">{r}</Tag>
            ))}
          </div>
        </div>
      </div>

      <Card className="p-4">
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-9">
          {STAGES.map((s, i) => {
            const done = i < state.stage || (i === 8 && state.stage === 8);
            const current = i === state.stage && i !== 8;
            return (
              <li key={s} className="flex flex-col gap-1.5">
                <div
                  className={`h-1.5 rounded-full ${
                    done ? "bg-indigo-500" : current ? "bg-indigo-300" : "bg-slate-200"
                  }`}
                />
                <span className={`text-xs leading-tight ${current ? "font-semibold text-slate-900" : done ? "text-slate-700" : "text-slate-400"}`}>
                  {i === 8 && state.decision ? `Visa ${state.decision}` : s}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-50 px-4 py-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">Next action</div>
            <div className="text-sm font-medium text-indigo-950">{state.nextAction}</div>
          </div>
          {nextMilestone.length > 0 && (
            <div className="flex gap-2">
              {nextMilestone.map((m) => (
                <form key={m} action={recordMilestone.bind(null, c.id, m)}>
                  <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                    Mark: {MANUAL_MILESTONES[m].label}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {phases.map((phase) => (
            <Card key={phase}>
              <CardHeader title={PHASE_LABELS[phase]} />
              <ul className="divide-y divide-slate-100">
                {state.checklist
                  .filter((e) => e.phase === phase)
                  .map((e) => (
                    <ChecklistRow key={e.type} entry={e} caseId={c.id} />
                  ))}
              </ul>
            </Card>
          ))}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader
              title="Cross-document checks"
              aside={
                state.flags.length === 0 ? <Tag tone="emerald">All consistent</Tag> : <Tag tone="red">{state.flags.length}</Tag>
              }
            />
            {state.flags.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Name, date of birth, passport number, validity, course and intake agree across every document checked so far.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {state.flags.map((f, i) => (
                  <li key={i} className="flex gap-3 px-4 py-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.severity === "critical" ? "bg-red-500" : "bg-amber-400"}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{f.title}</div>
                      <div className="text-xs text-slate-600">{f.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Collect from student" />
            <div className="space-y-3 p-4">
              <WhatsAppReminder
                phone={c.phone}
                studentName={c.student_name}
                missing={state.missingNow.map((m) => m.label)}
                path={uploadPath}
              />
              <div>
                <div className="mb-1 text-xs text-slate-500">Student upload link (no login needed)</div>
                <CopyUploadLink path={uploadPath} />
              </div>
              <Link href={uploadPath} target="_blank" className="block text-xs font-medium text-indigo-600 hover:text-indigo-800">
                Open student view ↗
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <ol className="max-h-[420px] space-y-3 overflow-y-auto p-4">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      e.type === "stage_changed" ? "bg-indigo-500" : e.type in MANUAL_MILESTONES ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  />
                  <div>
                    <div className={e.type === "stage_changed" ? "font-medium text-slate-900" : "text-slate-700"}>{e.message}</div>
                    <div className="text-xs text-slate-400">{timeAgo(e.created_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ChecklistRow({ entry: e, caseId }: { entry: ChecklistEntry; caseId: string }) {
  const fields = e.check
    ? Object.entries(e.check.fields).filter(([, v]) => v !== null && v !== "")
    : [];
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{e.label}</span>
          {e.optional && <span className="text-xs text-slate-400">optional</span>}
          <StatusPill status={e.status} />
        </div>
        <div className="flex items-center gap-2">
          {e.doc && (e.status === "issues" || e.status === "unchecked") && (
            <form action={markVerified.bind(null, e.doc.id)}>
              <button className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                Approve manually
              </button>
            </form>
          )}
          <UploadForm docType={e.type} caseId={caseId} label={e.doc ? "Replace" : "Upload"} compact />
        </div>
      </div>

      {e.doc && (
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            {e.doc.stored_name ? (
              <a href={`/api/files/${e.doc.id}`} target="_blank" className="font-medium text-indigo-600 hover:text-indigo-800">
                {e.doc.filename}
              </a>
            ) : (
              <span>{e.doc.filename} (demo)</span>
            )}
            <span>by {e.doc.uploaded_by}</span>
            <span>{timeAgo(e.doc.uploaded_at)}</span>
          </div>
          {e.check && <p className="text-slate-600">{e.check.summary}</p>}
          {e.check && e.check.issues.length > 0 && (
            <ul className="space-y-0.5">
              {e.check.issues.map((i) => (
                <li key={i} className="text-amber-800">✗ {i}</li>
              ))}
            </ul>
          )}
          {fields.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-900">
                Extracted fields ({fields.length})
              </summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3">
                {fields.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-500">{FIELD_LABELS[k] ?? k}</dt>
                    <dd className="font-medium text-slate-900">{typeof v === "number" ? v.toLocaleString("en-IN") : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
      )}
    </li>
  );
}
