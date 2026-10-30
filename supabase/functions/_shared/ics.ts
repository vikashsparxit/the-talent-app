/** RFC 5545 calendar invite. Pure TS — no Deno APIs — so Vitest can import it. */

import { resolveTimeZone, timeZoneOffsetMinutes } from "./timezone.ts";

export interface IcsAttendee {
  email: string;
  name?: string;
  role?: "REQ-PARTICIPANT" | "OPT-PARTICIPANT";
}

export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  organizerEmail: string;
  organizerName?: string;
  attendees?: IcsAttendee[];
  method?: "REQUEST" | "CANCEL" | "PUBLISH";
  sequence?: number;
  timezone?: string;
}

const DEFAULT_TZ = "UTC";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Local civil time in `timeZone` as YYYYMMDDTHHMMSS (no Z). */
export function formatIcsLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

export function formatIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 5545 line folding at 75 octets (approx. chars for ASCII payloads). */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length > 0) chunks.push(` ${rest}`);
  return chunks.join("\r\n");
}

function icsPersonLine(property: "ORGANIZER" | "ATTENDEE", email: string, cn?: string, extraParams: string[] = []): string {
  const params = [...extraParams];
  if (cn?.trim()) params.push(`CN=${escapeIcsText(cn.trim())}`);
  const suffix = `mailto:${email.trim()}`;
  return params.length > 0 ? `${property};${params.join(";")}:${suffix}` : `${property}:${suffix}`;
}

function formatIcsOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad2(Math.floor(abs / 60))}${pad2(abs % 60)}`;
}

function shortZoneName(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/**
 * VTIMEZONE for zones without daylight saving (e.g. Asia/Kolkata, UTC+05:30).
 * A single STANDARD block is enough for Outlook / Google to place the event.
 * Returns null for zones that observe DST; callers fall back to UTC times.
 */
function fixedOffsetVtimezone(timeZone: string, at: Date): string[] | null {
  const year = at.getUTCFullYear();
  const january = timeZoneOffsetMinutes(new Date(Date.UTC(year, 0, 1)), timeZone);
  const july = timeZoneOffsetMinutes(new Date(Date.UTC(year, 6, 1)), timeZone);
  if (january !== july || january === 0) return null;
  const offset = formatIcsOffset(january);
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${timeZone}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    `TZNAME:${shortZoneName(at, timeZone)}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

export function interviewIcsUid(interviewId: string): string {
  return `interview-${interviewId}@thetalentapp.io`;
}

export function buildIcsCalendar(input: IcsEventInput): string {
  const method = input.method ?? "REQUEST";
  const tz = resolveTimeZone(input.timezone, DEFAULT_TZ);
  const sequence = Number.isFinite(input.sequence) ? Math.max(0, Math.floor(input.sequence as number)) : 0;
  const now = formatIcsUtc(new Date());
  const vtimezone = fixedOffsetVtimezone(tz, input.start);
  // Zones with DST (and UTC itself) are written as UTC instants; calendar
  // clients convert them to each attendee's local time.
  const dtStartLine = vtimezone
    ? `DTSTART;TZID=${tz}:${formatIcsLocal(input.start, tz)}`
    : `DTSTART:${formatIcsUtc(input.start)}`;
  const dtEndLine = vtimezone
    ? `DTEND;TZID=${tz}:${formatIcsLocal(input.end, tz)}`
    : `DTEND:${formatIcsUtc(input.end)}`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//The Talent App//Interview//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...(vtimezone ?? []),
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${now}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `SEQUENCE:${sequence}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    icsPersonLine("ORGANIZER", input.organizerEmail, input.organizerName),
  ];

  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(input.description.trim())}`);
  }
  if (input.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(input.location.trim())}`);
  }

  for (const attendee of input.attendees ?? []) {
    const email = attendee.email.trim();
    if (!email) continue;
    const role = attendee.role ?? "REQ-PARTICIPANT";
    lines.push(icsPersonLine("ATTENDEE", email, attendee.name, [`ROLE=${role}`, "RSVP=TRUE"]));
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function defaultInterviewEnd(start: Date, durationMinutes = 60): Date {
  return new Date(start.getTime() + durationMinutes * 60 * 1000);
}
