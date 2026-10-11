import { supabase } from '@/integrations/supabase/client';
import { toJson } from '@/lib/utils';

// Only these events are reported by the client. Decisions and role changes are
// recorded by database triggers, and insert_audit_log() rejects anything else.
export type AuditEntityType = 'candidate' | 'interview';
export type AuditAction = 'candidate.updated' | 'interview.scheduled';

export interface AuditLogPayload {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** Best-effort append-only audit write. Failures are logged, not thrown to callers. */
export async function writeAuditLog(payload: AuditLogPayload): Promise<void> {
  try {
    const { error } = await supabase.rpc('insert_audit_log', {
      _action: payload.action,
      _entity_type: payload.entityType,
      _entity_id: payload.entityId,
      _before_data: toJson(payload.before ?? null),
      _after_data: toJson(payload.after ?? null),
    });
    if (error) {
      console.warn('audit_log insert failed:', error.message);
    }
  } catch (err) {
    console.warn('audit_log insert error:', err);
  }
}
