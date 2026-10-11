import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search, UserPlus, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserProfile } from '@/hooks/useUserProfile';
import { CompanyLogo } from '@/components/CompanyLogo';
import { useAuth } from '@/hooks/useAuth';
import { NotificationBell } from '@/components/NotificationBell';
import { useOpenGlobalSearch } from '@/components/GlobalSearchCommand';
import { ChitraNavButton } from '@/components/ChitraWidget';
import { ProfileDialog } from '@/components/ProfileDialog';
import { AnnouncementBar } from '@/components/AnnouncementBar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useStaffHeader } from '@/contexts/StaffHeaderContext';
import { cn } from '@/lib/utils';

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;
  onAddCandidate?: () => void;
}

export function Header(props: HeaderProps = {}) {
  const navigate = useNavigate();
  const { user, role, signOut, isStaff } = useAuth();
  const staffHeader = useStaffHeader();
  const openGlobalSearch = useOpenGlobalSearch();
  const { data: profile } = useUserProfile();
  const [profileOpen, setProfileOpen] = useState(false);

  const showSearch = props.showSearch ?? staffHeader.showSearch ?? true;
  const searchQuery = props.searchQuery ?? staffHeader.searchQuery ?? '';
  const onSearchChange = props.onSearchChange ?? staffHeader.onSearchChange;
  const onAddCandidate = props.onAddCandidate ?? staffHeader.onAddCandidate ?? (() => navigate('/hiring?view=list&action=add'));

  const canManageCandidates = role && ['admin', 'hr', 'recruiter'].includes(role);
  const canAccessCalendar = role && ['admin', 'hr', 'recruiter', 'interviewer'].includes(role);
  const showHeaderCtas = canManageCandidates || canAccessCalendar;
  const headerCtaClass = 'h-10 w-10 p-0 shrink-0 md:h-9 md:w-auto md:gap-1.5 md:px-3';
  const mobileIconBtnClass = 'h-10 w-10 shrink-0';

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <header data-app-header className="z-40 shrink-0 bg-background/95 backdrop-blur-md border-b border-border min-w-0 max-w-full">
        <AnnouncementBar />
        <div className="flex items-center justify-between gap-1.5 md:gap-3 px-3 md:px-6 py-2 md:py-3">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="hidden md:flex h-9 w-9 shrink-0" />

            <Link to="/" className="flex items-center min-w-0 max-w-[4.5rem] md:hidden">
              <CompanyLogo compact />
            </Link>
          </div>

          <div className="flex items-center gap-0.5 md:gap-2 shrink-0">
            {isStaff && (
              <button
                type="button"
                onClick={openGlobalSearch}
                className="hidden md:flex h-9 w-52 lg:w-64 items-center gap-2 rounded-md bg-surface-subtle px-3 text-sm text-muted-foreground shadow-border transition-[color,box-shadow] duration-fast ease-out hover:text-foreground hover:shadow-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open global search"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">Search candidates, jobs…</span>
                <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-0.5 rounded-xs bg-card px-1.5 font-sans text-[11px] font-medium shadow-border">
                  ⌘K
                </kbd>
              </button>
            )}

            {showSearch && onSearchChange && (
              <div className="hidden md:block w-52 lg:w-64">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary rounded-lg"
                  />
                </div>
              </div>
            )}

            {isStaff && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('md:hidden', mobileIconBtnClass)}
                onClick={openGlobalSearch}
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </Button>
            )}

            {showHeaderCtas && (
              <div className="flex items-center gap-0.5 md:gap-2">
                {canManageCandidates && (
                  <Button
                    className={headerCtaClass}
                    onClick={onAddCandidate}
                    aria-label="Add Candidate"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span className="hidden md:inline text-sm font-medium">Add Candidate</span>
                  </Button>
                )}
                {canAccessCalendar && (
                  <Button variant="ghost" className={headerCtaClass} asChild>
                    <Link to="/calendar" aria-label="Calendar">
                      <Calendar className="h-4 w-4" />
                      <span className="hidden md:inline text-sm font-medium">Calendar</span>
                    </Link>
                  </Button>
                )}
              </div>
            )}

            <ChitraNavButton />
            <NotificationBell />

            <button
              className={cn('focus:outline-none md:hidden flex items-center justify-center', mobileIconBtnClass)}
              onClick={() => setProfileOpen(true)}
              aria-label="My profile"
            >
              <Avatar className="w-8 h-8 cursor-pointer outline outline-1 -outline-offset-1 outline-black/10">
                {profile?.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt={displayName} />
                )}
                <AvatarFallback className="bg-muted text-foreground text-sm font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </div>
        </div>
      </header>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} onSignOut={signOut} />
    </>
  );
}
