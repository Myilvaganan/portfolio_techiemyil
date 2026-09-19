import type { InstrumentId } from './margin'

const TIMEOUT_MS = 5000

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  return res.json()
}

// Each source can fail independently (rate limits, CORS, defunct endpoint), so
// every fetcher returns null instead of throwing and the UI falls back to the
// instrument's estimated price.
const SOURCES: Record<InstrumentId, () => Promise<number | null>> = {
  BITCOIN: async () => {
    const d = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
    return d?.bitcoin?.usd ?? null
  },
  XAUUSD: async () => {
    const d = await getJson('https://api.metals.live/v1/spot/gold')
    const p = typeof d === 'number' ? d : (d?.price ?? d?.gold ?? null)
    return p > 100 ? p : null
  },
  US30: async () => {
    const d = await getJson('https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EDJI')
    const p = d?.quoteResponse?.result?.[0]?.regularMarketPrice
    return p > 1000 ? p : null
  },
}

export async function fetchLivePrices(): Promise<Partial<Record<InstrumentId, number>>> {
  const ids = Object.keys(SOURCES) as InstrumentId[]
  const results = await Promise.all(ids.map((id) => SOURCES[id]().catch(() => null)))
  const prices: Partial<Record<InstrumentId, number>> = {}
  ids.forEach((id, i) => {
    const price = results[i]
    if (typeof price === 'number' && Number.isFinite(price)) prices[id] = price
  })
  return prices
}

// Two independent providers so one outage doesn't leave the rate stale.
const USD_INR_SOURCES: Array<() => Promise<number | null>> = [
  async () => (await getJson('https://open.er-api.com/v6/latest/USD'))?.rates?.INR ?? null,
  async () => (await getJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR'))?.rates?.INR ?? null,
]

export async function fetchUsdInr(): Promise<number | null> {
  for (const source of USD_INR_SOURCES) {
    try {
      const rate = await source()
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) return rate
    } catch {
      // try the next provider
    }
  }
  return null
}
