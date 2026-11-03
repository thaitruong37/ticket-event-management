import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLogs, ticketTiers } from '@/db/schema'
import { readJson, RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({ transferMethod: z.string().trim().min(3).max(120), transferNotes: z.string().trim().min(8).max(2000) })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const { id } = await context.params
    const input = schema.parse(await readJson(request))
    return db.transaction(async (tx) => {
      const [tier] = await tx.update(ticketTiers).set({ ...input, transferStatus: 'verified', updatedAt: new Date() })
        .where(and(eq(ticketTiers.workspaceId, staff.workspaceId), eq(ticketTiers.id, id), eq(ticketTiers.transferStatus, 'unverified'))).returning()
      if (!tier) throw new RequestError('Không tìm thấy loại vé đang chờ xác minh.', 409)
      await tx.insert(auditLogs).values({ workspaceId: staff.workspaceId, actorMembershipId: staff.membershipId,
        action: 'tier.transfer_verified', entityType: 'tier', entityId: id,
        metadata: { transferMethod: input.transferMethod, transferNotes: input.transferNotes } })
      return tier
    })
  })
}
