import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { MCP_PROXY_TRANSPORT_ERROR_CODE } from "./constants";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `McpError.data` from server `mcpProxy` `serializeProxyTransportError`. */
export function mcpProxyTransportErrorDataIndicatesUnauthorized(
  data: Record<string, unknown>,
): boolean {
  if ("upstream401" in data) {
    const snapshot = data.upstream401;
    if (snapshot != null) return true;
  }
  const status = data.httpStatus;
  return typeof status === "number" && status === 401;
}

/**
 * Whether the SDK transport already drove the OAuth flow for this failure.
 *
 * Direct SSE / StreamableHTTP transports that hold an `authProvider` call the
 * SDK's `auth()` themselves on a 401 — which runs discovery, (re-)registration,
 * and `redirectToAuthorization()` (i.e. `window.location.href = /authorize`) —
 * and then throw `UnauthorizedError`. By the time we catch it the browser is
 * already navigating to `/authorize`, so `handleAuthError` must NOT call
 * `auth()` again: a second call issues a *second* authorization request (which
 * orphans the server-side pending `/authorize` state it created) and overwrites
 * the saved PKCE `code_verifier`.
 *
 * The other auth-error shapes are NOT transport-initiated redirects, so there
 * `handleAuthError` remains the thing that starts the OAuth flow:
 *   - proxy `upstream401` `McpError` — the proxy hides the upstream 401 from the
 *     transport, so the transport never auto-auths;
 *   - post-auth 401 `StreamableHTTPError` / `SseError` — a 401 *after* a
 *     completed auth flow, where re-running `auth()` is the intended recovery.
 */
export function isTransportInitiatedAuthRedirect(error: unknown): boolean {
  return error instanceof UnauthorizedError;
}

/**
 * Whether `handleAuthError` / OAuth recovery should run for this failure.
 */
export function isConnectionAuthError(error: unknown): boolean {
  if (error instanceof SseError && error.code === 401) return true;
  if (error instanceof StreamableHTTPError && error.code === 401) return true;
  if (error instanceof UnauthorizedError) return true;

  if (
    error instanceof McpError &&
    error.code === MCP_PROXY_TRANSPORT_ERROR_CODE &&
    isPlainObject(error.data) &&
    mcpProxyTransportErrorDataIndicatesUnauthorized(error.data)
  ) {
    return true;
  }

  return false;
}
