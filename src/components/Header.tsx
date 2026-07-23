import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  Search, UserPlus, Database, ChevronDown, Briefcase, Menu, Calendar, CalendarCheck, Settings, type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CompanyLogo } from '@/components/CompanyLogo';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/NotificationBell';
import { useOpenGlobalSearch } from '@/components/GlobalSearchCommand';
import { ChitraNavButton } from '@/components/ChitraWidget';
import { ProfileDialog } from '@/components/ProfileDialog';
import { AnnouncementBar } from '@/components/AnnouncementBar';
import { useCanAccessMyInterviews } from '@/hooks/useMyInterviews';
import {
  evaluationsSubItems,
  evaluationPaths,
  filterMainNavItems,
  isNavActive,
  canAccessSettings,
} from '@/lib/navConfig';

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;
  onAddCandidate?: () => void;
}

export function Header({ searchQuery = '', onSearchChange, showSearch = true, onAddCandidate }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, signOut, isStaff } = useAuth();
  const openGlobalSearch = useOpenGlobalSearch();
  const { data: profile } = useUserProfile();
  const [profileOpen, setProfileOpen] = useState(false);
  const [tabletMenuOpen, setTabletMenuOpen] = useState(false);

  const handleAddCandidate = onAddCandidate ?? (() => navigate('/hiring?view=list&action=add'));
  const { canAccess: canAccessMyInterviews } = useCanAccessMyInterviews();

  const navItems = filterMainNavItems(role, canAccessMyInterviews);
  const visibleEvalSubs = evaluationsSubItems.filter(item => !role || item.roles?.includes(role));
  const isEvaluationsActive = evaluationPaths.some(p => location.pathname.startsWith(p));
  const canManageCandidates = role && ['admin', 'hr', 'recruiter'].includes(role);
  const canAccessCalendar = role && ['admin', 'hr', 'recruiter', 'interviewer'].includes(role);
  const showHeaderCtas = canManageCandidates || canAccessCalendar;
  const headerCtaClass = 'btn-gradient text-primary-foreground h-8 w-8 sm:h-9 sm:w-9 shrink-0';

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  useEffect(() => {
    setTabletMenuOpen(false);
  }, [location.pathname]);

  const tabletNavLinks: { label: string; href: string; icon?: LucideIcon }[] = [];
  navItems.filter(item => item.href !== '/calendar').forEach(item => {
    if (item.href === '/evaluations') {
      visibleEvalSubs.forEach(sub => tabletNavLinks.push({ label: sub.label, href: sub.href, icon: sub.icon }));
    } else {
      tabletNavLinks.push({
        label: item.label,
        href: item.href,
        icon: item.href === '/my-interviews' ? CalendarCheck : undefined,
      });
    }
  });

  const navLinkClass = (active: boolean) => cn(
    'px-3 py-2 text-sm font-medium rounded-md transition-colors',
    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
  );

  const tabletNavLinkClass = (active: boolean) => cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
  );

  return (
    <>
    <header data-app-header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
      <AnnouncementBar />
      <div className="container mx-auto px-4 sm:px-6 py-2.5 md:py-4 md:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center shrink-0 min-w-0">
              <CompanyLogo />
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              {navItems.filter(item => item.href !== '/calendar').map(item => {
                if (item.href === '/evaluations') {
                  return (
                    <DropdownMenu key="evaluations">
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            navLinkClass(isEvaluationsActive),
                            'flex items-center gap-1 focus:outline-none',
                          )}
                        >
                          Evaluations
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[170px]">
                        {visibleEvalSubs.map(sub => (
                          <DropdownMenuItem key={sub.href} asChild>
                            <Link
                              to={sub.href}
                              className={cn(
                                'flex items-center gap-2',
                                isNavActive(location.pathname, sub.href) && 'text-primary font-medium',
                              )}
                            >
                              <sub.icon className="h-4 w-4" />
                              {sub.label}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={navLinkClass(isNavActive(location.pathname, item.href))}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {isStaff && (
            <button
              type="button"
              onClick={openGlobalSearch}
              className="hidden md:flex flex-1 max-w-md mx-4 items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
            <div className="hidden md:flex flex-1 max-w-md mx-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-10 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
                  <>
                    <Button className={headerCtaClass} size="icon" asChild>
                      <Link to="/database" title="Database" aria-label="Database">
                        <Database className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button className={headerCtaClass} size="icon" asChild>
                      <Link to="/jobs" title="Jobs" aria-label="Jobs">
                        <Briefcase className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      className={headerCtaClass}
                      size="icon"
                      onClick={handleAddCandidate}
                      title="Add Candidate"
                      aria-label="Add Candidate"
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {canAccessCalendar && (
                  <Button className={headerCtaClass} size="icon" asChild>
                    <Link to="/calendar" title="Calendar" aria-label="Calendar">
                      <Calendar className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex lg:hidden h-9 w-9"
              onClick={() => setTabletMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <ChitraNavButton />
            <NotificationBell />

            {canAccessSettings(role) && (
              <Link
                to="/settings"
                className={cn(
                  'p-2 rounded-md transition-colors focus:outline-none hidden lg:block',
                  location.pathname.startsWith('/settings')
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}

            <button
              className="focus:outline-none"
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
      </div>
    </header>

    <Sheet open={tabletMenuOpen} onOpenChange={setTabletMenuOpen}>
      <SheetContent side="left" className="w-[min(100vw-2rem,300px)] p-0 flex flex-col">
        <SheetHeader className="px-4 py-4 border-b text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CompanyLogo compact />
            Menu
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {tabletNavLinks.map(link => {
            const Icon = link.icon;
            const active = isNavActive(location.pathname, link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                className={tabletNavLinkClass(active)}
                onClick={() => setTabletMenuOpen(false)}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {link.label}
              </Link>
            );
          })}
        </nav>

        {showHeaderCtas && (
          <div className="border-t p-3 space-y-2">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick actions</p>
            <div className="flex flex-wrap gap-2 px-3">
              {canManageCandidates && (
                <>
                  <Button className={headerCtaClass} size="icon" asChild>
                    <Link to="/database" title="Database" aria-label="Database" onClick={() => setTabletMenuOpen(false)}>
                      <Database className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button className={headerCtaClass} size="icon" asChild>
                    <Link to="/jobs" title="Jobs" aria-label="Jobs" onClick={() => setTabletMenuOpen(false)}>
                      <Briefcase className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    className={headerCtaClass}
                    size="icon"
                    title="Add Candidate"
                    aria-label="Add Candidate"
                    onClick={() => { setTabletMenuOpen(false); handleAddCandidate(); }}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </>
              )}
              {canAccessCalendar && (
                <Button className={headerCtaClass} size="icon" asChild>
                  <Link to="/calendar" title="Calendar" aria-label="Calendar" onClick={() => setTabletMenuOpen(false)}>
                    <Calendar className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}

        {canAccessSettings(role) && (
          <div className="border-t p-3">
            <Link to="/settings" className={tabletNavLinkClass(location.pathname.startsWith('/settings'))} onClick={() => setTabletMenuOpen(false)}>
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>

    <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} onSignOut={signOut} />
    </>
  );
}
