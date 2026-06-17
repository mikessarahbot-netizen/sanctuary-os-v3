import { z } from "zod";
import { ApiRoleSchema, AuthenticatedActorSchema, type AuthenticatedActor } from "@sanctuary-os/api";

/**
 * Runtime configuration for the desktop Play replay sidecar, parsed from an
 * injected environment record (so it is testable without `process.env`). It
 * carries the GraphQL endpoint, auth token, local SQLite file path, replay
 * interval/policy, and the operator's tenant/actor identity. The token is read
 * but never logged; nothing here is committed.
 */
const ENV_KEYS = {
  actorId: "SANCTUARY_OS_PLAY_ACTOR_ID",
  actorRoles: "SANCTUARY_OS_PLAY_ACTOR_ROLES",
  authToken: "SANCTUARY_OS_PLAY_AUTH_TOKEN",
  backoffBaseSeconds: "SANCTUARY_OS_PLAY_REPLAY_BACKOFF_BASE_SECONDS",
  backoffCapSeconds: "SANCTUARY_OS_PLAY_REPLAY_BACKOFF_CAP_SECONDS",
  backoffMultiplier: "SANCTUARY_OS_PLAY_REPLAY_BACKOFF_MULTIPLIER",
  graphqlEndpoint: "SANCTUARY_OS_PLAY_GRAPHQL_ENDPOINT",
  intervalMs: "SANCTUARY_OS_PLAY_REPLAY_INTERVAL_MS",
  maxAttempts: "SANCTUARY_OS_PLAY_REPLAY_MAX_ATTEMPTS",
  requestIdHeaderName: "SANCTUARY_OS_PLAY_REQUEST_ID_HEADER",
  sqliteFilePath: "SANCTUARY_OS_PLAY_SQLITE_PATH",
  tenantId: "SANCTUARY_OS_PLAY_TENANT_ID"
} as const;

export interface PlayDesktopReplayPolicyConfig {
  readonly backoffBaseSeconds: number;
  readonly backoffCapSeconds: number;
  readonly backoffMultiplier: number;
  readonly maxAttempts: number;
}

export interface PlayDesktopSidecarConfig {
  readonly actor: AuthenticatedActor;
  readonly authToken: string;
  readonly graphqlEndpoint: string;
  readonly intervalMs: number;
  readonly policy: PlayDesktopReplayPolicyConfig;
  readonly requestIdHeaderName?: string;
  readonly sqliteFilePath: string;
}

const RolesSchema = z
  .string()
  .min(1)
  .transform((value) => value.split(",").map((role) => role.trim()).filter((role) => role.length > 0))
  .pipe(z.array(ApiRoleSchema).min(1));

const SidecarEnvSchema = z
  .object({
    actorId: z.string().min(1),
    actorRoles: RolesSchema,
    authToken: z.string().min(1),
    backoffBaseSeconds: z.coerce.number().positive(),
    backoffCapSeconds: z.coerce.number().positive(),
    backoffMultiplier: z.coerce.number().min(1),
    graphqlEndpoint: z.string().url(),
    intervalMs: z.coerce.number().int().positive(),
    maxAttempts: z.coerce.number().int().positive(),
    requestIdHeaderName: z.string().min(1).optional(),
    sqliteFilePath: z.string().min(1),
    tenantId: z.string().min(1)
  })
  .strict()
  .superRefine((env, context) => {
    if (env.backoffCapSeconds < env.backoffBaseSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay backoff cap must be greater than or equal to the base delay.",
        path: ["backoffCapSeconds"]
      });
    }
  });

export const parsePlayDesktopSidecarConfig = (
  env: Readonly<Record<string, string | undefined>>
): PlayDesktopSidecarConfig => {
  const parsed = SidecarEnvSchema.parse({
    actorId: env[ENV_KEYS.actorId],
    actorRoles: env[ENV_KEYS.actorRoles],
    authToken: env[ENV_KEYS.authToken],
    backoffBaseSeconds: env[ENV_KEYS.backoffBaseSeconds],
    backoffCapSeconds: env[ENV_KEYS.backoffCapSeconds],
    backoffMultiplier: env[ENV_KEYS.backoffMultiplier],
    graphqlEndpoint: env[ENV_KEYS.graphqlEndpoint],
    intervalMs: env[ENV_KEYS.intervalMs],
    maxAttempts: env[ENV_KEYS.maxAttempts],
    requestIdHeaderName: env[ENV_KEYS.requestIdHeaderName],
    sqliteFilePath: env[ENV_KEYS.sqliteFilePath],
    tenantId: env[ENV_KEYS.tenantId]
  });

  const actor = AuthenticatedActorSchema.parse({
    actorId: parsed.actorId,
    roles: parsed.actorRoles,
    tenantId: parsed.tenantId
  });

  return {
    actor,
    authToken: parsed.authToken,
    graphqlEndpoint: parsed.graphqlEndpoint,
    intervalMs: parsed.intervalMs,
    policy: {
      backoffBaseSeconds: parsed.backoffBaseSeconds,
      backoffCapSeconds: parsed.backoffCapSeconds,
      backoffMultiplier: parsed.backoffMultiplier,
      maxAttempts: parsed.maxAttempts
    },
    sqliteFilePath: parsed.sqliteFilePath,
    ...(parsed.requestIdHeaderName !== undefined
      ? { requestIdHeaderName: parsed.requestIdHeaderName }
      : {})
  };
};
