import { NextResponse } from 'next/server'
import { requireSession, assertSameOrigin } from './auth'
import { apiError, RequestError } from './http'

type Session = Awaited<ReturnType<typeof requireSession>>
type StaffRole = 'owner' | 'operations' | 'finance' | 'viewer'

export async function staffRequest(request: Request, roles: readonly StaffRole[], handler: (session: Session) => Promise<unknown>) {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request)
    const session = await requireSession()
    if (!roles.includes(session.role)) throw new RequestError('Bạn không có quyền thực hiện thao tác này.', 403)
    const result = await handler(session)
    return NextResponse.json(result)
  } catch (error) {
    return apiError(error)
  }
}
