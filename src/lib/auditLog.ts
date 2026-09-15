import { supabase } from '@/integrations/supabase/client';

export type AuditEntityType = 'candidate' | 'interview' | 'user_role';

export interface AuditLogPayload {
  action: string;
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
      _before_data: payload.before ?? null,
      _after_data: payload.after ?? null,
      _ip: null,
    });
    if (error) {
      console.warn('audit_log insert failed:', error.message);
    }
  } catch (err) {
    console.warn('audit_log insert error:', err);
  }
}
