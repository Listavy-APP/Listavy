import type { SupabaseClient } from "@supabase/supabase-js";
import type { FixedServiceRow, PublicFixedService } from "@/lib/domain/fixed-service";
import type { ScheduleWindow } from "@/lib/domain/schedule";

/**
 * Data access for fixed-price services (0116). UI code calls these, never raw queries.
 * Writes go only through the definers below.
 */

const SERVICE_COLUMNS = "id, trade, slug, name_es, includes_es, price_dop, active, sort_order";

/** A pro's public fixed services (active, opted in, approved, not demo). Empty for hidden pros. */
export async function listProFixedServices(supabase: SupabaseClient, proId: string): Promise<PublicFixedService[]> {
  const { data, error } = await supabase.rpc("list_pro_fixed_services", { p_pro: proId });
  if (error) throw new Error(`No se pudieron cargar los servicios a precio fijo: ${error.message}`);
  return (data ?? []) as PublicFixedService[];
}

/** Active catalog services for one trade. Public read (RLS). */
export async function listTradeFixedServices(supabase: SupabaseClient, trade: string): Promise<FixedServiceRow[]> {
  const { data, error } = await supabase
    .from("fixed_services")
    .select(SERVICE_COLUMNS)
    .eq("trade", trade)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
  return (data ?? []) as FixedServiceRow[];
}

/** The signed-in pro's opt-in service ids (owner read, RLS). */
export async function listMyFixedOptIns(supabase: SupabaseClient): Promise<string[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("pro_fixed_services")
    .select("fixed_service_id")
    .eq("pro_id", userData.user.id);
  if (error) throw new Error(`No se pudieron cargar tus servicios: ${error.message}`);
  return ((data ?? []) as { fixed_service_id: string }[]).map((r) => r.fixed_service_id);
}

/** Replaces the pro's opt-in set. The database checks trade and active status. */
export async function setMyFixedServices(supabase: SupabaseClient, serviceIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("pro_set_fixed_services", { p_service_ids: serviceIds });
  if (error) throw error;
}

/** Books a fixed service with one pro. Returns the job id. The client pays on the job page. */
export async function createFixedBooking(
  supabase: SupabaseClient,
  input: {
    serviceId: string;
    proId: string;
    zone: string;
    description: string | null;
    municipalityId: string;
    scheduledDate: string | null;
    scheduledWindow: ScheduleWindow | null;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("create_fixed_booking", {
    p_service_id: input.serviceId,
    p_pro_id: input.proId,
    p_zone: input.zone,
    p_description: input.description,
    p_scheduled_date: input.scheduledDate,
    p_scheduled_window: input.scheduledWindow,
    p_municipality_id: input.municipalityId,
  });
  if (error) throw error;
  return data as string;
}

/** Every catalog service, including inactive ones (admins read them through RLS). */
export async function listAllFixedServices(supabase: SupabaseClient): Promise<FixedServiceRow[]> {
  const { data, error } = await supabase
    .from("fixed_services")
    .select(SERVICE_COLUMNS)
    .order("trade", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
  return (data ?? []) as FixedServiceRow[];
}

/** Super-admin create (no id) or edit (with id). Price, scope, status and reason go to admin_log. */
export async function adminUpsertFixedService(
  supabase: SupabaseClient,
  input: {
    id: string | null;
    trade: string;
    slug: string;
    nameEs: string;
    includesEs: string;
    priceDop: number;
    active: boolean;
    sortOrder: number;
    reason: string;
  },
): Promise<void> {
  const { error } = await supabase.rpc("admin_upsert_fixed_service", {
    p_id: input.id,
    p_trade: input.trade,
    p_slug: input.slug,
    p_name_es: input.nameEs,
    p_includes_es: input.includesEs,
    p_price_dop: input.priceDop,
    p_active: input.active,
    p_sort_order: input.sortOrder,
    p_reason: input.reason,
  });
  if (error) throw error;
}
