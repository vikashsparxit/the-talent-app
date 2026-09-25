import { useState } from 'react';
import { Link, NavLink, useLocation, Outlet } from 'react-router';
import { ChevronDown, Briefcase, Database, Settings } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CompanyLogo } from '@/components/CompanyLogo';
import { Header } from '@/components/Header';
import { ProfileDialog } from '@/components/ProfileDialog';
import { ProtectedRoute, useAuth } from '@/hooks/useAuth';
import { useCanAccessMyInterviews } from '@/hooks/useMyInterviews';
import { useUserProfile } from '@/hooks/useUserProfile';
import { StaffHeaderProvider } from '@/contexts/StaffHeaderContext';
import {
  canAccessSettings,
  evaluationsSubItems,
  evaluationPaths,
  filterMainNavItems,
  getMainNavIcon,
  isNavActive,
  isNavLinkActive,
  isReportsRoute,
  reportsSubItems,
} from '@/lib/navConfig';

function AppSidebar() {
  const location = useLocation();
  const { user, role, signOut } = useAuth();
  const { data: profile } = useUserProfile();
  const { canAccess: canAccessMyInterviews } = useCanAccessMyInterviews();
  const [profileOpen, setProfileOpen] = useState(false);
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Profile';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const navItems = filterMainNavItems(role, canAccessMyInterviews);
  const visibleEvalSubs = evaluationsSubItems.filter(item => !role || item.roles?.includes(role));
  const isEvaluationsActive = evaluationPaths.some(p => location.pathname.startsWith(p));
  const visibleReportSubs = reportsSubItems.filter(item => !role || item.roles?.includes(role));
  const isReportsActive = isReportsRoute(location.pathname);
  const canManageCandidates = role && ['admin', 'hr', 'recruiter'].includes(role);
  const showSettings = canAccessSettings(role);

  const groupLabelClass = 'text-caption font-medium uppercase tracking-[0.04em] text-muted-foreground';

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <Link to="/" className="flex items-center min-w-0">
          <CompanyLogo />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter(item => item.href !== '/calendar').map(item => {
                if (item.href === '/evaluations') {
                  return (
                    <Collapsible key="evaluations" defaultOpen={isEvaluationsActive} className="group/collapsible">
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={isEvaluationsActive}
                          tooltip="Evaluations"
                        >
                          <CollapsibleTrigger>
                            {(() => {
                              const EvalIcon = getMainNavIcon(item.href);
                              return <EvalIcon className="h-4 w-4 shrink-0" />;
                            })()}
                            <span>Evaluations</span>
                            <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </CollapsibleTrigger>
                        </SidebarMenuButton>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {visibleEvalSubs.map(sub => {
                              const active = isNavActive(location.pathname, sub.href);
                              return (
                                <SidebarMenuSubItem key={sub.href}>
                                  <SidebarMenuSubButton asChild isActive={active}>
                                    <Link to={sub.href}>
                                      <sub.icon className="h-4 w-4 shrink-0" />
                                      <span>{sub.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                if (item.href === '/reports') {
                  return (
                    <Collapsible key="reports" defaultOpen={isReportsActive} className="group/collapsible">
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={isReportsActive}
                          tooltip="Reports"
                        >
                          <CollapsibleTrigger>
                            {(() => {
                              const ReportsIcon = getMainNavIcon(item.href);
                              return <ReportsIcon className="h-4 w-4 shrink-0" />;
                            })()}
                            <span>Reports</span>
                            <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </CollapsibleTrigger>
                        </SidebarMenuButton>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {visibleReportSubs.map(sub => {
                              const active = isNavLinkActive(location.pathname, location.search, sub.href);
                              return (
                                <SidebarMenuSubItem key={sub.href}>
                                  <SidebarMenuSubButton asChild isActive={active}>
                                    <Link to={sub.href}>
                                      <sub.icon className="h-4 w-4 shrink-0" />
                                      <span>{sub.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                const Icon = getMainNavIcon(item.href);
                const active = isNavActive(location.pathname, item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <NavLink to={item.href} end={item.href === '/'}>
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canManageCandidates && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel className={groupLabelClass}>Library</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isNavActive(location.pathname, '/jobs')} tooltip="Jobs">
                    <Link to="/jobs">
                      <Briefcase className="h-4 w-4 shrink-0" />
                      <span>Jobs</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isNavActive(location.pathname, '/database')} tooltip="Talent Database">
                    <Link to="/database">
                      <Database className="h-4 w-4 shrink-0" />
                      <span>Talent Database</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {showSettings && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location.pathname.startsWith('/settings')} tooltip="Settings">
                <Link to="/settings">
                  <Settings className="h-4 w-4 shrink-0" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={displayName}
              onClick={() => setProfileOpen(true)}
              className="group-data-[collapsible=icon]:!size-8"
            >
              <Avatar className="h-8 w-8 shrink-0 outline outline-1 -outline-offset-1 outline-black/10">
                {profile?.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt={displayName} />
                )}
                <AvatarFallback className="bg-muted text-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{displayName}</span>
                {user?.email && (
                  <span className="truncate text-xs text-sidebar-foreground/70">{user.email}</span>
                )}
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} onSignOut={signOut} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export function AppShell({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={false} className="h-svh overflow-hidden">
      <a
        href="#staff-scroll-pane"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-popover focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden">
        {header}
        <div
          id="staff-scroll-pane"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain focus:outline-none"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function StaffLayout() {
  return (
    <ProtectedRoute>
      <StaffHeaderProvider>
        <AppShell header={<Header />}>
          <Outlet />
        </AppShell>
      </StaffHeaderProvider>
    </ProtectedRoute>
  );
}
