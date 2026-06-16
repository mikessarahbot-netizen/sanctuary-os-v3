import { z } from "zod";

export const ApiRoleSchema = z.enum([
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
]);

export const AuthenticatedActorSchema = z.object({
  actorId: z.string().min(1),
  tenantId: z.string().min(1),
  roles: z.array(ApiRoleSchema).min(1)
});

export type ApiRole = z.infer<typeof ApiRoleSchema>;
export type AuthenticatedActor = z.infer<typeof AuthenticatedActorSchema>;

export interface AuthBoundary {
  readonly resolveActor: (authHeader: string) => Promise<AuthenticatedActor>;
}
