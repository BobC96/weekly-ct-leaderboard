import { isAdmin } from '@/lib/admin-auth'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  return <AdminClient initiallyAuthenticated={await isAdmin()} />
}
