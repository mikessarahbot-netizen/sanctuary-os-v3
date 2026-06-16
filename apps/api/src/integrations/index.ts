import { z } from "zod";

export const IntegrationVendorSchema = z.enum([
  "auth0",
  "ccli",
  "claude",
  "songselect",
  "storage",
  "twilio",
  "whisper"
]);

export const IntegrationFailureSchema = z.object({
  retryable: z.boolean(),
  safeMessage: z.string().min(1),
  vendor: IntegrationVendorSchema
});

export type IntegrationVendor = z.infer<typeof IntegrationVendorSchema>;
export type IntegrationFailure = z.infer<typeof IntegrationFailureSchema>;

export interface IntegrationAdapter {
  readonly vendor: IntegrationVendor;
  readonly healthCheck: () => Promise<"available" | "degraded" | "unavailable">;
}
