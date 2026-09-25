import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["kpi", "title-lg", "title", "body", "body-lg", "label", "caption"] }],
      shadow: [{ shadow: ["border", "border-hover", "popover", "overlay", "elev-1", "elev-2"] }],
      rounded: [{ rounded: ["xs", "card", "control"] }],
      duration: [{ duration: ["instant", "fast", "base", "slow", "tooltip", "chart"] }],
      ease: [{ ease: ["drawer", "icon"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DANGEROUS_URL_SCHEME = /^(javascript|data|vbscript):/i;

/**
 * Returns a navigable http(s) URL, or null if the value is missing / unsafe.
 * Bare hosts (example.com) are normalized to https://. javascript:/data:/vbscript: rejected.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  let trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("//") || DANGEROUS_URL_SCHEME.test(trimmed)) return null;

  if (!/^[a-zA-Z][a-zA-Z+.-]*:/.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** http(s) URLs via safeExternalUrl, or same-origin relative paths starting with a single `/`. */
export function safeHref(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    if (DANGEROUS_URL_SCHEME.test(trimmed.slice(1))) return null;
    return trimmed;
  }
  return safeExternalUrl(trimmed);
}
