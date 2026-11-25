import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DOC_LABEL, DOC_TYPES, type DocType } from "./checklist";

export const SUPPORTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type SupportedMime = (typeof SUPPORTED_MIME)[number];

export function isSupportedMime(m: string): m is SupportedMime {
  return (SUPPORTED_MIME as readonly string[]).includes(m);
}

const DocCheckSchema = z.object({
  detected_type: z.enum([...DOC_TYPES, "other"]),
  matches_expected: z
    .boolean()
    .describe("True if the document is the type the student was asked for."),
  legible: z
    .boolean()
    .describe("False if blurry, cropped, too dark, or text can't be read reliably."),
  complete: z
    .boolean()
    .describe("False if required pages/sides appear to be missing (e.g. passport back page)."),
  signature_or_stamp_present: z
    .boolean()
    .nullable()
    .describe("Whether a required signature/bank stamp is visible. null if not applicable."),
  fields: z.object({
    full_name: z.string().nullable().describe("Student's full name exactly as printed (for bank/ITR: the account holder/assessee)."),
    date_of_birth: z.string().nullable().describe("YYYY-MM-DD"),
    passport_number: z.string().nullable(),
    passport_expiry: z.string().nullable().describe("YYYY-MM-DD"),
    institution: z.string().nullable(),
    course: z.string().nullable(),
    course_start: z.string().nullable().describe("YYYY-MM-DD"),
    course_end: z.string().nullable().describe("YYYY-MM-DD"),
    test_type: z.string().nullable().describe("IELTS, PTE, TOEFL, etc."),
    overall_score: z.string().nullable(),
    test_date: z.string().nullable().describe("YYYY-MM-DD"),
    balance_amount: z.number().nullable().describe("Closing balance as a plain number."),
    currency: z.string().nullable(),
    statement_end_date: z.string().nullable().describe("YYYY-MM-DD; last date covered by statement."),
    annual_income: z.number().nullable().describe("Gross total income for the latest year, plain number."),
    assessment_year: z.string().nullable(),
    amount_paid: z.number().nullable(),
  }),
  issues: z
    .array(z.string())
    .describe("Short, student-facing problems to fix, e.g. 'Back page of passport missing'. Empty if none."),
  summary: z.string().describe("One sentence describing the document."),
});

export type DocCheck = z.infer<typeof DocCheckSchema>;

const SYSTEM = `You are a document checker at an Indian study-abroad consultancy preparing Australian student visa (subclass 500) files.

You receive one uploaded document and the type the student was asked to upload. Read it carefully and:
- Identify what the document actually is.
- Judge whether it is usable as submitted: legible, not cropped, all required pages/sides present, signed or stamped where that is normally required (bank statements need a bank stamp or e-statement header; ITR needs the acknowledgement).
- Extract the fields listed in the schema. Copy names and numbers exactly as printed; convert dates to YYYY-MM-DD. Use null for anything not present on this document — never guess.
- List concrete problems the student must fix, written so a student can act on them. Do not list problems that are just missing fields irrelevant to this document type.

Indian documents often show names in SURNAME GIVEN-NAME order or split across "Surname" and "Given name" fields — combine them as GIVEN-NAME SURNAME in full_name.`;

let client: Anthropic | null = null;

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function checkDocument(
  expected: DocType,
  bytes: Buffer,
  mime: SupportedMime,
): Promise<DocCheck> {
  client ??= new Anthropic();
  const data = bytes.toString("base64");

  const fileBlock: Anthropic.Beta.BetaContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mime, data } }
      : { type: "image", source: { type: "base64", media_type: mime, data } };

  const response = await client.beta.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(DocCheckSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          {
            type: "text",
            text: `The student was asked to upload: ${DOC_LABEL[expected]} (type "${expected}"). Check this document.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI checker declined to process this document.");
  }
  if (!response.parsed_output) {
    throw new Error(`AI check returned no result (stop_reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}
