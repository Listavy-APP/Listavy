import * as Sentry from "@sentry/nextjs";
import { buildSentryOptions } from "@/lib/observability/sentry-options";

// Browser error reporting. Replay and tracing are off (see sentry-options.ts).
Sentry.init(buildSentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
