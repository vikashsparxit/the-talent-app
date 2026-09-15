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
import { BarChart3, Briefcase, Calendar, Loader2, Mic, MicOff, Sparkles, User } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import {
  useGlobalSearch,
  type GlobalSearchCandidate,
  type GlobalSearchInterview,
  type GlobalSearchJob,
} from '@/hooks/useGlobalSearch';
import { useParseSearchIntent } from '@/hooks/useParseSearchIntent';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import {
  buildHiringSearchUrl,
  buildReportsUrl,
  isAnalyticsQuestionQuery,
  isNaturalLanguageQuery,
  parseAnalyticsQuestionHint,
  parseSearchIntentHeuristic,
  summarizeSearchIntent,
  type SearchIntent,
} from '@/lib/searchIntent';

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

  const handleSpeechTranscript = useCallback((transcript: string) => {
    setQuery(transcript);
  }, []);

  const { isSupported: speechSupported, isListening, start: toggleSpeech } =
    useSpeechRecognition(handleSpeechTranscript);

  const isAnalyticsQuery = isAnalyticsQuestionQuery(debouncedQuery);
  const analyticsHint = isAnalyticsQuery ? parseAnalyticsQuestionHint(debouncedQuery) : null;
  const candidateLookupQuery =
    isAnalyticsQuery && analyticsHint?.subjectHint ? analyticsHint.subjectHint : debouncedQuery;

  const { data, isFetching, isError } = useGlobalSearch(candidateLookupQuery, open);
  const isNlQuery = isNaturalLanguageQuery(debouncedQuery) && !isAnalyticsQuery;
  const {
    data: parsedIntent,
    isFetching: isParsingIntent,
    isError: parseIntentError,
  } = useParseSearchIntent(debouncedQuery, open && isNlQuery);

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

  const navigateWithIntent = useCallback(
    (intent: SearchIntent) => {
      closeAndNavigate(buildHiringSearchUrl(intent));
    },
    [closeAndNavigate],
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

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (isAnalyticsQuery && analyticsHint) {
      event.preventDefault();
      closeAndNavigate(buildReportsUrl(analyticsHint));
      return;
    }
    if (!isNlQuery) return;
    event.preventDefault();
    if (parsedIntent) {
      navigateWithIntent(parsedIntent);
    } else {
      navigateWithIntent(parseSearchIntentHeuristic(debouncedQuery.trim()));
    }
  };

  const micButton = speechSupported ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={toggleSpeech}
      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={isListening}
    >
      {isListening ? (
        <MicOff className="h-4 w-4 text-destructive animate-pulse" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 opacity-40"
      disabled
      title="Voice search not supported in this browser"
      aria-label="Voice search not supported in this browser"
    >
      <MicOff className="h-4 w-4" />
    </Button>
  );

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
            onKeyDown={handleInputKeyDown}
            suffix={micButton}
          />
          {isListening && (
            <div className="border-b px-3 py-1.5 text-xs text-primary animate-pulse">
              Listening… speak your search
            </div>
          )}
          <CommandList>
        {!hasQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search
            {speechSupported && (
              <span className="block mt-1 text-xs">or tap the mic to speak</span>
            )}
          </div>
        )}
        {hasQuery && isAnalyticsQuery && analyticsHint && (
          <CommandGroup heading="Ask / Reports">
            <CommandItem
              value={`analytics-reports-${debouncedQuery}`}
              onSelect={() => closeAndNavigate(buildReportsUrl(analyticsHint))}
            >
              <BarChart3 className="mr-2 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {analyticsHint.kind === 'recruiter'
                    ? 'Open Recruiter report'
                    : analyticsHint.kind === 'pipeline'
                      ? 'Open Pipeline report'
                      : 'Open Reports'}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {analyticsHint.subjectHint
                    ? `Filter by ${analyticsHint.subjectHint}`
                    : 'Analytics & performance'}
                </span>
              </div>
            </CommandItem>
          </CommandGroup>
        )}
        {hasQuery && isNlQuery && (
          <>
            {isParsingIntent && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
                <Loader2 className="h-3 w-3 animate-spin" />
                Understanding your search…
              </div>
            )}
            {parsedIntent && !isParsingIntent && (
              <CommandGroup heading="Smart search">
                <CommandItem
                  value={`smart-search-${debouncedQuery}`}
                  onSelect={() => navigateWithIntent(parsedIntent)}
                >
                  <Sparkles className="mr-2 h-4 w-4 shrink-0 text-violet-500" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">Search hiring list</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {summarizeSearchIntent(parsedIntent)}
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}
            {parseIntentError && !isParsingIntent && (
              <CommandGroup heading="Smart search">
                <CommandItem
                  value={`smart-search-fallback-${debouncedQuery}`}
                  onSelect={() => navigateWithIntent(parseSearchIntentHeuristic(debouncedQuery.trim()))}
                >
                  <Sparkles className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">Search hiring list</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {summarizeSearchIntent(parseSearchIntentHeuristic(debouncedQuery.trim()))}
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}
          </>
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
        {hasQuery && !isFetching && !hasResults && !isNlQuery && (
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
