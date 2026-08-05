/** Media type mandated by RFC 7807 for a problem document. */
export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';

/** RFC 7807 §4.2 — "no problem type beyond the status code". */
export const DEFAULT_PROBLEM_TYPE = 'about:blank';

/**
 * The single error payload every endpoint returns (OD-2 — replaces the legacy
 * `{ success, response, code, memory_usage }` envelope, which answered HTTP 200
 * even for failures). Members are RFC 7807's; `errors` is the one extension member.
 */
export interface ProblemDetails {
  /** URI identifying the problem type; `about:blank` when the status code says it all. */
  type: string;
  /** Short human-readable summary of the problem type — the HTTP status phrase. */
  title: string;
  /** The HTTP status code, repeated in the body (RFC 7807 §3.1). */
  status: number;
  /** Human-readable explanation specific to this occurrence. */
  detail: string;
  /** URI reference identifying this occurrence — the request path. */
  instance: string;
  /** Extension member: per-constraint validation messages. Present only on validation failures. */
  errors?: string[];
}
