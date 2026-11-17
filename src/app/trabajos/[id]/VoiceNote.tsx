import { es } from "@/lib/i18n/es";

/**
 * Plays the job's voice note. The signed URL is created on the server with the viewer's
 * session, so storage policy decides access. Rendered for job parties and for invited pros (0079).
 */
export function VoiceNote({ url }: { url: string | null }) {
  return (
    <section className="stack">
      <h2>{es.jobs.voiceTitle}</h2>
      {url ? (
        <audio controls preload="metadata" src={url} style={{ width: "100%" }} />
      ) : (
        <p className="muted">{es.jobs.voiceUnavailable}</p>
      )}
    </section>
  );
}
