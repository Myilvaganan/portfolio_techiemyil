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
  /** #rrggbb; empty = a colour from the palette by position. */
  color?: string
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

export interface HouseholdDoc {
  /** Months marked paid by hand (cash, another account, or an app that doesn't show in statements). */
  manual: { id: string; group: string; month: string; amount: number }[]
}

export interface CipherBox {
  iv: string
  ct: string
}
export interface DiaryDoc {
  method: '' | 'password' | 'pattern'
  salt: string
  /** A known value encrypted with the key, to tell a wrong password from a right one. */
  check: CipherBox | null
  entries: { id: string; date: string; box: CipherBox }[]
}

export interface ProfileDoc {
  displayName: string
  fullName: string
  email: string
  phone: string
  dob: string
  city: string
  occupation: string
  bio: string
  /** A small square JPEG as a data URL; empty = the built-in photo. */
  photo: string
}

export type TaskWhen = 'today' | 'week' | 'someday'
export interface Task {
  id: string
  title: string
  when: TaskWhen
  done: boolean
  doneOn: string
  created: string
}
export interface TasksDoc {
  tasks: Task[]
  sessions: { date: string; minutes: number; task: string }[]
}
export interface GateDay {
  sleep: number
  mood: number
  rulesRead: boolean
  plan: string
  checks: number[]
}
export interface MoodDay {
  sleepH: number
  quality: number
  mood: number
  energy: number
  note: string
}
export interface Med {
  id: string
  name: string
  dose: string
  hours: number[]
  active: boolean
  /** 1 = daily, 2 = every other day, N = every N days from `start`. Ignored when `weekdays` is set. */
  every: number
  /** Days of the week it's taken (0 = Sunday); empty = use `every`. */
  weekdays: number[]
  start: string
}

/** Is this medicine due on the date? */
export function medDueOn(m: Pick<Med, 'every' | 'weekdays' | 'start'>, date: string) {
  if (m.weekdays?.length) return m.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())
  const every = m.every || 1
  if (every === 1 || !m.start) return true
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${m.start}T00:00:00Z`)) / 86_400_000)
  return days >= 0 && days % every === 0
}
export interface Person {
  id: string
  name: string
  relation: string
  kind: 'birthday' | 'anniversary' | 'memorial' | 'other'
  date: string
  star: number
  tamilMonth: number
}
export interface Receipt {
  id: string
  date: string
  merchant: string
  amount: number
  category: string
  note: string
}

export interface RemindersDoc {
  items: import('./vaccines').Reminder[]
  children: { id: string; name: string; dob: string }[]
  /** childId → vaccine code → date given */
  vaccines: Record<string, Record<string, string>>
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export interface FoodEntry {
  id: string
  date: string
  meal: Meal
  name: string
  qty: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}
export interface FoodProfile {
  sex: 'male' | 'female'
  age: number
  heightCm: number
  weightKg: number
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete'
  goal: 'lose' | 'maintain' | 'gain'
  customKcal: number
}

export interface GrowthDocs {
  guardrails: GuardrailRules
  habits: HabitsDoc
  'life-admin': { items: LifeItem[] }
  reviews: ReviewsDoc
  debt: DebtDoc
  subscriptions: SubscriptionsDoc
  water: WaterDoc
  profile: ProfileDoc
  household: HouseholdDoc
  diary: DiaryDoc
  tasks: TasksDoc
  food: { profile: FoodProfile; entries: FoodEntry[] }
  reminders: RemindersDoc
  gate: { days: Record<string, GateDay> }
  mood: { days: Record<string, MoodDay> }
  meds: { items: Med[]; taken: Record<string, string[]>; reminders: boolean }
  family: { people: Person[] }
  receipts: { items: Receipt[] }
  calendar: { place: string; rasi: number; star: number; notify: boolean }
}
export type GrowthDoc = keyof GrowthDocs

export const EMPTY_DOCS: GrowthDocs = {
  guardrails: { maxLossPerTrade: 0, weeklyLossLimit: 0, maxQtyPerTrade: 0, cooldownDays: 0, checklist: [] },
  habits: { habits: [], checks: {} },
  'life-admin': { items: [] },
  reviews: { months: {} },
  debt: { extraPerMonth: 0, strategy: 'avalanche' },
  subscriptions: { cancelled: [], ignored: [] },
  household: { manual: [] },
  tasks: { tasks: [], sessions: [] },
  food: { profile: { sex: 'male', age: 0, heightCm: 0, weightKg: 0, activity: 'light', goal: 'maintain', customKcal: 0 }, entries: [] },
  reminders: { items: [], children: [], vaccines: {} },
  gate: { days: {} },
  mood: { days: {} },
  meds: { items: [], taken: {}, reminders: true },
  family: { people: [] },
  receipts: { items: [] },
  diary: { method: '', salt: '', check: null, entries: [] },
  calendar: { place: 'Chennai', rasi: -1, star: -1, notify: true },
  profile: { displayName: '', fullName: '', email: '', phone: '', dob: '', city: '', occupation: '', bio: '', photo: '' },
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

/** Read a receipt photo (data URL) into merchant, date, amount and category. */
export const scanReceipt = async (image: string): Promise<{ merchant: string; date: string; amount: number; category: string }> => call('/admin/receipt/scan', 'POST', { image })

export type FoodItem = Omit<FoodEntry, 'id' | 'date' | 'meal'>
/** Estimate calories and macros from a description and/or a photo of a meal. */
export const estimateFood = async (o: { text?: string; image?: string }): Promise<{ items: FoodItem[] }> => call('/admin/food/estimate', 'POST', o)
