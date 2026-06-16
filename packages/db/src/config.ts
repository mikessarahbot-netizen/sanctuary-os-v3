import { z } from "zod";

export const DatabaseRuntimeSchema = z.enum(["postgresql", "sqlite"]);

export const DatabaseConnectionConfigSchema = z.object({
  connectionName: z.string().min(1),
  runtime: DatabaseRuntimeSchema,
  urlEnvVar: z.string().min(1)
});

export type DatabaseRuntime = z.infer<typeof DatabaseRuntimeSchema>;
export type DatabaseConnectionConfig = z.infer<typeof DatabaseConnectionConfigSchema>;
