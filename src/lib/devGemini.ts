/**
 * In local dev, when the remote Edge Function has no GEMINI_API_KEY set,
 * the client can send it via body.dev_gemini_key (only accepted from dev origins).
 * Set VITE_GEMINI_API_KEY in .env.dev (or .env.dev.local) to enable.
 * Key is sent when: (Vite dev mode OR host is localhost) AND VITE_GEMINI_API_KEY is set.
 */
function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export function getDevGeminiKeyBody(): Record<string, string> {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key || typeof key !== 'string') return {};
  const devMode = import.meta.env.DEV === true;
  if (devMode || isLocalHost()) return { dev_gemini_key: key };
  return {};
}
