export const CAREER_START_DATE = new Date('2018-08-01')

export interface ExperienceDuration {
  years: number
  months: number
}

export function getExperienceDuration(
  startDate: Date = CAREER_START_DATE,
  endDate: Date = new Date()
): ExperienceDuration {
  let totalMonths =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())

  if (endDate.getDate() < startDate.getDate()) totalMonths -= 1
  totalMonths = Math.max(totalMonths, 0)

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 }
}

export function getYearsOfExperience(startDate?: Date, endDate?: Date): number {
  return getExperienceDuration(startDate, endDate).years
}

export function formatExperienceDuration({ years, months }: ExperienceDuration): string {
  const yearsPart = years > 0 ? `${years} ${years === 1 ? 'year' : 'years'}` : ''
  const monthsPart = months > 0 ? `${months} ${months === 1 ? 'month' : 'months'}` : ''

  if (yearsPart && monthsPart) return `${yearsPart} ${monthsPart}`
  return yearsPart || monthsPart || '0 months'
}
