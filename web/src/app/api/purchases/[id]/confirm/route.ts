import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLogs, purchases } from '@/db/schema'
import { readJson, RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({ evidenceReference: z.string().trim().min(4).max(500) })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const { id } = await context.params
    const input = schema.parse(await readJson(request))
    return db.transaction(async (tx) => {
      const [purchase] = await tx.update(purchases).set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(eq(purchases.workspaceId, staff.workspaceId), eq(purchases.id, id), eq(purchases.status, 'pending'))).returning()
      if (!purchase) throw new RequestError('Chỉ xác nhận được lần mua đang chờ.', 409)
      await tx.insert(auditLogs).values({ workspaceId: staff.workspaceId, actorMembershipId: staff.membershipId,
        action: 'purchase.confirmed', entityType: 'purchase', entityId: purchase.id,
        metadata: { evidenceReference: input.evidenceReference } })
      return purchase
    })
  })
}
