interface TestimonialPayload {
  name: string
  role: string
  relationship: string
  testimonial: string
}

export async function submitTestimonial(payload: TestimonialPayload) {
  const res = await fetch(`${import.meta.env.VITE_SEND_EMAIL_API_URL}/testimonial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => null)

  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Failed to send testimonial.')
  }
}
