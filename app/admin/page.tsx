import { isAdmin } from '@/lib/admin-auth'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const authenticated = await isAdmin()
  return <>
    <AdminClient initiallyAuthenticated={authenticated} />
    {authenticated && <a className="claimsFloatingLink" href="/admin/claims">Review Player Claims</a>}
  </>
}
