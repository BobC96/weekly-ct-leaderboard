import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import ClaimsClient from './ClaimsClient'

export const dynamic = 'force-dynamic'

export default async function AdminClaimsPage() {
  if (!(await isAdmin())) redirect('/admin')
  return <ClaimsClient />
}
