/**
 * The SDK's CJS auth graph (sse.js → auth.js → pkce-challenge) can't be
 * resolved under Jest (pkce-challenge ships ESM only), so — like auth.test.ts —
 * we mock the SDK error modules. The module under test and this test import the
 * same mocked classes, so the `instanceof` checks in connectionAuthErrors stay
 * consistent. `types.js` (McpError) resolves cleanly and is left real.
 */
jest.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
jest.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SseError: class SseError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPError: class StreamableHTTPError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import {
  isConnectionAuthError,
  isTransportInitiatedAuthRedirect,
} from "../connectionAuthErrors";
import { MCP_PROXY_TRANSPORT_ERROR_CODE } from "../constants";

const proxyUpstream401Error = () =>
  new McpError(MCP_PROXY_TRANSPORT_ERROR_CODE, "proxy transport error", {
    upstream401: { status: 401 },
  });

describe("isTransportInitiatedAuthRedirect", () => {
  it("is true only for UnauthorizedError (the transport already ran auth() + redirect)", () => {
    expect(isTransportInitiatedAuthRedirect(new UnauthorizedError())).toBe(
      true,
    );
  });

  it.each([
    ["StreamableHTTPError 401 (post-auth)", new StreamableHTTPError(401, "x")],
    ["SseError 401", new SseError(401, "x")],
    ["proxy upstream401 McpError", proxyUpstream401Error()],
    ["plain Error", new Error("nope")],
    ["null", null],
  ])(
    "is false for %s — handleAuthError still drives auth() there",
    (_label, error) => {
      expect(isTransportInitiatedAuthRedirect(error)).toBe(false);
    },
  );

  it("does not narrow isConnectionAuthError: a transport redirect is still an auth error", () => {
    // The connect() catch relies on isConnectionAuthError staying true for
    // UnauthorizedError so it suppresses the error UI while navigating away.
    const err = new UnauthorizedError();
    expect(isTransportInitiatedAuthRedirect(err)).toBe(true);
    expect(isConnectionAuthError(err)).toBe(true);
  });
});

describe("isConnectionAuthError (unchanged taxonomy)", () => {
  it.each([
    ["UnauthorizedError", new UnauthorizedError(), true],
    ["StreamableHTTPError 401", new StreamableHTTPError(401, "x"), true],
    ["SseError 401", new SseError(401, "x"), true],
    ["proxy upstream401 McpError", proxyUpstream401Error(), true],
    ["StreamableHTTPError 500", new StreamableHTTPError(500, "x"), false],
    ["generic McpError", new McpError(ErrorCode.InvalidRequest, "x"), false],
    ["plain Error", new Error("x"), false],
  ])("%s → %s", (_label, error, expected) => {
    expect(isConnectionAuthError(error)).toBe(expected);
  });
});
