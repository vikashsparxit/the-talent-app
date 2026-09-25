import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { type Vendor } from './useVendors';

export interface VendorCandidateRow {
  id: string;
  name: string;
  job_title: string;
  highest_stage: string | null;
  overall_verdict: string | null;
  is_hired: boolean;
  is_in_pipeline: boolean;
}

export interface VendorStat {
  vendor: Vendor;
  submitted: number;
  in_pipeline: number;
  conversion_pct: number;
  shortlisted: number;
  hired: number;
  rank: number;
  candidates: VendorCandidateRow[];
}

type VendorLeaderboardRow = {
  source_key: string;
  submitted: number;
  in_pipeline: number;
  conversion_pct: number;
  shortlisted: number;
  hired: number;
  rank: number;
};

export function useVendorPerformanceDetail(
  sourceKey: string | null | undefined,
  startDate: string,
  endDate: string,
) {
  return useQuery<VendorCandidateRow[]>({
    queryKey: ['vendor-performance-detail', sourceKey, startDate, endDate],
    enabled: !!sourceKey && !!startDate && !!endDate,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_vendor_detail', {
        p_source_key: sourceKey,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data ?? []) as VendorCandidateRow[];
    },
  });
}

export function useVendorPerformance(
  vendors: Vendor[],
  startDate: string,
  endDate: string,
  options?: { enabled?: boolean },
) {
  const vendorSourceKeys = vendors.map(v => v.source_key);

  return useQuery<VendorStat[]>({
    queryKey: ['vendor-performance', vendorSourceKeys.join(','), startDate, endDate],
    enabled: (options?.enabled ?? true) && vendors.length > 0 && !!startDate && !!endDate,
    staleTime: 120_000,
    queryFn: async () => {
      if (!vendors.length) return [];

      const { data, error } = await supabase.rpc('get_vendor_leaderboard', {
        p_source_keys: vendorSourceKeys,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;

      const vendorByKey = new Map(vendors.map(v => [v.source_key, v]));
      const rows = (data ?? []) as VendorLeaderboardRow[];

      return rows.map(row => {
        const vendor = vendorByKey.get(row.source_key);
        if (!vendor) return null;
        return {
          vendor,
          submitted: row.submitted,
          in_pipeline: row.in_pipeline,
          conversion_pct: row.conversion_pct,
          shortlisted: row.shortlisted,
          hired: row.hired,
          rank: row.rank,
          candidates: [],
        };
      }).filter((s): s is VendorStat => s !== null);
    },
  });
}
