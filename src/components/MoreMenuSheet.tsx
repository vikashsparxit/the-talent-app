import { Link, useLocation } from 'react-router';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useAuth } from '@/hooks/useAuth';
import { useCanAccessMyInterviews } from '@/hooks/useMyInterviews';
import { cn } from '@/lib/utils';
import { getMoreMenuItems, isNavActive, type NavLinkItem } from '@/lib/navConfig';

interface MoreMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoreMenuSheet({ open, onOpenChange }: MoreMenuSheetProps) {
  const location = useLocation();
  const { role, signOut } = useAuth();
  const { canAccess: canAccessMyInterviews } = useCanAccessMyInterviews();
  const items = getMoreMenuItems(role, canAccessMyInterviews);

  const handleItemClick = (item: NavLinkItem) => {
    if (item.action === 'sign-out') {
      onOpenChange(false);
      void signOut();
      return;
    }
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b pb-4 text-left">
          <DrawerTitle>More</DrawerTitle>
        </DrawerHeader>
        <nav className="overflow-y-auto px-2 pb-safe">
          <ul className="space-y-1 py-2">
            {items.map(item => {
              const active = !item.action && isNavActive(location.pathname, item.href);
              const Icon = item.icon;

              if (item.action) {
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        item.action === 'sign-out'
                          ? 'text-destructive hover:bg-destructive/10'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </button>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
