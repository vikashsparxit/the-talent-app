import { Link } from 'react-router';
import { useBusinessBranding } from '@/hooks/useSystemConfig';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  compact?: boolean;
  className?: string;
}

export function CompanyLogo({ compact = false, className }: CompanyLogoProps) {
  const { branding } = useBusinessBranding();
  const desktop = branding.logo_desktop_url;
  const mobile = branding.logo_mobile_url ?? desktop;
  const name = branding.company_name?.trim();

  if (desktop || mobile) {
    return (
      <picture className={className}>
        {mobile && mobile !== desktop && (
          <source media="(max-width: 767px)" srcSet={mobile} />
        )}
        <img
          src={desktop || mobile || undefined}
          alt={name || 'Company logo'}
          className={cn('w-auto object-contain', compact ? 'h-7 max-w-[140px]' : 'h-8 sm:h-9 md:h-10 max-w-[180px]')}
        />
      </picture>
    );
  }

  if (name) {
    return (
      <span className={cn('font-semibold text-foreground truncate max-w-[160px]', compact ? 'text-sm' : 'text-base sm:text-lg', className)}>
        {name}
      </span>
    );
  }

  return (
    <span className={cn('font-medium text-muted-foreground', compact ? 'text-sm' : 'text-base', className)}>
      Your Company
    </span>
  );
}

export function useCompanyDisplayName() {
  const { branding } = useBusinessBranding();
  return branding.company_name?.trim() || null;
}

interface ApplicantPortalHeaderProps {
  title?: string;
  homeHref?: string;
  showCompanyName?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

export function ApplicantPortalHeader({
  title = 'Applicant Portal',
  homeHref = '/applicant',
  showCompanyName = false,
  actions,
  className,
}: ApplicantPortalHeaderProps) {
  const companyName = useCompanyDisplayName();

  return (
    <header className={cn('border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50', className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to={homeHref} className="flex items-center gap-2 sm:gap-3 min-w-0">
            <CompanyLogo />
            <div className="min-w-0">
              <span className="font-semibold text-base sm:text-lg block truncate">{title}</span>
              {showCompanyName && companyName && (
                <p className="text-xs text-muted-foreground truncate">{companyName}</p>
              )}
            </div>
          </Link>
          {actions && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

interface AssessmentPortalHeaderProps {
  homeHref?: string;
  subtitle?: string;
  sticky?: boolean;
  className?: string;
}

export function AssessmentPortalHeader({
  homeHref,
  subtitle,
  sticky = true,
  className,
}: AssessmentPortalHeaderProps) {
  const { branding } = useBusinessBranding();
  const companyName = useCompanyDisplayName();
  const hasLogo = !!(branding.logo_desktop_url || branding.logo_mobile_url);
  const resolvedSubtitle = subtitle ?? (companyName ? `${companyName} Talent Evaluation` : 'The Talent App');

  const brandingLeft = (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      {hasLogo ? (
        <>
          <CompanyLogo />
          {companyName && (
            <span className="font-semibold text-base sm:text-lg truncate">{companyName}</span>
          )}
        </>
      ) : (
        <CompanyLogo />
      )}
    </div>
  );

  return (
    <header
      className={cn(
        'border-b bg-card',
        sticky && 'sticky top-0 z-50',
        className,
      )}
    >
      <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
        {homeHref ? (
          <Link to={homeHref} className="min-w-0 shrink">
            {brandingLeft}
          </Link>
        ) : (
          <div className="min-w-0 shrink">{brandingLeft}</div>
        )}
        <div className="text-right min-w-0 shrink-0">
          <h1 className="font-semibold text-base sm:text-lg">Assessment Portal</h1>
          {resolvedSubtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{resolvedSubtitle}</p>
          )}
        </div>
      </div>
    </header>
  );
}
