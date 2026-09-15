import { useComplianceSettings } from '@/hooks/useSystemConfig';

export function ApplicantFooter() {
  const { compliance } = useComplianceSettings();

  return (
    <footer className="hidden md:block border-t bg-background mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
        <span className="text-center">
          © {new Date().getFullYear()} The Talent App. Built with love by{' '}
          <a
            href="https://www.sparxitsolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            SparxIT
          </a>
          {compliance.privacy_policy_url && (
            <>
              {' · '}
              <a
                href={compliance.privacy_policy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Privacy
              </a>
            </>
          )}
        </span>
        {compliance.grievance_officer_name && compliance.grievance_officer_email && (
          <span className="text-center">
            Grievance officer: {compliance.grievance_officer_name} (
            <a
              href={`mailto:${compliance.grievance_officer_email}`}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              {compliance.grievance_officer_email}
            </a>
            )
          </span>
        )}
      </div>
    </footer>
  );
}
