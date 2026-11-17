import { Fragment, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { parseConsentBlocks, type ConsentInline } from '@/lib/mediaConsent';

function Inline({ parts }: { parts: ConsentInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.text}
          </strong>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Consent text with its light structure ('## ' and **bold** headings, '- '
 * bullets, blank-line paragraphs) as React elements. Text is never parsed as
 * HTML.
 */
export function ConsentText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseConsentBlocks(text), [text]);
  return (
    <div className={cn('space-y-3 text-sm text-muted-foreground', className)} data-testid="consent-text">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return b.level === 2 ? (
            <h3 key={i} className="text-base font-semibold text-foreground">
              {b.text}
            </h3>
          ) : (
            <h4 key={i} className="pt-1 font-semibold text-foreground">
              {b.text}
            </h4>
          );
        }
        if (b.type === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline parts={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline parts={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
