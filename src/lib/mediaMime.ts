// Recorder formats for assessment media. Order matters: WebM where the browser
// can record it (Chrome, Edge, Firefox, Android), MP4 for Safari and iOS.
export const RECORDER_MIME_FALLBACKS = {
  video: ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'],
  audio: ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'],
} as const;

export type RecorderKind = keyof typeof RECORDER_MIME_FALLBACKS;

/** First supported recorder type for this browser, or null when none is. */
export function pickRecorderMime(
  kind: RecorderKind,
  isTypeSupported: ((mime: string) => boolean) | undefined = globalThis.MediaRecorder?.isTypeSupported?.bind(
    globalThis.MediaRecorder,
  ),
): string | null {
  if (!isTypeSupported) return null;
  return RECORDER_MIME_FALLBACKS[kind].find((m) => isTypeSupported(m)) ?? null;
}

/** The type without codec parameters, as uploads must send it in Content-Type. */
export function baseMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

export function extensionForMime(mime: string): string {
  switch (baseMime(mime)) {
    case 'video/webm':
    case 'audio/webm':
      return 'webm';
    case 'video/mp4':
      return 'mp4';
    case 'audio/mp4':
      return 'm4a';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'bin';
  }
}
