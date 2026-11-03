import { cancelOrder } from '@/server/orders'
import { staffRequest } from '@/server/route'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  return staffRequest(request, ['owner', 'operations'], async (session) => {
    const { id } = await context.params
    return cancelOrder(
      session.workspaceId,
      id,
      session.membershipId,
      request.headers.get('x-request-id'),
    )
  })
}
