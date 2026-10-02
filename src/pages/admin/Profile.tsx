import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Check, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Field, Notice, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { ProfileSettings } from '@/components/admin/AdminShell'
import { VersionLine } from '@/components/admin/VersionLine'
import { haptic } from '@/lib/native'
import { saveProfile, squarePhoto, useProfile } from '@/lib/profile'
import type { ProfileDoc } from '@/lib/growthApi'

const FIELDS: { key: keyof ProfileDoc; label: string; placeholder?: string; type?: string; wide?: boolean }[] = [
  { key: 'displayName', label: 'Display name', placeholder: 'Used in greetings and the menu' },
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'city', label: 'City' },
  { key: 'occupation', label: 'Occupation', wide: true },
]

export function Profile() {
  const { profile, name, photo } = useProfile()
  const [draft, setDraft] = useState(profile)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => setDraft(profile), [profile])
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  async function save(next: ProfileDoc) {
    setSaving(true)
    setError(null)
    try {
      await saveProfile(next)
      haptic(12)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    try {
      await save({ ...profile, photo: await squarePhoto(file) })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow="Account" title="Profile" lede="Your photo, your details and how the app looks and behaves." />
      {error && <Notice tone="bad">{error}</Notice>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Panel>
            <div className="flex flex-col items-center gap-4 py-2 text-center sm:flex-row sm:text-left">
              <div className="relative">
                <motion.div key={photo} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
                  <Avatar name={name} src={photo} size="lg" className="h-28 w-28 ring-2 ring-accent/40" />
                </motion.div>
                <button
                  type="button"
                  aria-label="Change picture"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-card bg-accent text-[#0b0a09] shadow-lg"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl text-text">{name}</p>
                <p className="text-sm text-text-secondary">{[profile.occupation, profile.city].filter(Boolean).join(' · ') || 'Administrator'}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Button size="sm" magnetic={false} onClick={() => fileRef.current?.click()}>
                    <Camera className="h-4 w-4" /> Change picture
                  </Button>
                  {profile.photo && (
                    <Button size="sm" variant="ghost" magnetic={false} onClick={() => void save({ ...profile, photo: '' })}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Personal info" hint="Private to you; stored in your vault.">
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.wide ? 'sm:col-span-2' : undefined}>
                  <Field label={f.label}>
                    <input className={inputCls} type={f.type ?? 'text'} value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                  </Field>
                </div>
              ))}
              <div className="sm:col-span-2">
                <Field label="About you">
                  <textarea className={`${inputCls} min-h-[5rem]`} maxLength={300} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button size="sm" magnetic={false} disabled={!dirty || saving} onClick={() => void save(draft)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
              </Button>
              {saved && <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-positive">Saved</motion.span>}
              {dirty && !saving && <button type="button" onClick={() => setDraft(profile)} className="text-sm text-text-secondary">Discard</button>}
            </div>
          </Panel>
        </div>

        <Panel title="Settings" hint="Display, language, privacy, notifications and app lock.">
          <ProfileSettings />
          <VersionLine className="mt-4 border-t border-border pt-3 text-center font-mono text-xs text-text-secondary" />
        </Panel>
      </div>
    </div>
  )
}
