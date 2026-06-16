import { z } from "zod";
import { DatabaseOperationContextSchema, type DatabaseOperationContext } from "./tenant-scope.js";
import type { TransactionHandle } from "./transactions.js";

const TransactionHandleSchema = z.object({
  transactionId: z.string().min(1)
});

export const RepositoryMutationIntentSchema = z.enum([
  "create",
  "update",
  "delete",
  "destructive-confirmed"
]);

export type RepositoryMutationIntent = z.infer<typeof RepositoryMutationIntentSchema>;

export const RepositoryReadOptionsSchema = z.object({
  context: DatabaseOperationContextSchema,
  transaction: TransactionHandleSchema.optional()
});

export const RepositoryWriteOptionsSchema = RepositoryReadOptionsSchema.extend({
  intent: RepositoryMutationIntentSchema
});

export interface RepositoryReadOptions {
  readonly context: DatabaseOperationContext;
  readonly transaction?: TransactionHandle;
}

export interface RepositoryWriteOptions extends RepositoryReadOptions {
  readonly intent: RepositoryMutationIntent;
}
