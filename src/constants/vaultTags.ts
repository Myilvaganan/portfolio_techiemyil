export const VAULT_TAG_PRESETS = [
  '10th',
  '12th',
  'College',
  'Personal Documents',
  'Payslips',
  'Form 16',
  'Other',
] as const

export function slugifyTag(tag: string): string {
  const slug = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'other'
}

export function tagLabel(tagSlug: string): string {
  const preset = VAULT_TAG_PRESETS.find((preset) => slugifyTag(preset) === tagSlug)
  if (preset) return preset
  return tagSlug
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}
