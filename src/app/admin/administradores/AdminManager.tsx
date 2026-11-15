"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AdminRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  admin_role: "admin" | "super_admin" | null;
  created_at: string;
  totp_verified: boolean;
};

const dateFmt = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "America/Santo_Domingo" });

/** Super-admin tools: add, promote, demote, delete admins. Every action goes through a guarded RPC. */
export function AdminManager({ currentUserId, admins }: { currentUserId: string; admins: AdminRow[] }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  async function run(label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(label);
    setConfirmFor(null);
    setTyped("");
    router.refresh();
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("admin_find_profile_by_phone", { p_phone: phone });
    if (error) return setMessage(error.message);
    const found = data?.[0];
    if (!found) return setMessage("No hay ninguna cuenta con ese teléfono.");
    if (found.role !== "homeowner") return setMessage("Esa cuenta no es de cliente y no puede convertirse en administrador.");
    await run("Administrador agregado.", () => supabase.rpc("admin_grant_admin", { p_profile: found.id }));
    setPhone("");
  }

  const supers = admins.filter((a) => a.admin_role === "super_admin").length;

  return (
    <div className="stack">
      <form className="stack" onSubmit={onAdd}>
        <label className="field">
          <span>Agregar administrador por teléfono</span>
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <button className="button" type="submit" disabled={busy || !phone.trim()}>Agregar</button>
      </form>

      {message ? <p role="status">{message}</p> : null}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Rol</th>
            <th>2FA</th>
            <th>Creado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => {
            const isSelf = a.id === currentUserId;
            const isLastSuper = a.admin_role === "super_admin" && supers <= 1;
            return (
              <tr key={a.id}>
                <td>{a.full_name ?? "—"}{isSelf ? " (tú)" : ""}</td>
                <td>{a.phone ?? "—"}</td>
                <td>{a.admin_role === "super_admin" ? "Super administrador" : "Administrador"}</td>
                <td>{a.totp_verified ? "Activo" : "Pendiente"}</td>
                <td>{dateFmt.format(new Date(a.created_at))}</td>
                <td className="stack">
                  {a.admin_role === "admin" ? (
                    confirmFor === `up:${a.id}` ? (
                      <>
                        <label className="field">
                          <span>Escribe CONFIRMAR</span>
                          <input value={typed} onChange={(e) => setTyped(e.target.value)} />
                        </label>
                        <button className="button" type="button" disabled={busy || typed !== "CONFIRMAR" || !a.totp_verified}
                          onClick={() => run("Promovido a super administrador.", () => createSupabaseBrowserClient().rpc("admin_set_level", { p_profile: a.id, p_level: "super_admin", p_confirm: typed }))}>
                          Confirmar ascenso
                        </button>
                      </>
                    ) : (
                      <button className="button secondary" type="button" disabled={busy} onClick={() => { setConfirmFor(`up:${a.id}`); setTyped(""); }}>
                        Hacer super administrador
                      </button>
                    )
                  ) : !isSelf && !isLastSuper ? (
                    <button className="button secondary" type="button" disabled={busy}
                      onClick={() => run("Rol cambiado a administrador.", () => createSupabaseBrowserClient().rpc("admin_set_level", { p_profile: a.id, p_level: "admin", p_confirm: "" }))}>
                      Quitar super administrador
                    </button>
                  ) : null}

                  {!isSelf ? (
                    confirmFor === `del:${a.id}` ? (
                      <>
                        <p className="muted">¿Quitar el acceso de administrador a esta cuenta? Quedará como cliente.</p>
                        <button className="button" type="button" disabled={busy}
                          onClick={() => run("Administrador eliminado.", () => createSupabaseBrowserClient().rpc("admin_revoke_admin", { p_profile: a.id }))}>
                          Sí, eliminar acceso
                        </button>
                        <button className="button secondary" type="button" onClick={() => setConfirmFor(null)}>Cancelar</button>
                      </>
                    ) : (
                      <button className="button secondary" type="button" disabled={busy || isLastSuper} onClick={() => setConfirmFor(`del:${a.id}`)}>
                        Eliminar acceso
                      </button>
                    )
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
