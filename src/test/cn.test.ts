import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

// Guards the class merging used by every shadcn/ui component after the
// Tailwind CSS v4 / tailwind-merge v3 upgrade (renamed utilities, custom tokens).
describe('cn (tailwind-merge)', () => {
  it('lets later utilities win within a group', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('bg-primary', 'bg-destructive')).toBe('bg-destructive');
  });

  it('understands Tailwind v4 utility names', () => {
    expect(cn('shadow-xs', 'shadow-none')).toBe('shadow-none');
    expect(cn('outline-hidden', 'outline-solid')).toBe('outline-solid');
    expect(cn('rounded-xs', 'rounded-lg')).toBe('rounded-lg');
    expect(cn('w-(--sidebar-width)', 'w-full')).toBe('w-full');
    expect(cn('z-60', 'z-70')).toBe('z-70');
  });

  it('keeps the custom design tokens in their own groups', () => {
    expect(cn('text-body', 'text-muted-foreground')).toBe('text-body text-muted-foreground');
    expect(cn('text-body', 'text-caption')).toBe('text-caption');
    expect(cn('shadow-border', 'shadow-popover')).toBe('shadow-popover');
    expect(cn('rounded-card', 'rounded-control')).toBe('rounded-control');
    expect(cn('duration-fast', 'duration-slow')).toBe('duration-slow');
    expect(cn('ease-drawer', 'ease-icon')).toBe('ease-icon');
  });

  it('drops falsy values', () => {
    expect(cn('flex', false, null, undefined, 'gap-2')).toBe('flex gap-2');
  });
});
