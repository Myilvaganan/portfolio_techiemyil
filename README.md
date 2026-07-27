# Techie Myil — Portfolio

A premium, minimal personal portfolio for MyilVaganan Sakthivel — Senior Software Engineer & Technical Lead. Built to feel like a SaaS product site (Apple / Vercel / Linear-grade polish) rather than a typical developer portfolio.

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4** (CSS-first theme in `src/index.css`)
- **Framer Motion** — scroll reveals, page/section transitions, magnetic buttons
- **React Three Fiber** + **drei** — subtle particle field behind the hero portrait
- **Lenis** — smooth scrolling
- **React Router** — home page + `/blog`, `/pricing`, `/tools` placeholder routes
- **React Hook Form** — contact form validation
- **React CountUp** — animated stat counters
- **Embla Carousel** — testimonials carousel
- **Radix UI** — command palette dialog primitive
- **Lucide React** + **react-icons** (brand logos) — iconography

## Getting Started

```bash
npm install
npm run dev       # start dev server
npm run build     # type-check + production build
npm run preview   # preview the production build
npm run lint      # oxlint
```

## Project Structure

```
src/
├── assets/           # images (profile photo, generated project art)
├── components/
│   ├── ui/           # atoms: Button, GlassCard, Badge, Chip, SectionHeading, Marquee...
│   ├── layout/        # Header, Footer, LuxuryBackground
│   ├── common/        # CustomCursor, ScrollProgressBar, BackToTop, LoadingScreen,
│   │                   CommandPalette, ErrorBoundary, TestimonialsCarousel
│   ├── hero/ about/ experience/ skills/ projects/ services/
│   │   techstack/ certifications/ contact/     # one folder per homepage section
├── pages/            # Home, Blog, Pricing, Tools, NotFound
├── data/             # resume content as typed data (experience, skills, projects, ...)
├── hooks/            # useLenis, useMagnetic, useActiveSection, useMediaQuery, ...
├── lib/              # cn() class-merging helper
└── types/            # shared TypeScript interfaces
```

Content in `src/data/*.ts` is sourced directly from the resume in `source-files/`. Update those files to change copy — components never hardcode resume facts.

## Notable Implementation Details

- **Design tokens** live entirely in `src/index.css` via Tailwind v4's `@theme` block (no `tailwind.config.js` needed) — colors, fonts, radii, section spacing, and marquee/float keyframes.
- **Hero R3F canvas** is lazy-loaded and wrapped in an `ErrorBoundary` so devices/browsers without WebGL still get a fully working hero (just without the particle effect).
- **Command palette** (`⌘K` / `Ctrl+K`) jumps to any section, opens the resume, or opens socials.
- **Contact form** validates client-side and hands off to a pre-filled `mailto:` link — there's no backend.
- **Google Map embed** in the Contact section uses the key-free `output=embed` iframe, tinted dark via CSS `invert`/`hue-rotate` filters to match the theme.
- Resume PDF lives at `public/resume/` and is linked from the header, hero, and command palette.

## Known Limitations

- The profile photo is cropped from a low-resolution mockup screenshot; swap `src/assets/images/profile.jpg` for a real high-resolution headshot when available.
- Project screenshots are generated abstract placeholders (`src/assets/images/project-*.jpg`), not real product screenshots.
- Testimonials, Blog, Pricing, and Free Tools sections are intentionally placeholders per the design brief — wire up real content when it exists.
