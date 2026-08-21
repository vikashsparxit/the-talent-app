import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

type AnnouncementType = 'info' | 'warning' | 'release' | 'maintenance';

interface Announcement {
  id: string;
  message: string;
  link_label: string | null;
  link_url: string | null;
  type: AnnouncementType;
}

const DISMISSED_KEY = 'sparx_dismissed_announcements';
const SLIDE_INTERVAL = 5000;

const typeConfig: Record<AnnouncementType, { bar: string; link: string }> = {
  info:        { bar: 'bg-blue-600 text-white',    link: 'underline hover:text-blue-100' },
  release:     { bar: 'bg-emerald-600 text-white', link: 'underline hover:text-emerald-100' },
  warning:     { bar: 'bg-amber-500 text-white',   link: 'underline hover:text-amber-100' },
  maintenance: { bar: 'bg-red-600 text-white',     link: 'underline hover:text-red-100' },
};

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'); } catch { return []; }
}

export function AnnouncementBar() {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissedState] = useState<string[]>([]);
  const paused = useRef(false);

  useEffect(() => { setDismissedState(getDismissed()); }, []);

  const { data: allActive = [] } = useQuery<Announcement[]>({
    queryKey: ['active-announcements'],
    queryFn: async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, message, link_label, link_url, type')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: true });
      return (data ?? []) as Announcement[];
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  const items = allActive.filter(a => !dismissed.includes(a.id));

  const advance = useCallback(() => {
    if (items.length <= 1) return;
    setVisible(false);
    setTimeout(() => {
      setIndex(i => (i + 1) % items.length);
      setVisible(true);
    }, 250);
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => { if (!paused.current) advance(); }, SLIDE_INTERVAL);
    return () => clearInterval(timer);
  }, [items.length, advance]);

  useEffect(() => {
    if (index >= items.length && items.length > 0) setIndex(items.length - 1);
  }, [items.length, index]);

  const safeIndex = items.length > 0 ? Math.min(index, items.length - 1) : 0;
  const current = items[safeIndex];

  if (!user || !current) return null;

  const cfg = typeConfig[current.type] ?? typeConfig.info;

  const handleDismiss = () => {
    const ids = [...dismissed, ...items.map(a => a.id)];
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
    setDismissedState(ids);
  };

  return (
    <div
      className={cn('w-full text-sm relative', cfg.bar)}
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      <div className={cn(
        'flex items-center justify-center gap-2 px-10 py-1.5 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      )}>
        <span className="text-center leading-snug">
          {current.message}
          {current.link_label && current.link_url && (
            <>
              {' '}
              <a
                href={current.link_url}
                target={current.link_url.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={cn('font-semibold', cfg.link)}
              >
                {current.link_label} →
              </a>
            </>
          )}
        </span>
        {items.length > 1 && (
          <span className="text-xs opacity-60 font-medium shrink-0">{index + 1} / {items.length}</span>
        )}
      </div>

      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
