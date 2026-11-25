import type { ItemStatus } from "@/lib/case-state";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</section>;
}

export function CardHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {aside}
    </div>
  );
}

const STATUS_STYLE: Record<ItemStatus, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  issues: { label: "Needs re-upload", cls: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  rejected: { label: "Wrong file type", cls: "bg-red-50 text-red-700 ring-red-600/20" },
  unchecked: { label: "Awaiting review", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  missing: { label: "Missing", cls: "bg-slate-50 text-slate-500 ring-slate-400/20" },
};

export function StatusPill({ status }: { status: ItemStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function Tag({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "red" | "amber" | "emerald" | "indigo" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function timeAgo(iso: string, now = new Date()) {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatIntake(intake: string | null) {
  if (!intake) return "—";
  const d = new Date(`${intake}-01`);
  if (Number.isNaN(d.getTime())) return intake;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
