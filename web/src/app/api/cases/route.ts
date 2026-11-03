import { listCases } from '@/server/payments'
import { staffRequest } from '@/server/route'

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance'], (session) => listCases(session.workspaceId))
}
