import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { eventSessions, purchases, sourceAccounts } from '@/db/schema'
import { readJson, RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({
  sourceAccountId: z.uuid(), eventSessionId: z.uuid(), externalReference: z.string().trim().min(1).max(240),
  totalCostVnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  purchasedAt: z.iso.datetime({ offset: true }).optional(), notes: z.string().max(2000).optional(),
})

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (staff) => {
    const rows = await db.select().from(purchases).where(eq(purchases.workspaceId, staff.workspaceId))
    if (staff.role === 'owner' || staff.role === 'operations') return rows
    return rows.map(({ id, eventSessionId, status, purchasedAt, createdAt, totalCostVnd }) => ({
      id, eventSessionId, status, purchasedAt, createdAt,
      ...(staff.role === 'finance' ? { totalCostVnd } : {}),
    }))
  })
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const input = schema.parse(await readJson(request))
    const [account] = await db.select({ id: sourceAccounts.id }).from(sourceAccounts)
      .where(and(eq(sourceAccounts.workspaceId, staff.workspaceId), eq(sourceAccounts.id, input.sourceAccountId), eq(sourceAccounts.status, 'active')))
    const [session] = await db.select({ id: eventSessions.id }).from(eventSessions)
      .where(and(eq(eventSessions.workspaceId, staff.workspaceId), eq(eventSessions.id, input.eventSessionId)))
    if (!account || !session) throw new RequestError('Tài khoản nguồn hoặc suất diễn không hợp lệ.', 404)
    const [purchase] = await db.insert(purchases).values({
      workspaceId: staff.workspaceId, sourceAccountId: account.id, eventSessionId: session.id,
      externalReference: input.externalReference, totalCostVnd: input.totalCostVnd, status: 'pending',
      purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : new Date(), notes: input.notes,
    }).returning()
    return purchase
  })
}
