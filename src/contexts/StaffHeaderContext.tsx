import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type StaffHeaderConfig = {
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onAddCandidate?: () => void;
};

type SerializableStaffHeaderConfig = {
  showSearch?: boolean;
  searchQuery?: string;
  hasOnSearchChange: boolean;
  hasOnAddCandidate: boolean;
};

type StaffHeaderCallbacks = Pick<StaffHeaderConfig, 'onSearchChange' | 'onAddCandidate'>;

type StaffHeaderContextValue = {
  config: SerializableStaffHeaderConfig;
  callbacksRef: React.MutableRefObject<StaffHeaderCallbacks>;
  setConfig: (config: StaffHeaderConfig) => void;
};

const EMPTY_SERIALIZABLE: SerializableStaffHeaderConfig = {
  hasOnSearchChange: false,
  hasOnAddCandidate: false,
};

const StaffHeaderContext = createContext<StaffHeaderContextValue | null>(null);

function toSerializable(config: StaffHeaderConfig): SerializableStaffHeaderConfig {
  return {
    showSearch: config.showSearch,
    searchQuery: config.searchQuery,
    hasOnSearchChange: config.onSearchChange != null,
    hasOnAddCandidate: config.onAddCandidate != null,
  };
}

function serializableEqual(
  a: SerializableStaffHeaderConfig,
  b: SerializableStaffHeaderConfig,
): boolean {
  return (
    a.showSearch === b.showSearch
    && a.searchQuery === b.searchQuery
    && a.hasOnSearchChange === b.hasOnSearchChange
    && a.hasOnAddCandidate === b.hasOnAddCandidate
  );
}

export function StaffHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SerializableStaffHeaderConfig>(EMPTY_SERIALIZABLE);
  const callbacksRef = useRef<StaffHeaderCallbacks>({});

  const setConfig = useCallback((next: StaffHeaderConfig) => {
    callbacksRef.current = {
      onSearchChange: next.onSearchChange,
      onAddCandidate: next.onAddCandidate,
    };
    const nextSerializable = toSerializable(next);
    setConfigState(prev => (serializableEqual(prev, nextSerializable) ? prev : nextSerializable));
  }, []);

  const value = useMemo(
    () => ({ config, callbacksRef, setConfig }),
    [config, setConfig],
  );

  return (
    <StaffHeaderContext.Provider value={value}>
      {children}
    </StaffHeaderContext.Provider>
  );
}

export function useStaffHeader(): StaffHeaderConfig {
  const ctx = useContext(StaffHeaderContext);
  if (!ctx) return {};
  return {
    showSearch: ctx.config.showSearch,
    searchQuery: ctx.config.searchQuery,
    onSearchChange: ctx.callbacksRef.current.onSearchChange,
    onAddCandidate: ctx.callbacksRef.current.onAddCandidate,
  };
}

/** Pages call this to override header CTAs/search for the current route. */
export function useStaffHeaderConfig(overrides: StaffHeaderConfig) {
  const ctx = useContext(StaffHeaderContext);
  const setConfig = ctx?.setConfig;
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  if (ctx) {
    ctx.callbacksRef.current = {
      onSearchChange: overrides.onSearchChange,
      onAddCandidate: overrides.onAddCandidate,
    };
  }

  const { showSearch, searchQuery } = overrides;
  const hasOnSearchChange = overrides.onSearchChange != null;
  const hasOnAddCandidate = overrides.onAddCandidate != null;

  useEffect(() => {
    if (!setConfig) return;
    setConfig(overridesRef.current);
    return () => setConfig({});
  }, [setConfig, showSearch, searchQuery, hasOnSearchChange, hasOnAddCandidate]);
}
