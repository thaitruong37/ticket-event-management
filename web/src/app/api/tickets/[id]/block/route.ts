import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLogs, tickets } from '@/db/schema'
import { readJson, RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({ reason: z.string().trim().min(8).max(1000) })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const { id } = await context.params
    const { reason } = schema.parse(await readJson(request))
    return db.transaction(async (tx) => {
      const [ticket] = await tx.update(tickets).set({ status: 'blocked', blockedReason: reason, updatedAt: new Date() })
        .where(and(eq(tickets.workspaceId, staff.workspaceId), eq(tickets.id, id), inArray(tickets.status, ['preparing', 'available', 'blocked']))).returning()
      if (!ticket) throw new RequestError('Không thể chặn vé đang giữ hoặc đã bán.', 409)
      await tx.insert(auditLogs).values({ workspaceId: staff.workspaceId, actorMembershipId: staff.membershipId,
        action: 'ticket.blocked', entityType: 'ticket', entityId: ticket.id, metadata: { reason } })
      return ticket
    })
  })
}
