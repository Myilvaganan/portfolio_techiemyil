const RESUME_API_URL = import.meta.env.VITE_RESUME_API_URL

export async function openResume() {
  const tab = window.open('', '_blank')

  try {
    const res = await fetch(RESUME_API_URL)
    const data = await res.json()
    const url = data.body

    if (!tab) {
      window.location.href = url
      return
    }

    tab.location.href = url
  } catch {
    tab?.close()
  }
}
