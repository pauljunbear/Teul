/** Resolve only after commit. Validation and other asynchronous work belong outside this callback. */
export function indexedDbTransaction<T>(
  database: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction, finish: (result: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(stores, mode);
    let result: T;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local storage transaction aborted.'));
    try {
      run(transaction, value => {
        result = value;
      });
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}
