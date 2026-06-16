import { z } from "zod";

export const DatabaseRuntimeSchema = z.enum(["postgresql", "sqlite"]);

export const DatabaseUrlEnvironmentVariableNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const DatabaseConnectionConfigSchema = z
  .object({
    connectionName: z.string().min(1),
    runtime: DatabaseRuntimeSchema,
    urlEnvVar: DatabaseUrlEnvironmentVariableNameSchema
  })
  .strict();

export type DatabaseRuntime = z.infer<typeof DatabaseRuntimeSchema>;
export type DatabaseUrlEnvironmentVariableName = z.infer<
  typeof DatabaseUrlEnvironmentVariableNameSchema
>;
export type DatabaseConnectionConfig = z.infer<typeof DatabaseConnectionConfigSchema>;
