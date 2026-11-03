import { createOrder, listOrders } from '@/server/orders'
import { readJson } from '@/server/http'
import { staffRequest } from '@/server/route'

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], (session) =>
    listOrders(session.workspaceId))
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (session) =>
    createOrder(
      session.workspaceId,
      session.membershipId,
      await readJson(request),
      request.headers.get('x-request-id'),
    ))
}
