/**
 * Extracts the Promise type. When it is not a Promise, it is kept as is.
 * @internal
 */
export type UnwrappedPromise<T> = T extends Promise<infer U> ? U : T;
