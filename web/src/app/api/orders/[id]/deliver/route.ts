import { deliverOrder } from '@/server/orders'
import { readJson } from '@/server/http'
import { staffRequest } from '@/server/route'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  return staffRequest(request, ['owner', 'operations'], async (session) => {
    const { id } = await context.params
    return deliverOrder(
      session.workspaceId,
      id,
      session.membershipId,
      await readJson(request),
      request.headers.get('x-request-id'),
    )
  })
}
