import { describe, it, expect } from 'vitest'
import {
  CAREER_START_DATE,
  formatExperienceDuration,
  getExperienceDuration,
  getYearsOfExperience,
} from './experience'

describe('getExperienceDuration', () => {
  it('returns zero duration when start and end dates are the same', () => {
    const date = new Date('2020-01-15')
    expect(getExperienceDuration(date, date)).toEqual({ years: 0, months: 0 })
  })

  it('computes whole years with no remainder months', () => {
    const start = new Date('2018-08-01')
    const end = new Date('2021-08-01')
    expect(getExperienceDuration(start, end)).toEqual({ years: 3, months: 0 })
  })

  it('computes partial years with remainder months', () => {
    const start = new Date('2018-08-01')
    const end = new Date('2021-11-01')
    expect(getExperienceDuration(start, end)).toEqual({ years: 3, months: 3 })
  })

  it('does not count a month until the day-of-month has passed', () => {
    const start = new Date('2018-08-15')
    const end = new Date('2021-11-01')
    // Nov 1 is before the 15th, so November has not fully elapsed yet.
    expect(getExperienceDuration(start, end)).toEqual({ years: 3, months: 2 })
  })

  it('counts the month once the day-of-month has passed', () => {
    const start = new Date('2018-08-15')
    const end = new Date('2021-11-20')
    expect(getExperienceDuration(start, end)).toEqual({ years: 3, months: 3 })
  })

  it('clamps negative durations to zero', () => {
    const start = new Date('2025-01-01')
    const end = new Date('2020-01-01')
    expect(getExperienceDuration(start, end)).toEqual({ years: 0, months: 0 })
  })

  it('defaults to CAREER_START_DATE and now when no arguments are given', () => {
    const result = getExperienceDuration()
    const expected = getExperienceDuration(CAREER_START_DATE, new Date())
    expect(result).toEqual(expected)
  })
})

describe('getYearsOfExperience', () => {
  it('returns only the years portion of the duration', () => {
    const start = new Date('2018-08-01')
    const end = new Date('2024-09-15')
    expect(getYearsOfExperience(start, end)).toBe(6)
  })
})

describe('formatExperienceDuration', () => {
  it('formats singular year and month', () => {
    expect(formatExperienceDuration({ years: 1, months: 1 })).toBe('1 year 1 month')
  })

  it('formats plural years and months', () => {
    expect(formatExperienceDuration({ years: 3, months: 3 })).toBe('3 years 3 months')
  })

  it('formats years only when months is zero', () => {
    expect(formatExperienceDuration({ years: 5, months: 0 })).toBe('5 years')
  })

  it('formats months only when years is zero', () => {
    expect(formatExperienceDuration({ years: 0, months: 4 })).toBe('4 months')
  })

  it('falls back to "0 months" when both are zero', () => {
    expect(formatExperienceDuration({ years: 0, months: 0 })).toBe('0 months')
  })
})
