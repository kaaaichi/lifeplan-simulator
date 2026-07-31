// lifeplan/tests/setupTests.ts
import '@testing-library/jest-dom/vitest'

// This file is loaded as a global `setupFiles` entry for ALL test files,
// including plain `.test.ts` engine/persistence tests that run under the
// default `node` environment (no DOM). Guard the DOM-only mocks below so
// they only apply when a `.test.tsx` file has opted into jsdom via the
// `// @vitest-environment jsdom` pragma — otherwise `HTMLElement` is
// undefined and every node-environment test file fails to even load.
if (typeof HTMLElement !== 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, x: 0, y: 0, toJSON() {} }),
  })
}
