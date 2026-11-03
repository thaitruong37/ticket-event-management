import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { eventSessions, ticketTiers } from '@/db/schema'
import { readJson, RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({
  eventSessionId: z.uuid(), name: z.string().trim().min(1).max(160),
  isGeneralAdmission: z.boolean(),
  faceValueVnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  suggestedPriceVnd: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  section: z.string().trim().max(160).optional(),
})

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (staff) =>
    db.select().from(ticketTiers).where(eq(ticketTiers.workspaceId, staff.workspaceId)))
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const data = schema.parse(await readJson(request))
    const [session] = await db.select({ id: eventSessions.id }).from(eventSessions)
      .where(and(eq(eventSessions.workspaceId, staff.workspaceId), eq(eventSessions.id, data.eventSessionId)))
    if (!session) throw new RequestError('Suất diễn không tồn tại.', 404)
    const [tier] = await db.insert(ticketTiers).values({ workspaceId: staff.workspaceId, ...data }).returning()
    return tier
  })
}
