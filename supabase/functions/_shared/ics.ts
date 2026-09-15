/** RFC 5545 calendar invite. Pure TS — no Deno APIs — so Vitest can import it. */

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

const DEFAULT_TZ = "Asia/Kolkata";

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

/**
 * Asia/Kolkata has no DST (UTC+05:30). A minimal VTIMEZONE block is enough
 * for Outlook / Google to place the event in IST instead of the viewer's guess.
 */
function asiaKolkataVtimezone(): string[] {
  return [
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Kolkata",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

export function interviewIcsUid(interviewId: string): string {
  return `interview-${interviewId}@thetalentapp.io`;
}

export function buildIcsCalendar(input: IcsEventInput): string {
  const method = input.method ?? "REQUEST";
  const tz = input.timezone ?? DEFAULT_TZ;
  const sequence = Number.isFinite(input.sequence) ? Math.max(0, Math.floor(input.sequence as number)) : 0;
  const now = formatIcsUtc(new Date());
  const dtStart = formatIcsLocal(input.start, tz);
  const dtEnd = formatIcsLocal(input.end, tz);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//The Talent App//Interview//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...asiaKolkataVtimezone(),
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${tz}:${dtStart}`,
    `DTEND;TZID=${tz}:${dtEnd}`,
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
