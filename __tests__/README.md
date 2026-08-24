# Test Suite Documentation

## Overview

Test suite for mcp-thailaw. Tests are organized into unit tests, integration tests, and shared helpers.

## Running Tests

```bash
npm test                    # Run all tests
npm run test:coverage       # Run with coverage report
npx tsx __tests__/unit/logging.test.ts  # Run single test file
```

## Key Testing Patterns

### Mock External Dependencies
```typescript
const fetchMocker = new FetchMocker();
fetchMocker.mock(createMockFetch({ json: { results: [] } }));
// ... test code ...
fetchMocker.restore();
```

### Manage Environment Variables
```typescript
const envManager = new EnvManager();
envManager.set("QDRANT_URL", "http://qdrant:6333");
// ... test code ...
envManager.restore();
```

### Test Error Handling
```typescript
await testFunction("Error scenario", async () => {
  try {
    await functionThatShouldFail();
    assert.fail("Should have thrown error");
  } catch (error: any) {
    assert.ok(error.message.includes("Expected error"));
  }
}, results);
```

## Adding New Tests

Create a test file following the pattern `[module-name].test.ts`, then add it to `__tests__/run-all.ts`.
