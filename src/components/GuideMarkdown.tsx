import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

interface GuideMarkdownProps {
  content: string;
  className?: string;
}

export function GuideMarkdown({ content, className }: GuideMarkdownProps) {
  return (
    <article
      className={cn(
        'prose prose-sm sm:prose-base max-w-none dark:prose-invert',
        'prose-headings:font-display prose-a:text-primary prose-code:text-foreground',
        'prose-pre:bg-muted prose-pre:text-foreground prose-table:text-sm',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('/')) {
              return <Link to={href}>{children}</Link>;
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
