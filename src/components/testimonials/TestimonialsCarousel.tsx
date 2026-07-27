import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { GlassCard } from '@/components/ui/GlassCard'
import { testimonials } from '@/data/testimonials'

export function TestimonialsCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'center' })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.on('select', onSelect)
    onSelect()
  }, [emblaApi, onSelect])

  return (
    <section id="testimonials" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Testimonials"
          title="What People Say"
          accentWord="Say"
          description="A few words from people I've worked alongside."
          align="center"
          className="mx-auto mb-14"
        />

        <div className="mx-auto max-w-2xl">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {testimonials.map((item) => (
                <div key={item.id} className="min-w-0 flex-[0_0_100%] px-2">
                  <GlassCard hover={false} className="flex flex-col items-center gap-5 p-10 text-center">
                    <Quote className="h-8 w-8 text-accent/50" />
                    <p className="text-body-lg leading-relaxed text-text-secondary">{item.quote}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/20 bg-accent/10 font-display text-sm font-semibold text-accent">
                        {item.initials}
                      </span>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-text">{item.name}</p>
                        <p className="text-xs text-text-secondary">{item.role}</p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => emblaApi?.scrollPrev()}
              data-cursor="hover"
              aria-label="Previous testimonial"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              {testimonials.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => emblaApi?.scrollTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    selectedIndex === i ? 'w-6 bg-accent' : 'w-1.5 bg-surface-15'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => emblaApi?.scrollNext()}
              data-cursor="hover"
              aria-label="Next testimonial"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Container>
    </section>
  )
}
