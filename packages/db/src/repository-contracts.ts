import { z } from "zod";
import type { DatabaseOperationContext } from "./tenant-scope.js";
import type { TransactionHandle } from "./transactions.js";

export const RepositoryMutationIntentSchema = z.enum([
  "create",
  "update",
  "delete",
  "destructive-confirmed"
]);

export type RepositoryMutationIntent = z.infer<typeof RepositoryMutationIntentSchema>;

export interface RepositoryReadOptions {
  readonly context: DatabaseOperationContext;
  readonly transaction?: TransactionHandle;
}

export interface RepositoryWriteOptions extends RepositoryReadOptions {
  readonly intent: RepositoryMutationIntent;
}
