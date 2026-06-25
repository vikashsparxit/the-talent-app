import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getDevGeminiKeyBody } from '@/lib/devGemini';

export interface ParsedProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role_applied?: string;
  skills: string[];
  source: string;
  parse_score: number;
  experience_years?: number;
  candidate_current_role?: string;
  candidate_current_company?: string;
  enrichment_score?: number;
  skills_tags: string[];
  resume_url?: string;
  notes?: string;
  created_at: string;
  last_enriched_at?: string;
}

export function useParsedProfiles(options?: { fetchList?: boolean }) {
  const fetchList = options?.fetchList ?? true;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const profilesQuery = useQuery({
    queryKey: ['parsed-profiles'],
    enabled: fetchList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        role_applied: c.role_applied,
        skills: Array.isArray(c.skills) ? c.skills.map(String) : [],
        source: c.source || 'manual',
        parse_score: c.parse_score || 0,
        experience_years: c.experience_years,
        candidate_current_role: c.candidate_current_role,
        candidate_current_company: c.candidate_current_company,
        enrichment_score: c.enrichment_score,
        skills_tags: Array.isArray(c.skills_tags) ? c.skills_tags.map(String) : [],
        resume_url: c.resume_url,
        notes: c.notes,
        created_at: c.created_at,
        last_enriched_at: c.last_enriched_at,
      })) as ParsedProfile[];
    },
  });

  const enrichProfile = useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error } = await supabase.functions.invoke('enrich-profile', {
        body: { candidate_id: candidateId, ...getDevGeminiKeyBody() },
      });
      if (error) {
        // Prefer server error body message when available (e.g. missing API key, Gemini error)
        const err = error as { context?: { json?: () => Promise<{ error?: string }> }; message?: string };
        if (err.context?.json) {
          try {
            const body = await err.context.json();
            const msg = body?.error;
            if (typeof msg === 'string') throw new Error(msg);
          } catch (e) {
            if (e instanceof Error && e.message !== error.message) throw e;
          }
        }
        throw error;
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parsed-profiles'] });
      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: 'Profile enriched successfully' });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Enrichment failed',
        description: error.message,
      });
    },
  });

  const enrichBatch = useMutation({
    mutationFn: async (candidateIds: string[]) => {
      const results = [];
      for (const id of candidateIds) {
        try {
          const { data, error } = await supabase.functions.invoke('enrich-profile', {
            body: { candidate_id: id, ...getDevGeminiKeyBody() },
          });
          if (error) throw error;
          results.push({ id, success: true, data });
        } catch (e) {
          results.push({ id, success: false, error: e });
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      const successCount = results.filter(r => r.success).length;
      await queryClient.invalidateQueries({ queryKey: ['parsed-profiles'] });
      await queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: `Enriched ${successCount}/${results.length} profiles` });
    },
  });

  return {
    profiles: profilesQuery.data ?? [],
    isLoading: profilesQuery.isLoading,
    error: profilesQuery.error,
    enrichProfile,
    enrichBatch,
    refetch: profilesQuery.refetch,
  };
}
