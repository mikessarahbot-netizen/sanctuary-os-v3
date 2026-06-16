export interface TransactionHandle {
  readonly transactionId: string;
}

export interface TransactionBoundary {
  readonly runInTransaction: <Result>(
    operation: (transaction: TransactionHandle) => Promise<Result>
  ) => Promise<Result>;
}
