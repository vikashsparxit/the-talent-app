import { describe, it, expect } from 'vitest';
import {
  buildIcsCalendar,
  defaultInterviewEnd,
  escapeIcsText,
  formatIcsLocal,
  interviewIcsUid,
} from '../../supabase/functions/_shared/ics.ts';

describe('interview ICS helper', () => {
  const start = new Date('2026-09-15T04:30:00.000Z'); // 10:00 IST
  const end = defaultInterviewEnd(start, 60);

  it('uses a stable UID per interview id', () => {
    expect(interviewIcsUid('abc-123')).toBe('interview-abc-123@thetalentapp.io');
  });

  it('formats civil time in Asia/Kolkata', () => {
    expect(formatIcsLocal(start, 'Asia/Kolkata')).toBe('20260915T100000');
    expect(formatIcsLocal(end, 'Asia/Kolkata')).toBe('20260915T110000');
  });

  it('emits METHOD:REQUEST with organizer, attendees, and meeting link', () => {
    const ics = buildIcsCalendar({
      uid: interviewIcsUid('iv-1'),
      title: 'Interview: Priya — Senior Engineer',
      description: 'Join: https://meet.google.com/abc-defg-hij',
      location: 'https://meet.google.com/abc-defg-hij',
      start,
      end,
      organizerEmail: 'talent@example.com',
      organizerName: 'Acme Hiring',
      attendees: [
        { email: 'panel@example.com', name: 'Ravi' },
        { email: 'priya@example.com', name: 'Priya' },
      ],
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:interview-iv-1@thetalentapp.io');
    expect(ics).toContain('DTSTART;TZID=Asia/Kolkata:20260915T100000');
    expect(ics).toContain('DTEND;TZID=Asia/Kolkata:20260915T110000');
    expect(ics).toContain('ORGANIZER;CN=Acme Hiring:mailto:talent@example.com');
    expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE;CN=Ravi:mailto:panel@example.com');
    expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE;CN=Priya:mailto:priya@example.com');
    expect(ics).toContain('LOCATION:https://meet.google.com/abc-defg-hij');
    expect(ics).toContain('DESCRIPTION:Join: https://meet.google.com/abc-defg-hij');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('escapes ICS special characters', () => {
    expect(escapeIcsText('A;B,C\nD')).toBe('A\\;B\\,C\\nD');
  });
});
