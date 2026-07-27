import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import { Loader2, Send, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { submitTestimonial } from '@/lib/testimonial'

interface TestimonialFormValues {
  name: string
  role: string
  relationship: string
  testimonial: string
}

const relationshipOptions = [
  'We worked together',
  'I managed him',
  'He managed me',
  'Client relationship',
  'Other',
]

export function TestimonialForm() {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<TestimonialFormValues>()

  async function onSubmit(data: TestimonialFormValues) {
    setSubmitError(null)
    try {
      await submitTestimonial(data)
      reset()
    } catch {
      setSubmitError("Something went wrong sending your testimonial — please try again in a moment.")
    }
  }

  if (isSubmitSuccessful) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center gap-4 py-12 text-center"
      >
        <CheckCircle2 className="h-10 w-10 text-accent" />
        <div>
          <h3 className="font-display text-xl font-semibold text-text">Thank you so much!</h3>
          <p className="mt-2 max-w-xs text-sm text-text-secondary">
            Your testimonial has been sent. I'll read it over, and once I've had a chance to review it, I'll add it
            to the site. Really means a lot!
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="t-name" className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">
            Name
          </label>
          <input
            id="t-name"
            {...register('name', { required: 'Name is required' })}
            placeholder="Jane Doe"
            className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent/50"
          />
          {errors.name && <p className="mt-1.5 text-xs text-error">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="t-role" className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">
            Role / Company
          </label>
          <input
            id="t-role"
            {...register('role')}
            placeholder="Senior Engineer at Acme Inc."
            className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent/50"
          />
        </div>
      </div>

      <div>
        <label htmlFor="t-relationship" className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">
          How do you know me?
        </label>
        <select
          id="t-relationship"
          {...register('relationship')}
          defaultValue=""
          className="w-full appearance-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent/50"
        >
          <option value="" disabled className="bg-card">
            Select an option
          </option>
          {relationshipOptions.map((option) => (
            <option key={option} value={option} className="bg-card">
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="t-testimonial" className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">
          Your Testimonial
        </label>
        <textarea
          id="t-testimonial"
          rows={5}
          {...register('testimonial', { required: 'A few words would mean a lot' })}
          placeholder="Share a few words about what it was like working together..."
          className="w-full resize-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent/50"
        />
        {errors.testimonial && <p className="mt-1.5 text-xs text-error">{errors.testimonial.message}</p>}
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send Testimonial
        </Button>
        {submitError && <p className="mt-2 text-xs text-error">{submitError}</p>}
      </div>
    </form>
  )
}
