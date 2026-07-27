import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins plain class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b')
  })

  it('merges conflicting tailwind classes, keeping the last one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('resolves conflicts introduced via conditional objects', () => {
    expect(cn('text-red-500', { 'text-blue-500': true })).toBe('text-blue-500')
  })

  it('supports arrays of class values', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })

  it('returns an empty string for no meaningful input', () => {
    expect(cn()).toBe('')
    expect(cn(false, undefined, null)).toBe('')
  })
})
