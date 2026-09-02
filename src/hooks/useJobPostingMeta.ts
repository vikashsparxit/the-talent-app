import { useEffect } from 'react';
import { jobPostingJsonLdScript, type JobPostingInput } from '@/lib/jobPostingJsonLd';

const JSON_LD_ID = 'job-posting-jsonld';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Unique title / OG tags + JobPosting JSON-LD on `/careers/:id`.
 * Googlebot that does not execute JS still sees the SPA shell — see ROADMAP Slice A2 leftover.
 */
export function useJobPostingMeta(input: JobPostingInput | null): void {
  const key = input
    ? [input.id, input.title, input.description, input.location, input.jobType, input.datePosted, input.validThrough, input.companyName, input.jobUrl].join('|')
    : '';

  useEffect(() => {
    if (!input) return;

    const previousTitle = document.title;
    const description = (input.description ?? input.title).replace(/\s+/g, ' ').trim().slice(0, 200);
    document.title = `${input.title} | Careers | The Talent App`;
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:title', input.title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', input.jobUrl);
    upsertMeta('property', 'og:type', 'website');

    let script = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = JSON_LD_ID;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = jobPostingJsonLdScript(input);

    return () => {
      document.title = previousTitle;
      script?.remove();
    };
    // key captures all fields used to build markup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
