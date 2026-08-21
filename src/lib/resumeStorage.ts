import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function extractResumeStoragePath(resumeUrl: string): string {
  if (!resumeUrl) return '';
  if (!resumeUrl.startsWith('http')) {
    return resumeUrl.replace(/^resumes\//, '').replace(/^\//, '');
  }
  try {
    const u = new URL(resumeUrl);
    const marker = '/resumes/';
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(u.pathname.slice(idx + marker.length));
    }
  } catch {
    // ignore malformed URLs
  }
  return resumeUrl.replace(/^resumes\//, '').replace(/^\//, '');
}

/** Edge functions on self-hosted Supabase may sign with an internal host; rewrite to the public API URL the browser uses. */
function normalizeSignedUrlForBrowser(url: string): string {
  const publicBase = import.meta.env.VITE_SUPABASE_URL;
  if (!publicBase?.startsWith('http')) return url;

  try {
    const signed = new URL(url);
    const pub = new URL(publicBase);
    if (signed.origin === pub.origin) return url;
    signed.protocol = pub.protocol;
    signed.host = pub.host;
    return signed.toString();
  } catch {
    return url;
  }
}

export async function getResumeSignedUrl(
  resumeUrl: string | null | undefined,
): Promise<string | null> {
  if (!resumeUrl) return null;

  const path = extractResumeStoragePath(resumeUrl);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(path, 3600);

  if (!error && data?.signedUrl) return data.signedUrl;

  const { data: fnData, error: fnError } = await supabase.functions.invoke(
    'get-resume-signed-url',
    { body: { resume_url: resumeUrl } },
  );

  if (!fnError && fnData?.signedUrl) {
    return normalizeSignedUrlForBrowser(fnData.signedUrl as string);
  }

  return null;
}

export async function openResumeUrl(resumeUrl: string | null | undefined): Promise<void> {
  const url = await getResumeSignedUrl(resumeUrl);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  toast.error('Could not open resume', {
    description: 'You may not have permission to view this file, or it may be missing.',
  });
}
