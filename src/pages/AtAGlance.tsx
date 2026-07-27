import { Helmet } from 'react-helmet-async'
import { Container } from '@/components/ui/Container'
import { GlanceHero } from '@/components/glance/GlanceHero'
import { ExpertisePanel } from '@/components/glance/ExpertisePanel'
import { ExperiencePanel } from '@/components/glance/ExperiencePanel'
import { ProjectsPanel } from '@/components/glance/ProjectsPanel'
import { CertificationsPanel } from '@/components/glance/CertificationsPanel'
import { personal } from '@/data/personal'

export function AtAGlance() {
  return (
    <>
      <Helmet>
        <title>At a Glance — {personal.name}</title>
        <meta
          name="description"
          content={`A one-screen summary of ${personal.name}'s experience, projects, and certifications.`}
        />
      </Helmet>
      <section className="relative pt-28 pb-16 sm:pt-32">
        <Container className="space-y-8">
          <GlanceHero />

          <div className="grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <ExpertisePanel />
            </div>
            <div className="lg:col-span-4">
              <ExperiencePanel />
            </div>
            <div className="space-y-5 lg:col-span-5">
              <ProjectsPanel />
              <CertificationsPanel />
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
