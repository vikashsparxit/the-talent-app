import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCanAccessMyInterviews } from '@/hooks/useMyInterviews';
import { useHasOpenOverlay } from '@/hooks/useHasOpenOverlay';
import { cn } from '@/lib/utils';
import {
  getBottomNavTabs,
  isBottomNavTabActive,
  isMoreMenuRoute,
} from '@/lib/navConfig';
import { MoreMenuSheet } from '@/components/MoreMenuSheet';
import { isPublicRoute } from '@/lib/publicRoutes';

export function BottomNav() {
  const location = useLocation();
  const { user, role, isStaff } = useAuth();
  const { canAccess: canAccessMyInterviews } = useCanAccessMyInterviews();
  const hasOverlay = useHasOpenOverlay();
  const [moreOpen, setMoreOpen] = useState(false);

  const visible = !!user && isStaff && !isPublicRoute(location.pathname);
  const tabs = getBottomNavTabs(role, canAccessMyInterviews);
  const moreActive = isMoreMenuRoute(location.pathname, role, canAccessMyInterviews, location.search);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!visible) {
      document.documentElement.removeAttribute('data-bottom-nav');
      return;
    }
    document.documentElement.setAttribute('data-bottom-nav', 'true');
    return () => document.documentElement.removeAttribute('data-bottom-nav');
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {!hasOverlay && (
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md md:hidden pb-safe"
      >
        <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
          {tabs.map(tab => {
            const active = isBottomNavTabActive(location.pathname, tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href} className="flex min-w-0 flex-1">
                <Link
                  to={tab.href}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-caption font-medium transition-[color,transform] duration-fast ease-out active:scale-[0.96]',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={cn('flex h-6 w-8 items-center justify-center rounded-full transition-colors duration-fast ease-out', active && 'bg-accent')}>
                    <Icon className="h-5 w-5 shrink-0" />
                  </span>
                  <span className="truncate leading-none">{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-caption font-medium transition-[color,transform] duration-fast ease-out active:scale-[0.96]',
                moreActive ? 'text-foreground' : 'text-muted-foreground',
              )}
              aria-label="More menu"
            >
              <span className={cn('flex h-6 w-8 items-center justify-center rounded-full transition-colors duration-fast ease-out', moreActive && 'bg-accent')}>
                <MoreHorizontal className="h-5 w-5 shrink-0" />
              </span>
              <span className="leading-none">More</span>
            </button>
          </li>
        </ul>
      </nav>
      )}

      <MoreMenuSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
