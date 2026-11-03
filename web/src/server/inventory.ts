import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLogs, eventSessions, events, purchases, sourceAccounts, ticketTiers, tickets } from '@/db/schema'
import { RequestError } from './http'

const ticketInput = z.object({
  purchaseId: z.uuid(),
  ticketTierId: z.uuid(),
  externalReference: z.string().trim().min(1).max(240),
  section: z.string().trim().max(160).optional(),
  row: z.string().trim().max(80).optional(),
  seat: z.string().trim().max(80).optional(),
  costVnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  askingPriceVnd: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
})

export async function addTicket(workspaceId: string, input: unknown) {
  const data = ticketInput.parse(input)
  const [purchase] = await db.select().from(purchases).where(and(eq(purchases.id, data.purchaseId), eq(purchases.workspaceId, workspaceId)))
  if (!purchase || purchase.status !== 'confirmed') throw new RequestError('Lần mua chưa được xác minh hoặc không tồn tại.', 409)
  const [tier] = await db.select().from(ticketTiers).where(and(eq(ticketTiers.id, data.ticketTierId), eq(ticketTiers.workspaceId, workspaceId)))
  if (!tier || tier.eventSessionId !== purchase.eventSessionId) throw new RequestError('Loại vé không thuộc suất diễn của lần mua.', 400)
  if (tier.isGeneralAdmission && (data.section || data.row || data.seat)) throw new RequestError('Vé GA không có số ghế.')
  if (!tier.isGeneralAdmission && (!data.section || !data.row || !data.seat)) throw new RequestError('Vé ghế chỉ định cần khu, hàng và số ghế.')
  const [created] = await db.insert(tickets).values({
    workspaceId, purchaseId: purchase.id, sourceAccountId: purchase.sourceAccountId,
    eventSessionId: purchase.eventSessionId, ticketTierId: tier.id,
    externalReference: data.externalReference, section: data.section || null,
    row: data.row || null, seat: data.seat || null,
    costVnd: data.costVnd, askingPriceVnd: data.askingPriceVnd,
    status: 'preparing',
  }).returning()
  return created
}

export async function verifyTicket(workspaceId: string, ticketId: string, evidenceReference: string, actorMembershipId: string) {
  const evidence = z.string().trim().min(4).max(500).parse(evidenceReference)
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`select id from tickets where workspace_id = ${workspaceId} and id = ${ticketId} for update`)
    if (!result.rows.length) throw new RequestError('Không tìm thấy vé.', 404)
    const [ticket] = await tx.select().from(tickets).where(and(eq(tickets.workspaceId, workspaceId), eq(tickets.id, ticketId)))
    if (ticket.status !== 'preparing' && ticket.status !== 'blocked') throw new RequestError('Chỉ xác minh vé chưa bán và chưa giữ.', 409)
    const [purchase] = await tx.select().from(purchases).where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.id, ticket.purchaseId)))
    const [account] = await tx.select().from(sourceAccounts).where(and(eq(sourceAccounts.workspaceId, workspaceId), eq(sourceAccounts.id, ticket.sourceAccountId)))
    const [tier] = await tx.select().from(ticketTiers).where(and(eq(ticketTiers.workspaceId, workspaceId), eq(ticketTiers.id, ticket.ticketTierId)))
    const [session] = await tx.select().from(eventSessions).where(and(eq(eventSessions.workspaceId, workspaceId), eq(eventSessions.id, ticket.eventSessionId)))
    const [event] = session ? await tx.select().from(events).where(and(eq(events.workspaceId, workspaceId), eq(events.id, session.eventId))) : []
    if (purchase?.status !== 'confirmed' || account?.status !== 'active' || tier?.transferStatus !== 'verified' || !tier.transferMethod || event?.status !== 'active') {
      throw new RequestError('Cần xác minh nguồn mua, quyền chuyển vé, cách giao và sự kiện trước khi mở bán.', 409)
    }
    const [updated] = await tx.update(tickets).set({ status: 'available', artifactReference: evidence, blockedReason: null, updatedAt: new Date() })
      .where(and(eq(tickets.workspaceId, workspaceId), eq(tickets.id, ticketId))).returning()
    await tx.insert(auditLogs).values({ workspaceId, actorMembershipId, action: 'ticket.verified',
      entityType: 'ticket', entityId: ticketId, metadata: { evidenceReference: evidence } })
    return updated
  })
}
