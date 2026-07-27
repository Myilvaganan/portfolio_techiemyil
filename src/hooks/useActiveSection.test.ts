import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useActiveSection } from './useActiveSection'

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  observed: Element[] = []
  disconnected = false

  constructor(private callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this)
  }

  observe(el: Element) {
    this.observed.push(el)
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  emit(entries: Array<Partial<IntersectionObserverEntry> & { target: Element }>) {
    this.callback(entries as IntersectionObserverEntry[], this)
  }
}

function addSection(id: string) {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)
  return el
}

describe('useActiveSection', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to the first section id before any intersection is observed', () => {
    addSection('about')
    addSection('skills')
    const { result } = renderHook(() => useActiveSection(['about', 'skills']))
    expect(result.current).toBe('about')
  })

  it('updates the active id to the most-intersecting visible section', () => {
    const about = addSection('about')
    const skills = addSection('skills')
    const { result } = renderHook(() => useActiveSection(['about', 'skills']))

    const observer = MockIntersectionObserver.instances[0]
    act(() => {
      observer.emit([
        { target: about, isIntersecting: true, intersectionRatio: 0.3 },
        { target: skills, isIntersecting: true, intersectionRatio: 0.8 },
      ])
    })

    expect(result.current).toBe('skills')
  })

  it('ignores entries that are not intersecting', () => {
    const about = addSection('about')
    const skills = addSection('skills')
    const { result } = renderHook(() => useActiveSection(['about', 'skills']))

    const observer = MockIntersectionObserver.instances[0]
    act(() => {
      observer.emit([
        { target: about, isIntersecting: false, intersectionRatio: 0.9 },
        { target: skills, isIntersecting: true, intersectionRatio: 0.2 },
      ])
    })

    expect(result.current).toBe('skills')
  })

  it('only observes section ids that exist in the DOM', () => {
    addSection('about')
    renderHook(() => useActiveSection(['about', 'missing']))
    const observer = MockIntersectionObserver.instances[0]
    expect(observer.observed).toHaveLength(1)
  })

  it('does not create an observer when none of the sections exist', () => {
    renderHook(() => useActiveSection(['nowhere']))
    expect(MockIntersectionObserver.instances[0]?.observed ?? []).toHaveLength(0)
  })

  it('disconnects the observer on unmount', () => {
    addSection('about')
    const { unmount } = renderHook(() => useActiveSection(['about']))
    const observer = MockIntersectionObserver.instances[0]
    unmount()
    expect(observer.disconnected).toBe(true)
  })
})
