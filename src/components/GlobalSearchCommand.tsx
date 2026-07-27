import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { Briefcase, Calendar, Loader2, User } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import {
  useGlobalSearch,
  type GlobalSearchCandidate,
  type GlobalSearchInterview,
  type GlobalSearchJob,
} from '@/hooks/useGlobalSearch';

type GlobalSearchContextValue = {
  open: () => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function useOpenGlobalSearch() {
  const ctx = useContext(GlobalSearchContext);
  return ctx?.open ?? (() => {});
}

function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [open]);

  const { data, isFetching, isError } = useGlobalSearch(debouncedQuery, open);
  const hasQuery = debouncedQuery.trim().length >= 2;
  const results = data ?? { candidates: [], jobs: [], interviews: [] };
  const hasResults =
    results.candidates.length > 0 ||
    results.jobs.length > 0 ||
    results.interviews.length > 0;

  const closeAndNavigate = useCallback(
    (path: string) => {
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange],
  );

  const onSelectCandidate = (item: GlobalSearchCandidate) => {
    closeAndNavigate(`/hiring?view=list&profile=${item.id}`);
  };

  const onSelectJob = (item: GlobalSearchJob) => {
    closeAndNavigate(`/hiring?view=board&job=${item.id}`);
  };

  const onSelectInterview = (item: GlobalSearchInterview) => {
    closeAndNavigate(`/hiring?view=board&job=${item.jobId}&candidate=${item.candidateId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-lg">
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <DialogDescription className="sr-only">
          Search candidates, jobs, and interviews across SparxTalent.
        </DialogDescription>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search candidates, jobs, interviews…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
        {!hasQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search
          </div>
        )}
        {hasQuery && isFetching && !data && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        )}
        {hasQuery && isError && (
          <div className="py-6 text-center text-sm text-destructive">
            Search failed. Please try again.
          </div>
        )}
        {hasQuery && !isFetching && !hasResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {results.candidates.length > 0 && (
          <CommandGroup heading="Candidates">
            {results.candidates.map((item) => (
              <CommandItem
                key={item.id}
                value={`candidate-${item.id}-${item.name}-${item.email}`}
                onSelect={() => onSelectCandidate(item)}
              >
                <User className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[item.email, item.jobTitle].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.candidates.length > 0 && (results.jobs.length > 0 || results.interviews.length > 0) && (
          <CommandSeparator />
        )}
        {results.jobs.length > 0 && (
          <CommandGroup heading="Jobs">
            {results.jobs.map((item) => (
              <CommandItem
                key={item.id}
                value={`job-${item.id}-${item.title}`}
                onSelect={() => onSelectJob(item)}
              >
                <Briefcase className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{item.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[item.department, item.status].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.jobs.length > 0 && results.interviews.length > 0 && <CommandSeparator />}
        {results.interviews.length > 0 && (
          <CommandGroup heading="Interviews">
            {results.interviews.map((item) => (
              <CommandItem
                key={item.id}
                value={`interview-${item.id}-${item.candidateName}`}
                onSelect={() => onSelectInterview(item)}
              >
                <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{item.candidateName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      item.stageName,
                      item.jobTitle,
                      format(new Date(item.scheduledAt), 'MMM d, h:mm a'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const { isStaff, user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  const openSearch = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!isStaff || loading || !user) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isStaff, loading, user]);

  const value = useMemo(() => ({ open: openSearch }), [openSearch]);

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      {isStaff && user && !loading && (
        <GlobalSearchDialog open={open} onOpenChange={setOpen} />
      )}
    </GlobalSearchContext.Provider>
  );
}
