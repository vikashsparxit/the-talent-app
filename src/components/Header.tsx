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
  const headerCtaClass = 'btn-gradient text-primary-foreground h-8 sm:h-9 shrink-0 gap-1.5 px-2.5 sm:px-3';

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
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 md:py-3">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="hidden md:flex h-9 w-9 shrink-0" />

            <Link to="/" className="flex items-center shrink-0 min-w-0 md:hidden">
              <CompanyLogo />
            </Link>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {isStaff && (
              <button
                type="button"
                onClick={openGlobalSearch}
                className="hidden md:flex w-52 lg:w-64 items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                aria-label="Open global search"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
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
                className="md:hidden h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                onClick={openGlobalSearch}
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </Button>
            )}

            {showHeaderCtas && (
              <div className="flex items-center gap-1 sm:gap-2">
                {canManageCandidates && (
                  <Button
                    className={headerCtaClass}
                    onClick={onAddCandidate}
                    aria-label="Add Candidate"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span className="text-sm font-medium">Add Candidate</span>
                  </Button>
                )}
                {canAccessCalendar && (
                  <Button className={headerCtaClass} asChild>
                    <Link to="/calendar" aria-label="Calendar">
                      <Calendar className="h-4 w-4" />
                      <span className="text-sm font-medium">Calendar</span>
                    </Link>
                  </Button>
                )}
              </div>
            )}

            <ChitraNavButton />
            <NotificationBell />

            <button
              className="focus:outline-none md:hidden"
              onClick={() => setProfileOpen(true)}
              aria-label="My profile"
            >
              <Avatar className="w-8 h-8 sm:w-9 sm:h-9 border-2 border-primary/20 cursor-pointer hover:border-primary/40 transition-colors">
                {profile?.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt={displayName} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
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
