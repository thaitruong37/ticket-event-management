import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import { getCurrentSession } from '@/server/auth'

export default async function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  return <StaffShell role={session.role} displayName={session.displayName}>{children}</StaffShell>
}
