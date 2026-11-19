// TEMPORARY: Sentry pipeline test. Removed in a follow-up commit before merge.
import { connection } from "next/server";

export async function GET() {
  await connection();
  throw new Error("Sentry scrub test: contact test.user@example.com or +1 809 555 0199");
}
