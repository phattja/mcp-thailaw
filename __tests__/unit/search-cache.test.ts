#!/usr/bin/env tsx

/**
 * Unit Tests: search-cache.ts
 *
 * Tests for Thai-law search result caching functionality
 */

import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { SearchCache, searchCache } from '../../src/search-cache.js';
import { testFunction, createTestResults, printTestSummary } from '../helpers/test-utils.js';

const results = createTestResults();

async function withControlledClock(
  fn: (advance: (ms: number) => void) => void | Promise<void>,
): Promise<void> {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await fn((ms) => { now += ms; });
  } finally {
    Date.now = realNow;
  }
}

async function runTests() {
  console.log('🧪 Testing: search-cache.ts\n');

  await testFunction('SearchCache set/get returns the stored result', () => {
    const testCache = new SearchCache(1000, 10);

    testCache.set('search_krisdika', { query: 'test' }, 'stored result');

    assert.equal(testCache.get('search_krisdika', { query: 'test' }), 'stored result');
  }, results);

  await testFunction('SearchCache get increments hitCount', () => {
    const testCache = new SearchCache(1000, 10);

    testCache.set('search_krisdika', { query: 'popular' }, 'popular result');
    assert.equal(testCache.get('search_krisdika', { query: 'popular' }), 'popular result');
    assert.equal(testCache.get('search_krisdika', { query: 'popular' }), 'popular result');

    const stats = testCache.getStats();
    assert.equal(stats.entries[0].hitCount, 2);
  }, results);

  await testFunction('SearchCache expires entries after TTL', () => withControlledClock((advance) => {
    const testCache = new SearchCache(50, 10);

    testCache.set('search_krisdika', { query: 'short lived' }, 'expired result');
    assert.equal(testCache.get('search_krisdika', { query: 'short lived' }), 'expired result');

    advance(51);

    assert.equal(testCache.get('search_krisdika', { query: 'short lived' }), null);
    assert.equal(testCache.getStats().size, 0);
  }), results);

  await testFunction('SearchCache evicts the lowest-hitCount entry when maxEntries is reached', () => {
    const testCache = new SearchCache(1000, 2);

    testCache.set('search_krisdika', { query: 'popular' }, 'popular result');
    testCache.set('search_krisdika', { query: 'cold' }, 'cold result');
    assert.equal(testCache.get('search_krisdika', { query: 'popular' }), 'popular result');

    testCache.set('search_krisdika', { query: 'new' }, 'new result');

    assert.equal(testCache.get('search_krisdika', { query: 'popular' }), 'popular result');
    assert.equal(testCache.get('search_krisdika', { query: 'cold' }), null);
    assert.equal(testCache.get('search_krisdika', { query: 'new' }), 'new result');
    assert.equal(testCache.getStats().size, 2);
  }, results);

  await testFunction('SearchCache evicts oldest entry when hitCounts are tied', () => withControlledClock((advance) => {
    const testCache = new SearchCache(1000, 2);

    testCache.set('search_krisdika', { query: 'oldest' }, 'oldest result');
    advance(10);
    testCache.set('search_krisdika', { query: 'newer' }, 'newer result');
    advance(10);
    testCache.set('search_krisdika', { query: 'newest' }, 'newest result');

    assert.equal(testCache.get('search_krisdika', { query: 'oldest' }), null);
    assert.equal(testCache.get('search_krisdika', { query: 'newer' }), 'newer result');
    assert.equal(testCache.get('search_krisdika', { query: 'newest' }), 'newest result');
  }), results);

  await testFunction('SearchCache purges expired entries before LFU-evicting a live one', () => withControlledClock((advance) => {
    const testCache = new SearchCache(100, 2);

    // Expired entry with a high hitCount — LFU alone would keep it and evict a fresh one.
    testCache.set('search_krisdika', { query: 'expired popular' }, 'stale result');
    testCache.get('search_krisdika', { query: 'expired popular' });
    testCache.get('search_krisdika', { query: 'expired popular' });

    advance(101);

    testCache.set('search_krisdika', { query: 'fresh one' }, 'fresh one result');
    testCache.set('search_krisdika', { query: 'fresh two' }, 'fresh two result');

    assert.equal(testCache.get('search_krisdika', { query: 'expired popular' }), null);
    assert.equal(testCache.get('search_krisdika', { query: 'fresh one' }), 'fresh one result');
    assert.equal(testCache.get('search_krisdika', { query: 'fresh two' }), 'fresh two result');
    assert.equal(testCache.getStats().size, 2);
  }), results);

  await testFunction('SearchCache normalizes arg order so equivalent args hit the same entry', () => {
    const testCache = new SearchCache(1000, 10);

    testCache.set('search_krisdika', {
      query: 'ordered',
      filters: { engines: 'google,ddg', categories: 'general' },
      options: [{ name: 'first', enabled: true }],
    }, 'ordered result');

    assert.equal(testCache.get('search_krisdika', {
      options: [{ enabled: true, name: 'first' }],
      filters: { categories: 'general', engines: 'google,ddg' },
      query: 'ordered',
    }), 'ordered result');
  }, results);

  await testFunction('SearchCache falls back to defaults for invalid env values', () => {
    const previousTtl = process.env.SEARCH_CACHE_TTL_MS;
    const previousMaxEntries = process.env.SEARCH_CACHE_MAX_ENTRIES;
    process.env.SEARCH_CACHE_TTL_MS = 'not-a-number';
    process.env.SEARCH_CACHE_MAX_ENTRIES = '0';

    const testCache = new SearchCache();

    try {
      assert.equal((testCache as any).ttlMs, 86400000);
      assert.equal((testCache as any).maxEntries, 200);
    } finally {
      if (previousTtl === undefined) {
        delete process.env.SEARCH_CACHE_TTL_MS;
      } else {
        process.env.SEARCH_CACHE_TTL_MS = previousTtl;
      }
      if (previousMaxEntries === undefined) {
        delete process.env.SEARCH_CACHE_MAX_ENTRIES;
      } else {
        process.env.SEARCH_CACHE_MAX_ENTRIES = previousMaxEntries;
      }
    }
  }, results);

  await testFunction('SearchCache rejects a numeric prefix with a suffix in SEARCH_CACHE_TTL_MS', () => {
    const previousTtl = process.env.SEARCH_CACHE_TTL_MS;
    process.env.SEARCH_CACHE_TTL_MS = '500x';
    const testCache = new SearchCache();

    try {
      assert.equal((testCache as any).ttlMs, 86400000);
    } finally {
      if (previousTtl === undefined) {
        delete process.env.SEARCH_CACHE_TTL_MS;
      } else {
        process.env.SEARCH_CACHE_TTL_MS = previousTtl;
      }
    }
  }, results);

  await testFunction('Global search cache instance', () => {
    searchCache.clear();

    searchCache.set('search_krisdika', { query: 'global' }, 'global result');
    assert.equal(searchCache.get('search_krisdika', { query: 'global' }), 'global result');

    searchCache.clear();
  }, results);

  printTestSummary(results, 'Search Cache Module');
  return results;
}

// Run if executed directly
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(console.error);
}

export { runTests };
