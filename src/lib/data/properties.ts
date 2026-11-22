import type { SupabaseClient } from "@supabase/supabase-js";

/** B2B properties (0119). Owner-only rows. Archive, never delete: jobs keep their property. */

export type Property = {
  id: string;
  name: string;
  municipality_id: string;
  address_detail: string | null;
  access_notes: string | null;
  business_name: string | null;
  archived_at: string | null;
};

export type PropertyInput = Omit<Property, "id" | "archived_at">;

const COLUMNS = "id, name, municipality_id, address_detail, access_notes, business_name, archived_at";

export async function listMyProperties(supabase: SupabaseClient, opts: { includeArchived?: boolean } = {}): Promise<Property[]> {
  let q = supabase.from("properties").select(COLUMNS).order("created_at", { ascending: true });
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Property[];
}

export async function saveProperty(supabase: SupabaseClient, ownerId: string, id: string | null, input: PropertyInput): Promise<void> {
  if (id) {
    const { error } = await supabase.from("properties").update(input).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from("properties").insert({ ...input, owner_id: ownerId });
  if (error) throw new Error(error.message);
}

export async function archiveProperty(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("properties").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export type StatementGroup = { property_id: string | null; name: string | null; job_count: number; paid_dop: number };
export type ClientStatement = {
  year: number;
  month: number;
  groups: StatementGroup[];
  total_jobs: number;
  total_paid_dop: number;
};

/** Monthly resumen for the caller (0119). Not a comprobante fiscal. */
export async function getClientStatement(supabase: SupabaseClient, year: number, month: number): Promise<ClientStatement> {
  const { data, error } = await supabase.rpc("client_monthly_statement", { p_year: year, p_month: month });
  if (error) throw new Error(error.message);
  return data as ClientStatement;
}

export type PropertyJobView = {
  property_id: string;
  property_name: string;
  municipality_name: string;
  address_detail: string | null;
  business_name: string | null;
  access_notes: string | null;
};

/** Property shown on a job: the owner always sees notes; a booked pro sees them only once paid (0119). */
export async function getJobProperty(supabase: SupabaseClient, jobId: string): Promise<PropertyJobView | null> {
  const { data, error } = await supabase.rpc("job_property_view", { p_job: jobId });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PropertyJobView[];
  return rows[0] ?? null;
}
