import Link from "next/link";
import { Suspense } from "react";
import { Card, CardHeader, Tag, formatIntake, timeAgo } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { STAGES } from "@/lib/case-state";
import { listCases } from "@/lib/data";

export default function DashboardPage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading dashboard…</p>}>
      <Dashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const counsellor = typeof sp.counsellor === "string" ? sp.counsellor : null;
  const all = await listCases();
  const counsellors = [...new Set(all.map((c) => c.counsellor).filter(Boolean))] as string[];
  const cases = counsellor ? all.filter((c) => c.counsellor === counsellor) : all;

  const active = cases.filter((c) => c.state.stage < 8);
  const atRisk = active.filter((c) => c.state.atRisk.length > 0);
  const reupload = active.reduce(
    (n, c) => n + c.state.checklist.filter((e) => e.status === "issues" || e.status === "rejected").length,
    0,
  );
  const review = active.reduce((n, c) => n + c.state.checklist.filter((e) => e.status === "unchecked").length, 0);
  const crossFlags = active.reduce(
    (n, c) => n + c.state.flags.filter((f) => f.severity === "critical").length,
    0,
  );
  const stageCounts = STAGES.map((_, i) => cases.filter((c) => c.state.stage === i).length);
  const maxCount = Math.max(1, ...stageCounts);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {counsellor ? `${counsellor}'s cases` : "All cases"}
          </h1>
          <p className="text-sm text-slate-500">Every status below is derived from documents and events — no one updates it by hand.</p>
        </div>
        <div className="flex flex-wrap gap-1 text-sm">
          <FilterLink href="/" active={!counsellor}>Everyone</FilterLink>
          {counsellors.map((name) => (
            <FilterLink key={name} href={`/?counsellor=${encodeURIComponent(name)}`} active={counsellor === name}>
              {name}
            </FilterLink>
          ))}
        </div>
      </div>

      {!aiEnabled() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          AI checking is off. Set <code className="font-mono">ANTHROPIC_API_KEY</code> in <code className="font-mono">.env.local</code> and restart to check uploads automatically. Demo cases still show seeded results.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Active cases" value={active.length} />
        <Kpi label="At risk" value={atRisk.length} tone={atRisk.length ? "red" : undefined} />
        <Kpi label="Cross-document conflicts" value={crossFlags} tone={crossFlags ? "red" : undefined} />
        <Kpi label="Docs needing re-upload" value={reupload} tone={reupload ? "amber" : undefined} />
        <Kpi label="Awaiting staff review" value={review} />
      </div>

      <Card>
        <CardHeader title="Pipeline" />
        <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-5 lg:grid-cols-9">
          {STAGES.map((s, i) => (
            <div key={s} className="flex flex-col gap-2">
              <div className="flex h-20 items-end rounded-md bg-slate-50">
                <div
                  className="w-full rounded-md bg-indigo-500"
                  style={{ height: `${(stageCounts[i] / maxCount) * 100}%`, minHeight: stageCounts[i] ? 6 : 0 }}
                />
              </div>
              <div className="text-lg font-semibold leading-none text-slate-900">{stageCounts[i]}</div>
              <div className="text-xs leading-tight text-slate-500">{s}</div>
            </div>
          ))}
        </div>
      </Card>

      {atRisk.length > 0 && (
        <Card>
          <CardHeader title={`At risk (${atRisk.length})`} />
          <ul className="divide-y divide-slate-100">
            {atRisk.map((c) => (
              <li key={c.id}>
                <Link href={`/cases/${c.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                  <div className="w-48 shrink-0">
                    <div className="font-medium text-slate-900">{c.student_name}</div>
                    <div className="text-xs text-slate-500">{c.counsellor ?? "Unassigned"} · {c.state.stageLabel}</div>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1">
                    {c.state.atRisk.map((r) => (
                      <Tag key={r} tone="red">{r}</Tag>
                    ))}
                  </div>
                  <div className="text-sm text-slate-600 sm:max-w-sm sm:text-right">{c.state.nextAction}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title={`Cases (${cases.length})`} />
        {cases.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No cases yet. <Link href="/cases/new" className="font-medium text-indigo-600">Open the first one</Link>, or run{" "}
            <code className="font-mono">npm run seed</code> for demo data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Intake</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Documents</th>
                  <th className="px-4 py-2 font-medium">Next action</th>
                  <th className="px-4 py-2 font-medium">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => {
                  const req = c.state.checklist.filter((e) => !e.optional);
                  const ok = req.filter((e) => e.status === "verified").length;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/cases/${c.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                          {c.student_name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {c.institution ?? "—"} · {c.counsellor ?? "Unassigned"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatIntake(c.intake)}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">{c.state.stageLabel}</div>
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${(c.state.stage / 8) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {ok}/{req.length} verified
                        {c.state.flags.some((f) => f.severity === "critical") && (
                          <span className="ml-2"><Tag tone="red">conflict</Tag></span>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">{c.state.nextAction}</td>
                      <td className="px-4 py-3 text-slate-500">{timeAgo(c.state.lastActivity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" }) {
  const color = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-900";
  return (
    <Card className="px-4 py-3">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </Link>
  );
}
