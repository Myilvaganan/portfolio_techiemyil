export interface MyvaMessage {
  role: 'user' | 'assistant'
  content: string
}

const MYVA_API_URL = import.meta.env.VITE_MYVA_API_URL

export async function askMyva(message: string, history: MyvaMessage[] = []): Promise<string> {
  const res = await fetch(MYVA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })

  const data = await res.json().catch(() => null)

  if (!res.ok || typeof data?.reply !== 'string') {
    throw new Error(data?.error || 'MYVA is unavailable right now.')
  }

  return data.reply
}
