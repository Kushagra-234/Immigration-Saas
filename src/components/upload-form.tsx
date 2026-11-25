"use client";

import { useActionState, useRef } from "react";
import { uploadDocument, type UploadResult } from "@/lib/actions";

export function UploadForm({
  docType,
  token,
  caseId,
  label = "Upload",
  compact = false,
}: {
  docType: string;
  token?: string;
  caseId?: string;
  label?: string;
  compact?: boolean;
}) {
  const [result, action, pending] = useActionState<UploadResult | null, FormData>(uploadDocument, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-2">
      <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="doc_type" value={docType} />
        {token && <input type="hidden" name="token" value={token} />}
        {caseId && <input type="hidden" name="case_id" value={caseId} />}
        <label
          className={`relative inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 ${
            compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
          } ${pending ? "pointer-events-none opacity-60" : ""}`}
        >
          {pending ? "Checking…" : label}
          <input
            type="file"
            name="file"
            accept="application/pdf,image/*"
            className="sr-only"
            disabled={pending}
            onChange={() => formRef.current?.requestSubmit()}
          />
        </label>
        {pending && (
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            AI is reading the document…
          </span>
        )}
      </form>
      {result && !pending && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            result.status === "verified"
              ? "bg-emerald-50 text-emerald-800"
              : result.ok
                ? "bg-amber-50 text-amber-900"
                : "bg-red-50 text-red-800"
          }`}
        >
          <p className="font-medium">
            {result.status === "verified" ? "✓ " : result.ok ? "" : "✗ "}
            {result.message}
          </p>
          {result.issues && result.issues.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
