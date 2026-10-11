import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Vendor {
  id: string;
  name: string;
  source_key: string;
  contact_name: string | null;
  contact_email: string | null;
  fee_pct: number | null;
  guarantee_days: number | null;
  is_active: boolean;
  created_at: string;
}

export type VendorInsert = Omit<Vendor, 'id' | 'created_at'>;
export type VendorUpdate = Partial<VendorInsert> & { id: string };

export function useVendors(activeOnly = false, options?: { enabled?: boolean }) {
  return useQuery<Vendor[]>({
    queryKey: ['vendors', activeOnly],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      let q = supabase.from('vendors').select('*').order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Vendor[];
    },
    staleTime: 60_000,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Omit<VendorInsert, 'is_active'>) => {
      const { data, error } = await supabase
        .from('vendors')
        .insert({ ...v, is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: VendorUpdate) => {
      const { data, error } = await supabase
        .from('vendors')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function toSourceKey(name: string): string {
  return 'vendor_' + name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
