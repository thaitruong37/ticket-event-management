import { getFinanceOverview } from '@/server/payments'
import { staffRequest } from '@/server/route'

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'finance'], (session) => getFinanceOverview(session.workspaceId))
}
