export function ApplicantFooter() {
  return (
    <footer className="hidden md:block border-t bg-background mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-center text-xs text-muted-foreground">
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
        </span>
      </div>
    </footer>
  );
}
