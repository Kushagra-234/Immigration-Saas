"use client";

import { useState } from "react";

// Builds absolute links on the client so the server never needs to know
// which host the app is served from.

export function CopyUploadLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{path}</code>
      <button
        type="button"
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        onClick={async () => {
          await navigator.clipboard.writeText(window.location.origin + path);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function WhatsAppReminder({
  phone,
  studentName,
  missing,
  path,
}: {
  phone: string | null;
  studentName: string;
  missing: string[];
  path: string;
}) {
  const disabled = missing.length === 0;
  return (
    <button
      type="button"
      disabled={disabled}
      className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      onClick={() => {
        const first = studentName.split(" ")[0];
        const text =
          `Hi ${first}, to keep your application moving we still need:\n` +
          missing.map((m) => `• ${m}`).join("\n") +
          `\n\nPlease upload them here (it checks each file instantly): ${window.location.origin}${path}`;
        const digits = (phone ?? "").replace(/\D/g, "");
        const to = digits.length === 10 ? `91${digits}` : digits;
        window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank");
      }}
    >
      {disabled ? "Nothing pending from student" : `Send WhatsApp reminder (${missing.length})`}
    </button>
  );
}
