// Public Jobs API (v1): routing, query parsing and response shaping.
// No Deno APIs or remote imports here, so the vitest suite
// (src/test/publicJobs.test.ts) can import it directly.

import { HttpError } from "./errors.ts";

export const API_VERSION = "v1";

/** Columns read from public.jobs. Salary, openings, assessment and internal fields are never selected. */
export const PUBLIC_JOB_COLUMNS =
  "id, title, description, domain, department, location, job_type, experience_level, experience_years_range, required_skills, application_deadline, created_at, updated_at";

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance"] as const;
export const EXPERIENCE_LEVELS = ["entry", "mid", "senior", "lead", "executive"] as const;

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const MAX_OFFSET = 10_000;
const MAX_FILTER_LENGTH = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JobRow {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  department: string | null;
  location: string | null;
  job_type: string | null;
  experience_level: string | null;
  experience_years_range: string | null;
  required_skills: unknown;
  application_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicJob {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  experience_level: string | null;
  experience_years: string | null;
  skills: string[];
  application_deadline: string | null;
  posted_at: string;
  updated_at: string;
  url: string | null;
  apply_url: string | null;
}

export type Route =
  | { kind: "list" }
  | { kind: "job"; id: string }
  | { kind: "openapi" }
  | { kind: "not_found" };

/** Resolve the path below the function name, e.g. /functions/v1/public-jobs/<id>. */
export function parseRoute(pathname: string): Route {
  const segments = pathname.split("/").filter(Boolean);
  const at = segments.indexOf("public-jobs");
  const rest = at >= 0 ? segments.slice(at + 1) : segments;

  if (rest.length === 0) return { kind: "list" };
  if (rest.length === 1 && rest[0] === "openapi.json") return { kind: "openapi" };
  if (rest.length === 1 && UUID.test(rest[0])) return { kind: "job", id: rest[0].toLowerCase() };
  if (rest.length === 1) throw new HttpError(400, "Job id must be a UUID");
  return { kind: "not_found" };
}

export interface ListQuery {
  limit: number;
  offset: number;
  department?: string;
  domain?: string;
  location?: string;
  employmentType?: string;
  experienceLevel?: string;
  updatedSince?: string;
}

function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new HttpError(400, `${name} must be a whole number`);
  const value = Number(raw);
  if (value < min || value > max) throw new HttpError(400, `${name} must be between ${min} and ${max}`);
  return value;
}

function textParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  if (!value) return undefined;
  if (value.length > MAX_FILTER_LENGTH) throw new HttpError(400, `${name} must be at most ${MAX_FILTER_LENGTH} characters`);
  return value;
}

function enumParam(params: URLSearchParams, name: string, allowed: readonly string[]): string | undefined {
  const value = textParam(params, name);
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) throw new HttpError(400, `${name} must be one of: ${allowed.join(", ")}`);
  return value;
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  const updatedSinceRaw = textParam(params, "updated_since");
  let updatedSince: string | undefined;
  if (updatedSinceRaw !== undefined) {
    const time = Date.parse(updatedSinceRaw);
    if (Number.isNaN(time)) throw new HttpError(400, "updated_since must be an ISO 8601 date or date-time");
    updatedSince = new Date(time).toISOString();
  }

  return {
    limit: intParam(params, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: intParam(params, "offset", 0, 0, MAX_OFFSET),
    department: textParam(params, "department"),
    domain: textParam(params, "domain"),
    location: textParam(params, "location"),
    employmentType: enumParam(params, "employment_type", EMPLOYMENT_TYPES),
    experienceLevel: enumParam(params, "experience_level", EXPERIENCE_LEVELS),
    updatedSince,
  };
}

/** Escape LIKE wildcards so a location filter matches literally. */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function toSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim());
}

export function toPublicJob(row: JobRow, appUrl: string | null): PublicJob {
  const url = appUrl ? `${appUrl.replace(/\/+$/, "")}/careers/${row.id}` : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    domain: row.domain,
    department: row.department,
    location: row.location,
    employment_type: row.job_type,
    experience_level: row.experience_level,
    experience_years: row.experience_years_range,
    skills: toSkills(row.required_skills),
    application_deadline: row.application_deadline,
    posted_at: row.created_at,
    updated_at: row.updated_at,
    url,
    apply_url: url,
  };
}

/** OpenAPI 3.1 description of this API, served at /public-jobs/openapi.json. */
export function buildOpenApi(serverUrl: string): Record<string, unknown> {
  const nullableString = { type: ["string", "null"] };
  const error = {
    description: "Error",
    content: {
      "application/json": {
        schema: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "The Talent App — Public Jobs API",
      version: API_VERSION,
      description:
        "Read-only access to open job postings, for job boards, websites and partner integrations. No authentication is required by the API itself.",
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/": {
        get: {
          operationId: "listJobs",
          summary: "List open jobs, newest first",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, maximum: MAX_OFFSET, default: 0 } },
            { name: "department", in: "query", description: "Exact match", schema: { type: "string" } },
            { name: "domain", in: "query", description: "Exact match", schema: { type: "string" } },
            { name: "location", in: "query", description: "Case-insensitive substring match", schema: { type: "string" } },
            { name: "employment_type", in: "query", schema: { type: "string", enum: [...EMPLOYMENT_TYPES] } },
            { name: "experience_level", in: "query", schema: { type: "string", enum: [...EXPERIENCE_LEVELS] } },
            { name: "updated_since", in: "query", description: "ISO 8601; only jobs updated at or after this time", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": {
              description: "A page of open jobs",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      api_version: { type: "string" },
                      data: { type: "array", items: { $ref: "#/components/schemas/Job" } },
                      pagination: {
                        type: "object",
                        properties: {
                          limit: { type: "integer" },
                          offset: { type: "integer" },
                          total: { type: "integer" },
                          has_more: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": error,
          },
        },
      },
      "/{id}": {
        get: {
          operationId: "getJob",
          summary: "Get one open job",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: {
            "200": {
              description: "The job",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { api_version: { type: "string" }, data: { $ref: "#/components/schemas/Job" } },
                  },
                },
              },
            },
            "400": error,
            "404": error,
          },
        },
      },
    },
    components: {
      schemas: {
        Job: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { ...nullableString, description: "Plain text; may contain line breaks" },
            domain: nullableString,
            department: nullableString,
            location: nullableString,
            employment_type: { type: ["string", "null"], enum: [...EMPLOYMENT_TYPES, null] },
            experience_level: { type: ["string", "null"], enum: [...EXPERIENCE_LEVELS, null] },
            experience_years: { ...nullableString, description: "Free text, e.g. \"3-5\"" },
            skills: { type: "array", items: { type: "string" } },
            application_deadline: { type: ["string", "null"], format: "date" },
            posted_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            url: { type: ["string", "null"], format: "uri", description: "Public job page on the careers site" },
            apply_url: { type: ["string", "null"], format: "uri", description: "Where candidates apply" },
          },
          required: ["id", "title", "skills", "posted_at", "updated_at"],
        },
      },
    },
  };
}
