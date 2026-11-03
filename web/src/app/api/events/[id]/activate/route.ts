import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { auditLogs, events } from '@/db/schema'
import { RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const { id } = await context.params
    return db.transaction(async (tx) => {
      const [event] = await tx.update(events).set({ status: 'active', updatedAt: new Date() })
        .where(and(eq(events.workspaceId, staff.workspaceId), eq(events.id, id), eq(events.status, 'draft'))).returning()
      if (!event) throw new RequestError('Chỉ có thể kích hoạt sự kiện nháp thuộc đơn vị.', 409)
      await tx.insert(auditLogs).values({ workspaceId: staff.workspaceId, actorMembershipId: staff.membershipId,
        action: 'event.activated', entityType: 'event', entityId: id })
      return event
    })
  })
}
