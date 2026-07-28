import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { getStoredToken } from '@/lib/adminAuth'
import { AdminLogin } from '@/components/admin/AdminLogin'
import { DocumentVault } from '@/components/admin/DocumentVault'

export function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(getStoredToken()))

  return (
    <>
      <Helmet>
        <title>Admin — Document Vault</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-bg text-text">
        {authed ? <DocumentVault onLogout={() => setAuthed(false)} /> : <AdminLogin onSuccess={() => setAuthed(true)} />}
      </div>
    </>
  )
}
