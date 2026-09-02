import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MfaEnrollPanel } from '@/components/auth/MfaEnrollPanel';
import { useSsoSettings, type SsoSettings } from '@/hooks/useSystemConfig';
import { Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AuditLogRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_id: string;
}

export function SecuritySettingsTab() {
  const { sso, isLoading: ssoLoading, updateAsync, isUpdating } = useSsoSettings();
  const [form, setForm] = useState<SsoSettings>(sso);

  useEffect(() => {
    setForm(sso);
  }, [sso]);

  const auditQuery = useQuery({
    queryKey: ['audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, created_at, action, entity_type, entity_id, actor_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
  });

  const saveSso = async () => {
    await updateAsync(form);
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Two-factor authentication (TOTP)</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Protect your staff account with an authenticator app. Required at sign-in once enabled.
          </p>
        </div>
        <MfaEnrollPanel onEnrolled={() => undefined} />
      </section>

      <section className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">SAML 2.0 single sign-on</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Register IdPs via GoTrue admin API on self-hosted stacks. Enable here to show the SSO button on the login page.
            See <code className="text-xs">docs/DEVOPS_HANDOFF.md</code> for <code className="text-xs">GOTRUE_SAML_*</code> variables.
          </p>
        </div>
        {ssoLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="sso-enabled">Show SSO on login page</Label>
              <Switch
                id="sso-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sso-domain">Email domain (SP-initiated)</Label>
              <Input
                id="sso-domain"
                placeholder="company.com"
                value={form.domain ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value || null }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sso-provider-id">Provider ID (optional)</Label>
              <Input
                id="sso-provider-id"
                placeholder="UUID from GoTrue admin SSO API"
                value={form.provider_id ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, provider_id: e.target.value || null }))}
              />
            </div>
            <Button onClick={saveSso} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save SSO settings
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t pt-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Audit log</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Append-only record of candidate updates, interview schedules, and role changes. Last 50 entries.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => auditQuery.refetch()} disabled={auditQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${auditQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        {auditQuery.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {(auditQuery.error as Error).message.includes('audit_log')
                ? 'Audit log table not available yet — apply migration 20260902000001 after review.'
                : (auditQuery.error as Error).message}
            </AlertDescription>
          </Alert>
        )}
        {auditQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(auditQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">
                      No audit entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (auditQuery.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{row.action}</TableCell>
                      <TableCell className="text-xs">{row.entity_type}</TableCell>
                      <TableCell className="text-xs font-mono truncate max-w-[120px]" title={row.entity_id}>
                        {row.entity_id.slice(0, 8)}…
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
