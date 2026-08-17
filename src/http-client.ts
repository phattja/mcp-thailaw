/**
 * Shared fetch handle so tests can intercept outbound HTTP without
 * replacing globalThis.fetch for unrelated modules.
 */

type FetchFn = typeof fetch;

let fetchImpl: FetchFn = globalThis.fetch.bind(globalThis);

export function getFetch(): FetchFn {
  return fetchImpl;
}

export function setFetchForTesting(next?: FetchFn): void {
  fetchImpl = next ?? globalThis.fetch.bind(globalThis);
}
