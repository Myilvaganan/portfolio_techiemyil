import { useCallback } from 'react'
import { getLocale, useLocale, type Language } from './locale'

// Interface text in English and Tamil. English is the source: a key missing from Tamil falls back to English, so
// screens can be translated one at a time without anything ever showing a raw key.

const en = {
  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.ask': 'Ask My Data',
  'nav.trading': 'Trading',
  'nav.money': 'Money',
  'nav.wealth': 'Wealth & debt',
  'nav.health': 'Health',
  'nav.growth': 'Growth',
  'nav.manage': 'Manage',
  'nav.tradingJournal': 'Trading Journal',
  'nav.guardrails': 'Trading Guardrails',
  'nav.tradingLedger': 'Trading vs Life',
  'nav.optionsAnalytics': 'Options Analytics',
  'nav.zerodha': 'Zerodha Dashboard',
  'nav.margin': 'Margin Calculator',
  'nav.bank': 'Bank Statements',
  'nav.cards': 'Credit Cards',
  'nav.budgets': 'Budgets',
  'nav.cashFlow': 'Cash Flow',
  'nav.household': 'Household',
  'nav.subscriptions': 'Subscriptions',
  'nav.netWorth': 'Net Worth',
  'nav.investments': 'Investments',
  'nav.rebalance': 'Portfolio Rebalance',
  'nav.goals': 'Goals',
  'nav.loans': 'Loans',
  'nav.debtFree': 'Debt-Free Plan',
  'nav.runway': 'Runway & Stress',
  'nav.lending': 'Lending',
  'nav.tax': 'Tax Information',
  'nav.healthReport': 'Health Report',
  'nav.mindMoney': 'Mind & Money',
  'nav.healthCover': 'Health Cover',
  'nav.monthlyReview': 'Monthly Review',
  'nav.habits': 'Habits',
  'nav.water': 'Water',
  'nav.diary': 'Diary',
  'nav.tamilCalendar': 'Tamil Calendar',
  'nav.profile': 'Profile',
  'nav.lifeAdmin': 'Life Admin',
  'nav.documents': 'Document Manager',
  'nav.website': 'Website',
  'nav.security': 'Security',
  'nav.home': 'Home',
  'nav.finance': 'Finance',
  'nav.more': 'More',
  'nav.askAi': 'Ask AI',

  // Preferences
  'prefs.title': 'Region & language',
  'prefs.language': 'Language',
  'prefs.region': 'Region',
  'prefs.currency': 'Display currency',
  'prefs.currencyHint': 'Amounts are kept in rupees and converted at today’s rate.',
  'prefs.rateUnavailable': 'Rate not loaded yet — showing rupees.',

  // Common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.add': 'Add',
  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.none': 'Nothing here yet',
  'common.thisMonth': 'This month',
  'common.allTime': 'All time',
  'common.signOut': 'Sign out',
  'common.visitWebsite': 'Visit Website',
} as const

export type TKey = keyof typeof en

const ta: Partial<Record<TKey, string>> = {
  'nav.dashboard': 'டாஷ்போர்டு',
  'nav.ask': 'என் தரவைக் கேள்',
  'nav.trading': 'வர்த்தகம்',
  'nav.money': 'பணம்',
  'nav.wealth': 'செல்வம் & கடன்',
  'nav.health': 'உடல்நலம்',
  'nav.growth': 'வளர்ச்சி',
  'nav.manage': 'நிர்வாகம்',
  'nav.tradingJournal': 'வர்த்தக நாட்குறிப்பு',
  'nav.guardrails': 'வர்த்தக வரம்புகள்',
  'nav.tradingLedger': 'வர்த்தகம் vs வாழ்க்கை',
  'nav.optionsAnalytics': 'ஆப்ஷன்ஸ் பகுப்பாய்வு',
  'nav.zerodha': 'Zerodha டாஷ்போர்டு',
  'nav.margin': 'மார்ஜின் கணிப்பான்',
  'nav.bank': 'வங்கி அறிக்கைகள்',
  'nav.cards': 'கிரெடிட் கார்டுகள்',
  'nav.budgets': 'பட்ஜெட்',
  'nav.cashFlow': 'பணப்புழக்கம்',
  'nav.household': 'குடும்பச் செலவு',
  'nav.subscriptions': 'சந்தாக்கள்',
  'nav.netWorth': 'நிகர மதிப்பு',
  'nav.investments': 'முதலீடுகள்',
  'nav.rebalance': 'போர்ட்ஃபோலியோ சமநிலை',
  'nav.goals': 'இலக்குகள்',
  'nav.loans': 'கடன்கள்',
  'nav.debtFree': 'கடனில்லா திட்டம்',
  'nav.runway': 'அவசரகால இருப்பு',
  'nav.lending': 'கொடுத்த கடன்',
  'nav.tax': 'வரித் தகவல்',
  'nav.healthReport': 'உடல்நல அறிக்கை',
  'nav.mindMoney': 'மனம் & பணம்',
  'nav.healthCover': 'மருத்துவக் காப்பீடு',
  'nav.monthlyReview': 'மாதாந்திர ஆய்வு',
  'nav.habits': 'பழக்கங்கள்',
  'nav.water': 'தண்ணீர்',
  'nav.diary': 'நாட்குறிப்பு',
  'nav.tamilCalendar': 'தமிழ் நாள்காட்டி',
  'nav.profile': 'சுயவிவரம்',
  'nav.lifeAdmin': 'வாழ்க்கை நிர்வாகம்',
  'nav.documents': 'ஆவண மேலாளர்',
  'nav.website': 'இணையதளம்',
  'nav.security': 'பாதுகாப்பு',
  'nav.home': 'முகப்பு',
  'nav.finance': 'நிதி',
  'nav.more': 'மேலும்',
  'nav.askAi': 'AI-யிடம் கேள்',

  'prefs.title': 'பகுதி & மொழி',
  'prefs.language': 'மொழி',
  'prefs.region': 'பகுதி',
  'prefs.currency': 'காட்டும் நாணயம்',
  'prefs.currencyHint': 'தொகைகள் ரூபாயில் சேமிக்கப்பட்டு இன்றைய விகிதத்தில் மாற்றப்படும்.',
  'prefs.rateUnavailable': 'விகிதம் இன்னும் ஏற்றப்படவில்லை — ரூபாயில் காட்டப்படுகிறது.',

  'common.save': 'சேமி',
  'common.cancel': 'ரத்து',
  'common.edit': 'திருத்து',
  'common.delete': 'நீக்கு',
  'common.add': 'சேர்',
  'common.loading': 'ஏற்றுகிறது…',
  'common.retry': 'மீண்டும் முயல்க',
  'common.none': 'இன்னும் எதுவும் இல்லை',
  'common.thisMonth': 'இந்த மாதம்',
  'common.allTime': 'எல்லா காலமும்',
  'common.signOut': 'வெளியேறு',
  'common.visitWebsite': 'இணையதளத்தைப் பார்',
}

const DICTS: Record<Language, Partial<Record<TKey, string>>> = { en, ta }

/** Translate outside React (labels built at module load should call this at render time instead). */
export function translate(key: TKey, vars?: Record<string, string | number>, lang: Language = getLocale().language): string {
  let text = DICTS[lang][key] ?? en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
  return text
}

/** `const t = useT(); t('nav.budgets')` — re-renders when the language changes. */
export function useT() {
  const { language } = useLocale()
  return useCallback((key: TKey, vars?: Record<string, string | number>) => translate(key, vars, language), [language])
}

export const LANGUAGES: { id: Language; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'ta', label: 'Tamil', native: 'தமிழ்' },
]

type StringTable = Record<string, string | ((...args: never[]) => string)>

/**
 * Per-module text: `const useS = defineStrings({ title: 'Guardrails', trades: (n: number) => `${n} trades` }, { title: 'வரம்புகள்' })`
 * then `const s = useS()` in the component. Tamil entries are optional and fall back to English one by one.
 */
export function defineStrings<E extends StringTable>(en: E, ta: Partial<{ [K in keyof E]: E[K] }>) {
  return function useStrings(): E {
    const { language } = useLocale()
    return language === 'ta' ? ({ ...en, ...ta } as E) : en
  }
}
