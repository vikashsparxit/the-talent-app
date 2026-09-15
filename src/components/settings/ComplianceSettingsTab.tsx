import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useComplianceSettings,
  SUB_PROCESSORS,
  type ComplianceSettings,
} from '@/hooks/useSystemConfig';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function ComplianceSettingsTab() {
  const { compliance, isLoading, updateAsync, isUpdating } = useComplianceSettings();
  const [form, setForm] = useState<ComplianceSettings>(compliance);

  useEffect(() => {
    setForm(compliance);
  }, [compliance]);

  const save = async () => {
    await updateAsync(form);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading compliance settings...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          Honest compliance hooks only — no SOC 2 or ISO 27001 claims. Full DSAR/erasure queue is deferred to a later phase.
          See <code className="text-xs">docs/COMPLIANCE.md</code>.
        </AlertDescription>
      </Alert>

      <section className="space-y-4 max-w-xl">
        <div>
          <h3 className="text-sm font-medium">Privacy & legal URLs</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Shown on applicant footer and profile consent flows when configured.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="privacy-url">Privacy policy URL</Label>
          <Input
            id="privacy-url"
            type="url"
            placeholder="https://example.com/privacy"
            value={form.privacy_policy_url ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, privacy_policy_url: e.target.value || null }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="terms-url">Terms of service URL</Label>
          <Input
            id="terms-url"
            type="url"
            placeholder="https://example.com/terms"
            value={form.terms_url ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, terms_url: e.target.value || null }))}
          />
        </div>
      </section>

      <section className="space-y-4 max-w-xl border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">Grievance officer (India DPDP)</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Name and email surfaced on the applicant footer for data-subject complaints.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="grievance-name">Officer name</Label>
          <Input
            id="grievance-name"
            value={form.grievance_officer_name ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, grievance_officer_name: e.target.value || null }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grievance-email">Officer email</Label>
          <Input
            id="grievance-email"
            type="email"
            value={form.grievance_officer_email ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, grievance_officer_email: e.target.value || null }))}
          />
        </div>
        <Button onClick={save} disabled={isUpdating}>
          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save compliance settings
        </Button>
      </section>

      <section className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">Sub-processors</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Processors in use today. Deployers must maintain DPAs with each vendor. This list is informational — not a certification.
          </p>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Processor</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Location / note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SUB_PROCESSORS.map((sp) => (
                <TableRow key={sp.name}>
                  <TableCell className="text-sm font-medium">{sp.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{sp.purpose}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{sp.location}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Data residency is chosen by the deployer (Supabase region, AWS SES region). Gemini and cross-border transfers must be disclosed in your privacy policy.
        </p>
      </section>
    </div>
  );
}
