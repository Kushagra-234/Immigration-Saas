import { Card, CardHeader } from "@/components/ui";
import { createCase } from "@/lib/actions";

export default function NewCasePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader title="Open a new case — Australia (subclass 500)" />
        <form action={createCase} className="grid gap-4 p-4 sm:grid-cols-2">
          <Field name="student_name" label="Student name (as on passport)" required className="sm:col-span-2" />
          <Field name="phone" label="WhatsApp number" placeholder="98765 43210" />
          <Field name="email" label="Email" type="email" />
          <Field name="institution" label="University" placeholder="Monash University" />
          <Field name="course" label="Course" placeholder="Master of Data Science" />
          <Field name="intake" label="Intake" type="month" />
          <Field name="counsellor" label="Counsellor" placeholder="Priya" />
          <div className="flex justify-end sm:col-span-2">
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              Create case
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  className = "",
  ...rest
}: { name: string; label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <input
        name={name}
        className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        {...rest}
      />
    </label>
  );
}
