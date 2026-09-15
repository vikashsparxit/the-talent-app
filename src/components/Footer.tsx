import { useState } from 'react';
import { Link } from 'react-router';
import { hasUnseenFeatures, markFeaturesAsSeen } from '@/lib/features';

export function Footer() {
  const [unseen, setUnseen] = useState(() => hasUnseenFeatures());

  function handleFeaturesClick() {
    markFeaturesAsSeen();
    setUnseen(false);
  }

  return (
    <footer className="hidden md:block border-t bg-background mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="text-center sm:text-left">
          © {new Date().getFullYear()} The Talent App. Built with love by{' '}
          <a
            href="https://www.sparxitsolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            SparxIT
          </a>
        </span>
        <div className="flex items-center gap-4">
          <Link
            to="/help"
            className="hover:text-foreground transition-colors"
          >
            Help & Guides
          </Link>
          <Link
            to="/features"
            onClick={handleFeaturesClick}
            className="relative flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Features Overview
            {unseen && (
              <span className="absolute -top-0.5 -right-2 w-2 h-2 rounded-full bg-red-500" />
            )}
          </Link>
        </div>
      </div>
    </footer>
  );
}
