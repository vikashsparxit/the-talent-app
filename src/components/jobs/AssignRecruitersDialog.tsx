import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserPlus, Trash2, Loader2, Crown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AssignRecruitersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
}

interface RecruiterAssignment {
  id: string;
  recruiter_user_id: string;
  is_primary: boolean;
  created_at: string;
  profile?: { full_name: string; email: string };
}

function displayName(fullName: string | null | undefined, email: string | null | undefined): string {
  const name = (fullName || '').trim();
  if (name && !name.includes('@')) return name;
  if (email && email.includes('@')) return email.split('@')[0];
  return '—';
}

export function AssignRecruitersDialog({ open, onOpenChange, jobId, jobTitle }: AssignRecruitersDialogProps) {
  const [assignments, setAssignments] = useState<RecruiterAssignment[]>([]);
  const [availableRecruiters, setAvailableRecruiters] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [selectedRecruiter, setSelectedRecruiter] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);

    const { data: assigned } = await supabase
      .from('job_recruiters')
      .select('id, recruiter_user_id, is_primary, created_at')
      .eq('job_id', jobId)
      .order('created_at');

    const { data: recruiters } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['recruiter', 'hr', 'admin']);

    const recruiterIds = [...new Set((recruiters || []).map(r => r.user_id))];
    const assignedIds = ((assigned || []) as any[]).map((a: any) => a.recruiter_user_id);
    const allIds = [...new Set([...recruiterIds, ...assignedIds])];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', allIds.length > 0 ? allIds : ['none']);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    setAssignments(((assigned || []) as any[]).map((a: any) => ({
      id: a.id,
      recruiter_user_id: a.recruiter_user_id,
      is_primary: a.is_primary ?? false,
      created_at: a.created_at,
      profile: profileMap.get(a.recruiter_user_id),
    })));

    setAvailableRecruiters(
      recruiterIds
        .filter(uid => !assignedIds.includes(uid))
        .map(uid => {
          const p = profileMap.get(uid);
          return {
            user_id: uid,
            full_name: displayName(p?.full_name, p?.email),
            email: p?.email || '—',
          };
        })
    );

    setSelectedRecruiter('');
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchData();
  }, [open, jobId]);

  const handleAssign = async () => {
    if (!selectedRecruiter) return;
    setAdding(true);
    const hasPrimary = assignments.some(a => a.is_primary);
    const { error } = await supabase
      .from('job_recruiters')
      .insert({
        job_id: jobId,
        recruiter_user_id: selectedRecruiter,
        assigned_by: (await supabase.auth.getUser()).data.user?.id,
        is_primary: !hasPrimary, // first assigned becomes primary
      } as any);

    if (error) {
      toast.error('Failed to assign recruiter');
    } else {
      toast.success(hasPrimary ? 'Recruiter assigned' : 'Recruiter assigned as primary');
      setSelectedRecruiter('');
      await fetchData();
    }
    setAdding(false);
  };

  const handleRemove = async (assignment: RecruiterAssignment) => {
    const { error } = await supabase.from('job_recruiters').delete().eq('id', assignment.id);
    if (error) {
      toast.error('Failed to remove recruiter');
      return;
    }
    // If we removed the primary, promote the earliest remaining
    if (assignment.is_primary) {
      const remaining = assignments.filter(a => a.id !== assignment.id);
      if (remaining.length > 0) {
        await supabase.from('job_recruiters').update({ is_primary: true } as any).eq('id', remaining[0].id);
      }
    }
    toast.success('Recruiter removed');
    await fetchData();
  };

  const handleSetPrimary = async (assignment: RecruiterAssignment) => {
    if (assignment.is_primary) return;
    setTogglingId(assignment.id);
    // Unset all, then set this one
    for (const a of assignments) {
      await supabase.from('job_recruiters').update({ is_primary: a.id === assignment.id } as any).eq('id', a.id);
    }
    toast.success(`${displayName(assignment.profile?.full_name, assignment.profile?.email)} set as primary recruiter`);
    await fetchData();
    setTogglingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl min-w-0 sm:min-w-[420px] bg-background border shadow-lg overflow-hidden flex flex-col max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>Assign Recruiters</DialogTitle>
          <DialogDescription>
            Manage recruiters assigned to <strong>{jobTitle}</strong>. The first assigned becomes primary. Click the crown to change primary.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {availableRecruiters.length > 0 && (
              <div className="flex gap-2">
                <Select value={selectedRecruiter} onValueChange={setSelectedRecruiter}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a recruiter to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRecruiters.map(r => (
                      <SelectItem key={r.user_id} value={r.user_id}>
                        {r.full_name} — {r.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAssign} disabled={!selectedRecruiter || adding} size="sm">
                  <UserPlus className="h-4 w-4 mr-1" />
                  {adding ? 'Adding...' : 'Assign'}
                </Button>
              </div>
            )}

            {availableRecruiters.length === 0 && assignments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recruiters available. Assign the "Recruiter" role to users in Settings first.
              </p>
            )}

            {assignments.length > 0 && (
              <div className="border rounded-lg overflow-x-auto bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Recruiter</TableHead>
                      <TableHead className="min-w-[180px]">Email</TableHead>
                      <TableHead className="w-24">Role</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{displayName(a.profile?.full_name, a.profile?.email)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.profile?.email || '—'}</TableCell>
                        <TableCell>
                          {a.is_primary ? (
                            <Badge className="gap-1 text-xs bg-amber-500/15 text-amber-700 border-amber-300 hover:bg-amber-500/20">
                              <Crown className="h-3 w-3 fill-amber-500 text-amber-500" />
                              Primary
                            </Badge>
                          ) : (
                            <button
                              className="text-xs text-muted-foreground hover:text-amber-500 transition-colors flex items-center gap-1 disabled:opacity-50"
                              onClick={() => handleSetPrimary(a)}
                              disabled={!!togglingId}
                              title="Set as primary recruiter"
                            >
                              <Crown className="h-3 w-3" />
                              Set primary
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleRemove(a)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {assignments.length === 0 && availableRecruiters.length > 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">No recruiters assigned yet.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
