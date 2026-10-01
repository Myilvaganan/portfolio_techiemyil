import { useCallback, useEffect, useState } from 'react'
import { clearStoredToken, getStoredToken } from './adminAuth'

const API = import.meta.env.VITE_ADMIN_API_URL

// The growth modules' own small documents (rules, habits, deadlines, reviews, debt plan, subscription choices).
export interface GuardrailRules {
  maxLossPerTrade: number
  weeklyLossLimit: number
  maxQtyPerTrade: number
  cooldownDays: number
  checklist: string[]
}
export type HabitAuto = '' | 'no-delivery' | 'steps' | 'rules' | 'sleep'
export interface Habit {
  id: string
  name: string
  auto: HabitAuto
  target: number
}
export interface HabitsDoc {
  habits: Habit[]
  checks: Record<string, string[]>
}
export type LifeCategory = 'identity' | 'vehicle' | 'insurance' | 'tax' | 'home' | 'finance' | 'health' | 'other'
export interface LifeItem {
  id: string
  title: string
  category: LifeCategory
  dueDate: string
  repeatMonths: number
  notes: string
  done: boolean
}
export interface ReviewsDoc {
  months: Record<string, { commitment: string; notes: string; keptCommitment: boolean | null }>
}
export interface DebtDoc {
  extraPerMonth: number
  strategy: 'avalanche' | 'snowball'
}
export interface SubscriptionsDoc {
  cancelled: { key: string; date: string; yearly: number }[]
  ignored: string[]
}

export type WaterActivity = 'low' | 'moderate' | 'high'
export interface WaterDoc {
  /** 0 = use the latest weight from the Health log. */
  weightKg: number
  activity: WaterActivity
  hot: boolean
  /** 0 = use the weight-based target. */
  customMl: number
  /** The target in force, saved so the server's reminders use the same number as the page. */
  targetMl: number
  glassMl: number
  reminders: boolean
  startHour: number
  endHour: number
  /** Millilitres drunk per day. */
  logs: Record<string, number>
}

export interface GrowthDocs {
  guardrails: GuardrailRules
  habits: HabitsDoc
  'life-admin': { items: LifeItem[] }
  reviews: ReviewsDoc
  debt: DebtDoc
  subscriptions: SubscriptionsDoc
  water: WaterDoc
}
export type GrowthDoc = keyof GrowthDocs

export const EMPTY_DOCS: GrowthDocs = {
  guardrails: { maxLossPerTrade: 0, weeklyLossLimit: 0, maxQtyPerTrade: 0, cooldownDays: 0, checklist: [] },
  habits: { habits: [], checks: {} },
  'life-admin': { items: [] },
  reviews: { months: {} },
  debt: { extraPerMonth: 0, strategy: 'avalanche' },
  subscriptions: { cancelled: [], ignored: [] },
  water: { weightKg: 0, activity: 'moderate', hot: false, customMl: 0, targetMl: 0, glassMl: 250, reminders: true, startHour: 8, endHour: 21, logs: {} },
}

async function call(path: string, method = 'GET', body?: unknown) {
  const token = getStoredToken()
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) clearStoredToken()
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not reach your vault. Please try again.')
  return data
}

export const fetchDoc = async <K extends GrowthDoc>(doc: K): Promise<GrowthDocs[K]> => (await call(`/admin/growth?doc=${doc}`)).value
export const saveDoc = async <K extends GrowthDoc>(doc: K, value: GrowthDocs[K]): Promise<GrowthDocs[K]> => (await call('/admin/growth', 'POST', { doc, value })).value

/** Load one document, edit it locally, save it back. */
export function useGrowthDoc<K extends GrowthDoc>(doc: K) {
  const [value, setValue] = useState<GrowthDocs[K]>(EMPTY_DOCS[doc])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDoc(doc)
      .then((v) => !cancelled && setValue(v))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [doc])

  const save = useCallback(
    async (next: GrowthDocs[K]) => {
      setSaving(true)
      setError(null)
      const before = value
      setValue(next)
      try {
        setValue(await saveDoc(doc, next))
      } catch (e) {
        setValue(before)
        setError((e as Error).message)
      } finally {
        setSaving(false)
      }
    },
    [doc, value],
  )

  return { value, loading, saving, error, save }
}
