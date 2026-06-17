import { createServer, type Server } from "node:http";
import { z } from "zod";
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

export type PresenterEntryAction = (
  queueEntryId: string
) => Promise<unknown>;

export interface PresenterActionDependencies {
  readonly cancelEntry: PresenterEntryAction;
  readonly requeueEntry: PresenterEntryAction;
}

const ActionBodySchema = z
  .object({
    action: z.enum(["requeue", "cancel"]),
    queueEntryId: z.string().min(1)
  })
  .strip();

export const handlePresenterActionHttpInvocation = async (
  dependencies: PresenterActionDependencies,
  invocation: PresenterStatusHttpInvocation & { readonly rawBody: string },
  options: { readonly path: string }
): Promise<PresenterStatusHttpResult> => {
  if (pathOf(invocation.path) !== options.path) {
    return { body: JSON.stringify({ error: "Not found." }), headers: JSON_HEADERS, status: 404 };
  }

  if ((invocation.method ?? "").toUpperCase() !== "POST") {
    return {
      body: JSON.stringify({ error: "Method not allowed." }),
      headers: JSON_HEADERS,
      status: 405
    };
  }

  let body;
  try {
    body = ActionBodySchema.parse(JSON.parse(invocation.rawBody));
  } catch {
    return { body: JSON.stringify({ error: "Invalid action body." }), headers: JSON_HEADERS, status: 400 };
  }

  try {
    if (body.action === "requeue") {
      await dependencies.requeueEntry(body.queueEntryId);
    } else {
      await dependencies.cancelEntry(body.queueEntryId);
    }

    return { body: JSON.stringify({ ok: true }), headers: JSON_HEADERS, status: 200 };
  } catch {
    return {
      body: JSON.stringify({ error: "The action could not be applied to this entry." }),
      headers: JSON_HEADERS,
      status: 409
    };
  }
};

export interface PresenterStatusHttpServerDependencies extends PresenterActionDependencies {
  readonly actionPath?: string;
  readonly getStatus: PresenterStatusProvider;
  readonly statusPath?: string;
}

export const createPresenterStatusHttpServer = (
  dependencies: PresenterStatusHttpServerDependencies
): Server => {
  const statusPath = dependencies.statusPath ?? "/status";
  const actionPath = dependencies.actionPath ?? "/actions";

  return createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const invocation = { method: request.method, path: request.url };
      const routed =
        pathOf(request.url) === actionPath
          ? handlePresenterActionHttpInvocation(dependencies, { ...invocation, rawBody }, {
              path: actionPath
            })
          : handlePresenterStatusHttpInvocation(dependencies.getStatus, invocation, {
              path: statusPath
            });

      routed
        .then((result) => {
          response.writeHead(result.status, result.headers);
          response.end(result.body);
        })
        .catch(() => {
          response.writeHead(500, JSON_HEADERS);
          response.end(JSON.stringify({ error: "Internal server error." }));
        });
    });
  });
};
