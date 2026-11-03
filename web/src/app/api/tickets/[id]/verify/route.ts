import { z } from 'zod'
import { verifyTicket } from '@/server/inventory'
import { readJson } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({ evidenceReference: z.string().trim().min(4).max(500) })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const { id } = await context.params
    const { evidenceReference } = schema.parse(await readJson(request))
    return verifyTicket(staff.workspaceId, id, evidenceReference, staff.membershipId)
  })
}
