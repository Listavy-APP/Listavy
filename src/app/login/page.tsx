import { PhoneLoginForm } from "./PhoneLoginForm";
import { connection } from "next/server";
import { safeNext } from "@/lib/nav/safeNext";

// Reads ?next=, so the page renders per request (same pattern as other session pages).
export const instant = false;

export const metadata = { title: "Entrar" };

/** ?next=<path> returns the user there after sign-in (e.g. /pedir?pro=<ids>). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await connection();
  const { next } = await searchParams;
  return <PhoneLoginForm next={safeNext(next)} />;
}
