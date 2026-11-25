import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { db, UPLOAD_DIR, type DocumentRow } from "@/lib/db";

// Staff-only in intent; see the auth note in lib/actions.ts.
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
  if (!doc?.stored_name) return new Response("Not found", { status: 404 });
  const file = path.join(UPLOAD_DIR, path.basename(doc.stored_name));
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.filename)}"`,
    },
  });
}
