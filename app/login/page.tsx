import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LoginClient from './LoginClient'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const requestedNext = params.next || '/my-stats'
  const nextPath = requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/my-stats'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(nextPath)

  return <LoginClient nextPath={nextPath} />
}
