import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusPill } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import type { ChecklistEntry } from "@/lib/case-state";
import { getCaseByToken } from "@/lib/data";

// Documents that come from the university, not the student.
const UNIVERSITY_ISSUED = new Set(["offer_letter", "coe"]);

export default function StudentUploadPage(props: PageProps<"/u/[token]">) {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <StudentView params={props.params} />
      </Suspense>
    </div>
  );
}

async function StudentView({ params }: { params: PageProps<"/u/[token]">["params"] }) {
  const { token } = await params;
  const data = await getCaseByToken(token);
  if (!data) notFound();
  const { case: c, state } = data;

  const items = state.checklist.filter((e) => !UNIVERSITY_ISSUED.has(e.type));
  const neededNow = new Set(state.missingNow.map((m) => m.type));
  const todo = items.filter((e) => neededNow.has(e.type));
  const rest = items.filter((e) => !neededNow.has(e.type));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-indigo-600">Document upload</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Hi {c.student_name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload your documents for {c.course ?? "your course"}
          {c.institution ? ` at ${c.institution}` : ""}. Each file is checked as soon as you upload it, so you&apos;ll know
          right away if something needs fixing.
        </p>
        <div className="mt-3 rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
          <span className="text-slate-500">Your application is at: </span>
          <span className="font-medium text-slate-900">{state.stageLabel}</span>
        </div>
      </div>

      {todo.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Needed now ({todo.length})</h2>
          {todo.map((e) => (
            <StudentItem key={e.type} entry={e} token={token} />
          ))}
        </section>
      ) : (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ Nothing pending right now. We&apos;ll message you when the next step needs something from you.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">All documents</h2>
        {rest.map((e) => (
          <StudentItem key={e.type} entry={e} token={token} />
        ))}
      </section>

      <p className="text-center text-xs text-slate-400">PDF, JPG or PNG. Scan in colour, with all four corners visible.</p>
    </div>
  );
}

function StudentItem({ entry: e, token }: { entry: ChecklistEntry; token: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">
            {e.label} {e.optional && <span className="font-normal text-slate-400">(if applicable)</span>}
          </div>
          <div className="text-xs text-slate-500">{e.hint}</div>
        </div>
        <StatusPill status={e.status} />
      </div>
      {e.check && e.check.issues.length > 0 && e.status !== "verified" && (
        <ul className="mt-2 space-y-0.5 text-sm text-amber-800">
          {e.check.issues.map((i) => (
            <li key={i}>✗ {i}</li>
          ))}
        </ul>
      )}
      {e.status !== "verified" && (
        <div className="mt-3">
          <UploadForm docType={e.type} token={token} label={e.doc ? "Upload again" : "Upload"} />
        </div>
      )}
    </div>
  );
}
