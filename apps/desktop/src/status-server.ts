import { createServer, type Server } from "node:http";
import type { PresenterDesktopReplayStatus } from "./replay-runtime.js";

/**
 * Localhost status endpoint for the desktop Presenter replay sidecar.
 *
 * The request/response adaptation is a pure function (testable without a
 * socket); the server factory wraps it with `node:http` bound to localhost. It
 * serves the queue summary as JSON on `GET <path>` so the Tauri webview can poll
 * it. CORS is permissive because the endpoint is localhost-only and exposes no
 * secret — just queue counts.
 */
export type PresenterStatusProvider = () => Promise<PresenterDesktopReplayStatus>;

const JSON_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
  "content-type": "application/json"
};

export interface PresenterStatusHttpInvocation {
  readonly method: string | undefined;
  readonly path: string | undefined;
}

export interface PresenterStatusHttpResult {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

const pathOf = (rawPath: string | undefined): string => (rawPath ?? "").split("?")[0] ?? "";

export const handlePresenterStatusHttpInvocation = async (
  getStatus: PresenterStatusProvider,
  invocation: PresenterStatusHttpInvocation,
  options: { readonly path: string }
): Promise<PresenterStatusHttpResult> => {
  if (pathOf(invocation.path) !== options.path) {
    return { body: JSON.stringify({ error: "Not found." }), headers: JSON_HEADERS, status: 404 };
  }

  if ((invocation.method ?? "").toUpperCase() !== "GET") {
    return {
      body: JSON.stringify({ error: "Method not allowed." }),
      headers: JSON_HEADERS,
      status: 405
    };
  }

  const status = await getStatus();

  return { body: JSON.stringify(status), headers: JSON_HEADERS, status: 200 };
};

export interface PresenterStatusHttpServerDependencies {
  readonly getStatus: PresenterStatusProvider;
  readonly path?: string;
}

export const createPresenterStatusHttpServer = (
  dependencies: PresenterStatusHttpServerDependencies
): Server => {
  const path = dependencies.path ?? "/status";

  return createServer((request, response) => {
    void handlePresenterStatusHttpInvocation(
      dependencies.getStatus,
      { method: request.method, path: request.url },
      { path }
    )
      .then((result) => {
        response.writeHead(result.status, result.headers);
        response.end(result.body);
      })
      .catch(() => {
        response.writeHead(500, JSON_HEADERS);
        response.end(JSON.stringify({ error: "Internal server error." }));
      });
  });
};
