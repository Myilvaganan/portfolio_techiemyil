const STORAGE_KEY = 'vault-custom-categories'

export function getCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function addCustomCategory(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    const existing = getCustomCategories()
    if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, trimmed]))
  } catch {
    // localStorage unavailable (e.g. private mode) — the category still works
    // once a file is uploaded, since it'll be derived from the real S3 tag.
  }
}
