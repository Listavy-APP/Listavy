import type { SupabaseClient } from "@supabase/supabase-js";
import type { TemplateInput } from "@/lib/domain/pro-tools";
import { es } from "@/lib/i18n/es";

/** Pro tools data access (item 7a). Templates are owner-only rows (RLS). Summaries come from definer functions (0093). */

export type QuoteTemplate = { id: string; title: string; amount_dop: number; note: string | null };

export type MonthlyPoint = { month: string; amount: number };

export type EarningsSummary = {
  this_month: number;
  last_month: number;
  all_time: number;
  pending: number;
  monthly: MonthlyPoint[];
};

export type PerformanceSummary = {
  days: number;
  submitted: number;
  accepted: number;
  acceptance_rate: number | null;
  avg_response_hours: number | null;
  rating_average: number | null;
  review_count: number;
};

export type StatementLine = {
  id: string;
  released_on: string;
  trade: string;
  zone: string;
  gross: number;
  commission: number;
  tip: number;
  net: number;
};

export type AnnualStatement = {
  year: number;
  totals: { gross: number; commission: number; tips: number; net: number };
  pending: number;
  lines: StatementLine[];
};

function fail(message: string | undefined): void {
  if (message) throw new Error(message);
}

export async function listTemplates(supabase: SupabaseClient): Promise<QuoteTemplate[]> {
  const { data, error } = await supabase
    .from("pro_quote_templates")
    .select("id, title, amount_dop, note")
    .order("created_at", { ascending: true });
  if (error) throw new Error(es.proTemplates.loadFailed);
  return (data ?? []) as QuoteTemplate[];
}

export async function createTemplate(supabase: SupabaseClient, proId: string, input: TemplateInput): Promise<void> {
  const { error } = await supabase.from("pro_quote_templates").insert({
    pro_id: proId,
    title: input.title,
    amount_dop: input.amountDop,
    note: input.note,
  });
  fail(error?.message ? es.proTemplates.saveFailed : undefined);
}

export async function updateTemplate(supabase: SupabaseClient, id: string, input: TemplateInput): Promise<void> {
  const { error } = await supabase
    .from("pro_quote_templates")
    .update({ title: input.title, amount_dop: input.amountDop, note: input.note })
    .eq("id", id);
  fail(error?.message ? es.proTemplates.saveFailed : undefined);
}

export async function deleteTemplate(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("pro_quote_templates").delete().eq("id", id);
  fail(error?.message ? es.proTemplates.deleteFailed : undefined);
}

export async function getEarningsSummary(supabase: SupabaseClient): Promise<EarningsSummary | null> {
  const { data, error } = await supabase.rpc("pro_earnings_summary");
  if (error) return null;
  return data as EarningsSummary;
}

export async function getPerformanceSummary(supabase: SupabaseClient): Promise<PerformanceSummary | null> {
  const { data, error } = await supabase.rpc("pro_performance_summary");
  if (error) return null;
  return data as PerformanceSummary;
}

export async function getStatementYears(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase.rpc("pro_statement_years");
  if (error) return [];
  return (data ?? []) as number[];
}

export async function getAnnualStatement(supabase: SupabaseClient, year: number): Promise<AnnualStatement | null> {
  const { data, error } = await supabase.rpc("pro_annual_statement", { p_year: year });
  if (error) return null;
  return data as AnnualStatement;
}
