export type SearchIntent = {
  textQuery?: string;
  name?: string;
  role?: string;
  skills?: string[];
  expMin?: number;
  expMax?: number;
  location?: string;
  stageName?: string;
  dateHint?: string;
};

export type AnalyticsQuestionHint = {
  kind: 'recruiter' | 'pipeline' | 'general';
  subjectHint?: string;
  rawQuery: string;
};

export type HiringUrlFilters = {
  q: string;
  skills: string[];
  advanced: {
    name: string;
    email: string;
    company: string;
    role: string;
    expMin: string;
    expMax: string;
    source: string;
  };
  hasAdvancedFilters: boolean;
};

const TITLE_KEYWORD =
  /\b(manager|engineer|developer|intern|lead|architect|designer|recruiter|analyst|consultant|specialist|director|coordinator|administrator|executive|associate|trainee)\b/i;

const QUESTION_PREFIX =
  /^\s*(what('s| is| are)|how (many|much|is|are)|who('s| is| are)|where (are|is)|when (did|was|is)|show (me |the )?|give me|tell me|list |find out|can you|could you)/i;

const ANALYTICS_TERMS =
  /\b(performance|report|metrics|statistics|stats|leaderboard|conversion|velocity|bottleneck|stuck|pipeline health|how many|how much|sourced|pass rate)\b/i;

const SUBJECT_STOP_WORDS =
  /^(the|a|an|this|that|our|their|my|your|performance|report|pipeline|recruiter|recruiters)$/i;

/** True when the query looks like natural language rather than a quick name lookup. */
export function isNaturalLanguageQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length < 12) return false;
  if (!/\s/.test(trimmed)) return false;
  if (/\b(AND|OR|NOT)\b/i.test(trimmed)) return false;
  return true;
}

/** Analytics / NL questions — not candidate name+role filters. */
export function isAnalyticsQuestionQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 8) return false;
  if (QUESTION_PREFIX.test(trimmed)) return true;
  if (/\?\s*$/.test(trimmed) && ANALYTICS_TERMS.test(trimmed)) return true;
  if (ANALYTICS_TERMS.test(trimmed) && /\b(of|for|about|on|in)\b/i.test(trimmed)) return true;
  return false;
}

function extractAnalyticsSubjectName(query: string): string | undefined {
  const recruiterMatch = query.match(/\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+recruiter\b/i);
  if (recruiterMatch) {
    const name = recruiterMatch[1].trim().replace(/^of\s+/i, '');
    if (name.length >= 2 && !SUBJECT_STOP_WORDS.test(name)) return name;
  }

  const ofMatch = query.match(/\b(?:of|for|about)\s+(?:the\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
  if (ofMatch) {
    const name = ofMatch[1].trim();
    if (name.length >= 2 && !SUBJECT_STOP_WORDS.test(name)) return name;
  }

  return undefined;
}

export function parseAnalyticsQuestionHint(query: string): AnalyticsQuestionHint {
  const trimmed = query.trim();
  const subjectHint = extractAnalyticsSubjectName(trimmed);
  const isRecruiter =
    /\brecruiter(s)?\b/i.test(trimmed) ||
    (/\bperformance\b/i.test(trimmed) && !!subjectHint);
  const isPipeline =
    /\b(pipeline|stage|funnel|bottleneck|stuck|velocity)\b/i.test(trimmed) && !isRecruiter;

  return {
    kind: isRecruiter ? 'recruiter' : isPipeline ? 'pipeline' : 'general',
    subjectHint,
    rawQuery: trimmed,
  };
}

export function buildReportsUrl(hint: AnalyticsQuestionHint): string {
  const params = new URLSearchParams();
  if (hint.kind === 'recruiter') params.set('tab', 'recruiter');
  else if (hint.kind === 'pipeline') params.set('tab', 'velocity');
  else params.set('tab', 'recruiter');
  if (hint.subjectHint) params.set('q', hint.subjectHint);
  return `/reports?${params.toString()}`;
}

export function parseHiringFiltersFromSearch(search: string): HiringUrlFilters {
  const params = new URLSearchParams(search);
  const skillsRaw = params.get('skills');
  const advanced = {
    name: params.get('name') ?? '',
    email: params.get('email') ?? '',
    company: params.get('company') ?? '',
    role: params.get('role') ?? '',
    expMin: params.get('expMin') ?? '',
    expMax: params.get('expMax') ?? '',
    source: params.get('source') ?? '',
  };
  const hasAdvancedFilters = !!(
    skillsRaw ||
    params.get('expMin') ||
    params.get('expMax') ||
    params.get('location') ||
    params.get('stage') ||
    advanced.name ||
    advanced.role ||
    advanced.email ||
    advanced.company ||
    advanced.source
  );

  return {
    q: params.get('q') ?? '',
    skills: skillsRaw ? skillsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [],
    advanced,
    hasAdvancedFilters,
  };
}

/** Client-side fallback: split trailing job-title words from a person name. */
export function parseSearchIntentHeuristic(query: string): SearchIntent {
  const trimmed = query.trim();
  if (!trimmed || /\b(AND|OR|NOT)\b/i.test(trimmed)) {
    return trimmed ? { textQuery: trimmed } : {};
  }

  if (isAnalyticsQuestionQuery(trimmed)) {
    return { textQuery: trimmed };
  }

  const words = trimmed.split(/\s+/);
  if (words.length < 2) {
    return { textQuery: trimmed };
  }

  const maxSuffix = Math.min(3, words.length - 1);
  for (let suffixLen = maxSuffix; suffixLen >= 1; suffixLen--) {
    const suffix = words.slice(-suffixLen).join(' ');
    if (!TITLE_KEYWORD.test(suffix)) continue;
    const name = words.slice(0, -suffixLen).join(' ').trim();
    if (name.length < 2) continue;
    const nameWords = name.split(/\s+/).length;
    if (nameWords >= 2 || suffixLen === 1) {
      return { name, role: suffix };
    }
  }

  return { textQuery: trimmed };
}

/** Merge Gemini output with heuristic name/role when the model only returned textQuery. */
export function enrichSearchIntent(intent: SearchIntent, rawQuery: string): SearchIntent {
  if (isAnalyticsQuestionQuery(rawQuery)) {
    return { textQuery: rawQuery.trim() };
  }

  const name = intent.name?.trim();
  const role = intent.role?.trim();
  if (name || role) {
    const enriched: SearchIntent = { ...intent };
    if (name) enriched.name = name;
    if (role) enriched.role = role;
    if (enriched.name && enriched.role) {
      delete enriched.textQuery;
    }
    return enriched;
  }

  const heuristic = parseSearchIntentHeuristic(rawQuery);
  if (heuristic.name && heuristic.role) {
    return {
      ...intent,
      name: heuristic.name,
      role: heuristic.role,
      textQuery: undefined,
    };
  }

  return intent;
}

export function buildHiringSearchUrl(intent: SearchIntent): string {
  const params = new URLSearchParams();
  params.set('view', 'list');

  if (intent.name?.trim()) params.set('name', intent.name.trim());
  if (intent.role?.trim()) params.set('role', intent.role.trim());
  if (intent.textQuery?.trim()) params.set('q', intent.textQuery.trim());
  if (intent.skills?.length) params.set('skills', intent.skills.join(','));
  if (intent.expMin != null) params.set('expMin', String(intent.expMin));
  if (intent.expMax != null) params.set('expMax', String(intent.expMax));
  if (intent.location?.trim()) params.set('location', intent.location.trim());
  if (intent.stageName?.trim()) params.set('stage', intent.stageName.trim());

  return `/hiring?${params.toString()}`;
}

export function summarizeSearchIntent(intent: SearchIntent): string {
  const parts: string[] = [];
  if (intent.name) parts.push(intent.name);
  if (intent.role) parts.push(intent.role);
  if (intent.skills?.length) parts.push(intent.skills.join(', '));
  if (intent.location) parts.push(intent.location);
  if (intent.expMin != null || intent.expMax != null) {
    if (intent.expMin != null && intent.expMax != null) {
      parts.push(`${intent.expMin}–${intent.expMax} yrs`);
    } else if (intent.expMin != null) {
      parts.push(`${intent.expMin}+ yrs`);
    } else {
      parts.push(`≤${intent.expMax} yrs`);
    }
  }
  if (intent.stageName) parts.push(intent.stageName);
  if (intent.textQuery) parts.push(intent.textQuery);
  return parts.join(' · ') || 'All filters';
}
