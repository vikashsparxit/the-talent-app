import { forwardRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CalendarDays, Star, CheckCheck, Eye, AlertTriangle, Megaphone, Rocket, Wrench, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useNotifications, cleanMessage, type AppNotification } from '@/hooks/useNotifications';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// ── Notification type config ─────────────────────────────────────────────────

const NOTIF_CONFIG: Record<string, { icon: React.ElementType; bg: string; fg: string }> = {
  interview_scheduled: { icon: CalendarDays,  bg: 'bg-blue-100 dark:bg-blue-900/30',     fg: 'text-blue-600 dark:text-blue-400' },
  verdict_submitted:   { icon: Star,          bg: 'bg-green-100 dark:bg-green-900/30',   fg: 'text-green-600 dark:text-green-400' },
  chitra_nudge:        { icon: Eye,           bg: 'bg-violet-100 dark:bg-violet-900/30', fg: 'text-violet-600 dark:text-violet-400' },
  chitra_warning:      { icon: AlertTriangle, bg: 'bg-orange-100 dark:bg-orange-900/30', fg: 'text-orange-600 dark:text-orange-400' },
  chitra_praise:       { icon: Star,          bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-600 dark:text-emerald-400' },
};
const DEFAULT_NOTIF_CONFIG = { icon: Bell, bg: 'bg-muted', fg: 'text-muted-foreground' };

// ── Announcement type config ─────────────────────────────────────────────────

type AnnouncementType = 'info' | 'warning' | 'release' | 'maintenance';

interface Announcement {
  id: string;
  message: string;
  link_label: string | null;
  link_url: string | null;
  type: AnnouncementType;
  created_at: string;
}

const ANNOUNCE_CONFIG: Record<AnnouncementType, { icon: React.ElementType; bg: string; fg: string; badge: string; label: string }> = {
  info:        { icon: Megaphone,     bg: 'bg-blue-100 dark:bg-blue-900/30',     fg: 'text-blue-600 dark:text-blue-400',     badge: 'bg-blue-100 text-blue-700 border-blue-300',     label: 'Info' },
  release:     { icon: Rocket,        bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Release' },
  warning:     { icon: AlertTriangle, bg: 'bg-amber-100 dark:bg-amber-900/30',   fg: 'text-amber-600 dark:text-amber-400',   badge: 'bg-amber-100 text-amber-700 border-amber-300',   label: 'Warning' },
  maintenance: { icon: Wrench,        bg: 'bg-red-100 dark:bg-red-900/30',       fg: 'text-red-600 dark:text-red-400',       badge: 'bg-red-100 text-red-700 border-red-300',       label: 'Maintenance' },
};

// ── Shared panel content ─────────────────────────────────────────────────────

interface NotificationPanelProps {
  tab: 'notifications' | 'announcements';
  setTab: (tab: 'notifications' | 'announcements') => void;
  notifications: AppNotification[];
  announcements: Announcement[];
  unreadCount: number;
  markAllRead: () => void;
  onNotifClick: (id: string, link: string | null, is_read: boolean) => void;
  onActionClick: (notifId: string, link: string, is_read: boolean) => void;
  fullHeight?: boolean;
}

function NotificationTabBar({
  tab,
  setTab,
  unreadCount,
  announcementCount,
}: {
  tab: 'notifications' | 'announcements';
  setTab: (tab: 'notifications' | 'announcements') => void;
  unreadCount: number;
  announcementCount: number;
}) {
  return (
    <div className="flex border-b shrink-0">
      <button
        type="button"
        onClick={() => setTab('notifications')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors',
          tab === 'notifications'
            ? 'text-foreground border-b-2 border-primary -mb-px'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Notifications
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setTab('announcements')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors',
          tab === 'announcements'
            ? 'text-foreground border-b-2 border-primary -mb-px'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Announcements
        {announcementCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white leading-none">
            {announcementCount}
          </span>
        )}
      </button>
    </div>
  );
}

function NotificationPanelContent({
  tab,
  setTab,
  notifications,
  announcements,
  unreadCount,
  markAllRead,
  onNotifClick,
  onActionClick,
  fullHeight = false,
}: NotificationPanelProps) {
  const listClassName = fullHeight ? 'flex-1 min-h-0 overflow-y-auto' : undefined;
  const scrollClassName = fullHeight ? undefined : 'h-[400px]';

  return (
    <>
      <NotificationTabBar
        tab={tab}
        setTab={setTab}
        unreadCount={unreadCount}
        announcementCount={announcements.length}
      />

      {tab === 'notifications' && (
        <>
          {unreadCount > 0 && (
            <div className="flex justify-end px-4 py-2 border-b shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={markAllRead}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            </div>
          )}
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <div className="p-3 rounded-full bg-muted">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : fullHeight ? (
            <div className={listClassName}>
              <div className="divide-y pb-safe">
                {notifications.map(n => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onNotifClick={onNotifClick}
                    onActionClick={onActionClick}
                  />
                ))}
              </div>
            </div>
          ) : (
            <ScrollArea className={scrollClassName}>
              <div className="divide-y">
                {notifications.map(n => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onNotifClick={onNotifClick}
                    onActionClick={onActionClick}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </>
      )}

      {tab === 'announcements' && (
        <>
          {announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <div className="p-3 rounded-full bg-muted">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No active announcements</p>
            </div>
          ) : fullHeight ? (
            <div className={listClassName}>
              <div className="divide-y pb-safe">
                {announcements.map(a => (
                  <AnnouncementRow key={a.id} announcement={a} />
                ))}
              </div>
            </div>
          ) : (
            <ScrollArea className={scrollClassName}>
              <div className="divide-y">
                {announcements.map(a => (
                  <AnnouncementRow key={a.id} announcement={a} />
                ))}
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </>
  );
}

function NotificationRow({
  notification: n,
  onNotifClick,
  onActionClick,
}: {
  notification: AppNotification;
  onNotifClick: (id: string, link: string | null, is_read: boolean) => void;
  onActionClick: (notifId: string, link: string, is_read: boolean) => void;
}) {
  const cfg = NOTIF_CONFIG[n.type] ?? DEFAULT_NOTIF_CONFIG;
  const Icon = cfg.icon;
  const isChitra = n.source === 'chitra';

  return (
    <div
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        !n.is_read && (isChitra ? 'bg-violet-50/60 dark:bg-violet-950/20' : 'bg-blue-50/50 dark:bg-blue-950/20'),
        isChitra && 'border-l-2 border-violet-400',
      )}
    >
      <div className={cn('p-1.5 rounded-full shrink-0 mt-0.5', cfg.bg)}>
        <Icon className={cn('h-3.5 w-3.5', cfg.fg)} />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        {isChitra && (
          <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Chitra</span>
        )}
        <button type="button" onClick={() => onNotifClick(n.id, n.link, n.is_read)} className="w-full text-left">
          <p className="text-xs font-semibold text-foreground leading-tight">{n.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-snug mt-0.5">{cleanMessage(n.message)}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
          </p>
        </button>
        {n.action_buttons && n.action_buttons.length > 0 && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {n.action_buttons.map(btn => (
              <button
                key={btn.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onActionClick(n.id, btn.link, n.is_read);
                }}
                className="text-[11px] px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800/60 font-medium transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {!n.is_read && (
        <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', isChitra ? 'bg-violet-500' : 'bg-blue-500')} />
      )}
    </div>
  );
}

function AnnouncementRow({ announcement: a }: { announcement: Announcement }) {
  const cfg = ANNOUNCE_CONFIG[a.type] ?? ANNOUNCE_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className={cn('p-1.5 rounded-full shrink-0 mt-0.5', cfg.bg)}>
        <Icon className={cn('h-3.5 w-3.5', cfg.fg)} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cfg.badge)}>
            {cfg.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground/60">
            {a.created_at && !isNaN(new Date(a.created_at).getTime())
              ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true })
              : ''}
          </span>
        </div>
        <p className="text-xs text-foreground leading-snug">{a.message}</p>
        {a.link_label && a.link_url && (
          <a
            href={a.link_url}
            target={a.link_url.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <LinkIcon className="w-3 h-3" />
            {a.link_label}
          </a>
        )}
      </div>
    </div>
  );
}

const BellButton = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & { unreadCount: number }
>(({ unreadCount, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-muted border-2 border-primary/20 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors focus:outline-none',
      className,
    )}
    aria-label="Notifications"
    {...props}
  >
    <Bell className="h-5 w-5" />
    {unreadCount > 0 && (
      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    )}
  </button>
));
BellButton.displayName = 'BellButton';

// ── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const navigate = useNavigate();
  const isMobileHook = useIsMobile();
  const isMobile =
    isMobileHook ||
    (typeof window !== 'undefined' && window.innerWidth < 768);
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [tab, setTab] = useState<'notifications' | 'announcements'>('notifications');
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ['active-announcements'],
    queryFn: async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, message, link_label, link_url, type, created_at')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false });
      return (data ?? []) as Announcement[];
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  const closeMobile = () => setMobileOpen(false);

  const handleNotifClick = async (id: string, link: string | null, is_read: boolean) => {
    if (!is_read) await markRead(id);
    if (link) {
      if (isMobile) closeMobile();
      navigate(link);
    }
  };

  const handleActionClick = async (notifId: string, link: string, is_read: boolean) => {
    if (!is_read) await markRead(notifId);
    if (isMobile) closeMobile();
    navigate(link);
  };

  const panelProps: NotificationPanelProps = {
    tab,
    setTab,
    notifications,
    announcements,
    unreadCount,
    markAllRead,
    onNotifClick: handleNotifClick,
    onActionClick: handleActionClick,
  };

  if (isMobile) {
    return (
      <>
        <BellButton unreadCount={unreadCount} onClick={() => setMobileOpen(true)} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="right"
            className="flex h-full w-full max-w-none flex-col gap-0 p-0 inset-0 border-0"
          >
            <SheetHeader className="shrink-0 space-y-0 border-b px-4 py-3 pr-12 text-left">
              <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
            </SheetHeader>
            <NotificationPanelContent {...panelProps} fullHeight />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <BellButton unreadCount={unreadCount} />
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" className="z-[60] w-[380px] p-0 shadow-xl">
        <NotificationPanelContent {...panelProps} />
      </PopoverContent>
    </Popover>
  );
}
