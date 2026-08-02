import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Route, Routes } from 'react-router-dom'
import {
  Archive,
  Briefcase,
  Code2,
  Download,
  FileText,
  Image,
  ListTree,
  Mail,
  Newspaper,
  Palette,
  Settings,
  Shield,
  SlidersHorizontal,
  UserCog,
  Users,
} from 'lucide-react'
import { getStoredToken } from '@/lib/adminAuth'
import { AdminLogin } from '@/components/admin/AdminLogin'
import { AdminShell } from '@/components/admin/AdminShell'
import { DocumentManager } from '@/components/admin/DocumentManager'
import { PlaceholderScreen } from '@/components/admin/PlaceholderScreen'
import { DashboardHome } from '@/pages/admin/DashboardHome'

export function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(getStoredToken()))

  return (
    <>
      <Helmet>
        <title>Admin — Techie Myil Studio</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-bg text-text">
        {authed ? (
          <AdminShell onLogout={() => setAuthed(false)}>
            <Routes>
              <Route index element={<DashboardHome />} />
              <Route path="documents" element={<DocumentManager />} />
              <Route
                path="projects"
                element={<PlaceholderScreen title="Projects" description="Manage portfolio projects." icon={Briefcase} />}
              />
              <Route
                path="services"
                element={<PlaceholderScreen title="Services" description="Manage the services you offer." icon={SlidersHorizontal} />}
              />
              <Route
                path="blog"
                element={<PlaceholderScreen title="Blog Posts" description="Write and manage blog posts." icon={Newspaper} />}
              />
              <Route
                path="enquiries"
                element={<PlaceholderScreen title="Enquiries" description="View enquiries submitted through the site." icon={Mail} />}
              />
              <Route
                path="subscribers"
                element={<PlaceholderScreen title="Subscribers" description="Manage newsletter subscribers." icon={Users} />}
              />
              <Route
                path="media"
                element={<PlaceholderScreen title="Media Library" description="Manage images and media assets." icon={Image} />}
              />
              <Route
                path="pages"
                element={<PlaceholderScreen title="Pages" description="Manage static site pages." icon={FileText} />}
              />
              <Route
                path="downloads"
                element={<PlaceholderScreen title="Portfolio Downloads" description="Track resume and portfolio downloads." icon={Download} />}
              />
              <Route
                path="appearance"
                element={<PlaceholderScreen title="Appearance" description="Customize site appearance." icon={Palette} />}
              />
              <Route
                path="menus"
                element={<PlaceholderScreen title="Menus" description="Manage site navigation menus." icon={ListTree} />}
              />
              <Route
                path="theme-settings"
                element={<PlaceholderScreen title="Theme Settings" description="Configure theme colors and fonts." icon={SlidersHorizontal} />}
              />
              <Route
                path="custom-code"
                element={<PlaceholderScreen title="Custom Code" description="Inject custom CSS/JS into the site." icon={Code2} />}
              />
              <Route
                path="users"
                element={<PlaceholderScreen title="Users" description="Manage admin users." icon={UserCog} />}
              />
              <Route
                path="roles"
                element={<PlaceholderScreen title="Roles" description="Manage user roles and permissions." icon={Shield} />}
              />
              <Route
                path="settings"
                element={<PlaceholderScreen title="Settings" description="General site settings." icon={Settings} />}
              />
              <Route
                path="backup"
                element={<PlaceholderScreen title="Backup & Tools" description="Backups and maintenance tools." icon={Archive} />}
              />
            </Routes>
          </AdminShell>
        ) : (
          <AdminLogin onSuccess={() => setAuthed(true)} />
        )}
      </div>
    </>
  )
}
