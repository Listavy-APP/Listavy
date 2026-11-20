import { permanentRedirect } from "next/navigation";

// /avisos moved into /notificaciones. Old pushes and emails may still link here, so the URL stays and redirects.
export default function AvisosRedirectPage() {
  permanentRedirect("/notificaciones");
}
