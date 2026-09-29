import { Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LANGUAGES, useT } from '@/lib/i18n'
import { CURRENCIES, REGIONS, displayCurrency, setLocale, useLocale, type Currency, type RegionId } from '@/lib/locale'

const selectClass =
  'w-full appearance-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/60'

/** Language, region and display currency. Picking a region also switches the currency to that region's own. */
export function LocalePicker() {
  const t = useT()
  const locale = useLocale()
  const waitingForRate = locale.currency !== 'INR' && displayCurrency() === 'INR'

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 px-1 text-2xs font-semibold uppercase tracking-wider text-text-secondary/70">
        <Globe2 className="h-3.5 w-3.5" /> {t('prefs.title')}
      </p>

      <div role="radiogroup" aria-label={t('prefs.language')} className="grid grid-cols-2 gap-1.5">
        {LANGUAGES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={locale.language === l.id}
            onClick={() => setLocale({ language: l.id })}
            className={cn(
              'btn-3d h-10 rounded-xl border text-sm font-semibold transition-colors',
              locale.language === l.id ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border bg-surface-2 text-text',
            )}
          >
            {l.native}
          </button>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="px-1 text-xs text-text-secondary">{t('prefs.region')}</span>
        <select
          className={selectClass}
          value={locale.region}
          onChange={(e) => {
            const region = REGIONS.find((r) => r.id === (e.target.value as RegionId))!
            setLocale({ region: region.id, currency: region.currency })
          }}
        >
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="px-1 text-xs text-text-secondary">{t('prefs.currency')}</span>
        <select className={selectClass} value={locale.currency} onChange={(e) => setLocale({ currency: e.target.value as Currency })}>
          {CURRENCIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.symbol.trim()} · {c.label}
            </option>
          ))}
        </select>
        <span className="block px-1 text-2xs text-text-secondary">{waitingForRate ? t('prefs.rateUnavailable') : t('prefs.currencyHint')}</span>
      </label>
    </div>
  )
}
