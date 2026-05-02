import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN || "";

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event) {
    const exception = event.exception?.values?.[0];
    if (exception?.type === "AbortError") return null;
    return event;
  },
});

export function setSentryUser(
  user: { id: string; email?: string; role?: string } | null,
) {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email, segment: user.role });
  } else {
    Sentry.setUser(null);
  }
}
