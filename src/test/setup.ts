import '@testing-library/jest-dom/vitest'

// jsdom has no layout engine: report everything as visible so scroll-triggered animations settle, and make resize a no-op.
class VisibleObserver {
  private cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
  }
  observe(target: Element) {
    this.cb([{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= VisibleObserver as unknown as typeof IntersectionObserver
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver

// jsdom has no matchMedia: default to "no query matches" (narrow, desktop-less layout). Tests that care install their own.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
