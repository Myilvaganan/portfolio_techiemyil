import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Archive,
  Bell,
  Briefcase,
  Code2,
  Download,
  FileText,
  FolderOpen,
  Image,
  LayoutDashboard,
  ListTree,
  LogOut,
  Mail,
  Menu,
  Newspaper,
  Palette,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  UserCog,
  Users,
} from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'
import { clearStoredToken } from '@/lib/adminAuth'

interface NavItem {
  label: string
  to: string
  icon: typeof LayoutDashboard
}

interface NavSection {
  label?: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  { items: [{ label: 'Dashboard', to: '/admin', icon: LayoutDashboard }] },
  {
    label: 'Content',
    items: [
      { label: 'Projects', to: '/admin/projects', icon: Briefcase },
      { label: 'Services', to: '/admin/services', icon: SlidersHorizontal },
      { label: 'Blog Posts', to: '/admin/blog', icon: Newspaper },
      { label: 'Enquiries', to: '/admin/enquiries', icon: Mail },
      { label: 'Subscribers', to: '/admin/subscribers', icon: Users },
      { label: 'Media Library', to: '/admin/media', icon: Image },
      { label: 'Pages', to: '/admin/pages', icon: FileText },
      { label: 'Portfolio Downloads', to: '/admin/downloads', icon: Download },
    ],
  },
  {
    label: 'Documents',
    items: [{ label: 'Document Manager', to: '/admin/documents', icon: FolderOpen }],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Appearance', to: '/admin/appearance', icon: Palette },
      { label: 'Menus', to: '/admin/menus', icon: ListTree },
      { label: 'Theme Settings', to: '/admin/theme-settings', icon: SlidersHorizontal },
      { label: 'Custom Code', to: '/admin/custom-code', icon: Code2 },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Users', to: '/admin/users', icon: UserCog },
      { label: 'Roles', to: '/admin/roles', icon: Shield },
      { label: 'Settings', to: '/admin/settings', icon: Settings },
      { label: 'Backup & Tools', to: '/admin/backup', icon: Archive },
    ],
  },
]

function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick(() => setOpen(false))
  const navigate = useNavigate()

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-cursor="hover"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-2 text-left transition-colors hover:border-accent/40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
          A
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-text">Admin</p>
            <p className="text-xs text-text-secondary">Administrator</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/')
            }}
            className="flex w-full items-center px-4 py-2.5 text-left text-sm text-text-secondary hover:bg-surface-3 hover:text-text"
          >
            Visit Website
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              clearStoredToken()
              onLogout()
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-error hover:bg-error/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick(() => setOpen(false))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-cursor="hover"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
      >
        <Bell className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card p-4 text-center shadow-2xl">
          <p className="text-sm text-text-secondary">You're all caught up. No new notifications.</p>
        </div>
      )}
    </div>
  )
}

export function AdminShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!search.trim()) return
    navigate(`/admin/documents?q=${encodeURIComponent(search.trim())}`)
    setSearch('')
  }

  return (
    <div className="min-h-screen bg-bg">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Logo />
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.label ?? `section-${idx}`}>
              {section.label && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/70">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-secondary hover:bg-surface-3 hover:text-text',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
              A
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">Admin</p>
              <p className="flex items-center gap-1 text-xs text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Admin
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            data-cursor="hover"
            aria-label="Toggle sidebar"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-3 hover:text-text lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form onSubmit={handleSearchSubmit} className="hidden flex-1 max-w-md sm:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="w-full rounded-full border border-border bg-surface-2 py-2.5 pl-10 pr-4 text-sm text-text outline-none transition-colors focus:border-accent/50"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <ProfileMenu onLogout={onLogout} />
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
