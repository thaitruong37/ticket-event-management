import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import {
  auditLogs,
  deliveries,
  eventSessions,
  events,
  orderLines,
  orders,
  paymentLinks,
  purchases,
  sourceAccounts,
  ticketHolds,
  ticketTiers,
  tickets,
} from '@/db/schema'
import { RequestError } from './http'
import {
  cancelPayOSPaymentLink,
  createPayOSPaymentLink,
  getPayOSPaymentLink,
  isPayOSConfigured,
  mapPayOSStatus,
} from './payos'

const DEFAULT_HOLD_MINUTES = 15
const MAX_HOLD_MINUTES = 60
const LIVE_LINK_STATUSES = ['creating', 'active', 'unknown'] as const

const createOrderInput = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().trim().email().max(320).optional().nullable(),
  customerPhone: z.string().trim().min(6).max(40).optional().nullable(),
  ticketIds: z.array(z.uuid()).min(1).max(50),
  notes: z.string().trim().max(4_000).optional().nullable(),
  holdMinutes: z.number().int().min(1).max(MAX_HOLD_MINUTES).optional(),
})

const deliverInput = z.object({
  method: z.string().trim().min(2).max(120).default('official_transfer'),
  recipientName: z.string().trim().min(2).max(160).optional().nullable(),
  evidenceAttested: z.literal(true),
  deliveries: z.array(z.object({
    ticketId: z.uuid(),
    evidenceReference: z.string().trim().min(3).max(500),
    recipientContact: z.string().trim().min(3).max(320).optional().nullable(),
  })).min(1).max(50),
})

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function ticketDescription(ticket: typeof tickets.$inferSelect): string {
  const seat = [ticket.section, ticket.row, ticket.seat].filter(Boolean).join(' / ')
  return seat ? `Ticket ${seat}` : `Ticket ${ticket.id.slice(0, 8)}`
}

export async function listOrders(workspaceId: string) {
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.workspaceId, workspaceId))
    .orderBy(desc(orders.createdAt))
    .limit(250)

  if (!orderRows.length) return []
  const orderIds = orderRows.map((order) => order.id)
  const [lines, links, deliveryRows] = await Promise.all([
    db.select().from(orderLines).where(and(eq(orderLines.workspaceId, workspaceId), inArray(orderLines.orderId, orderIds))),
    db.select().from(paymentLinks).where(and(eq(paymentLinks.workspaceId, workspaceId), inArray(paymentLinks.orderId, orderIds))).orderBy(desc(paymentLinks.createdAt)),
    db.select().from(deliveries).where(and(eq(deliveries.workspaceId, workspaceId), inArray(deliveries.orderId, orderIds))),
  ])

  return orderRows.map((order) => {
    const matchingDeliveries = deliveryRows.filter((delivery) => delivery.orderId === order.id)
    const paymentLink = links.find((link) => link.orderId === order.id)
    const ticketIds = lines.filter((line) => line.orderId === order.id).map((line) => line.ticketId)
    const deliveryState = !matchingDeliveries.length
      ? 'pending'
      : matchingDeliveries.every((delivery) => delivery.status === 'confirmed')
        ? 'confirmed'
        : matchingDeliveries.some((delivery) => delivery.status === 'failed')
          ? 'failed'
          : 'in_progress'

    return {
      ...order,
      reference: String(order.orderCode),
      ticketIds,
      total: order.totalVnd,
      paymentStatus: order.status === 'paid' || order.status === 'fulfilled' ? 'paid' : order.status === 'payment_review' ? 'review' : 'unpaid',
      paymentState: paymentLink?.status ?? 'none',
      paymentUrl: paymentLink?.checkoutUrl ?? null,
      deliveryStatus: deliveryState,
      deliveryState,
    }
  })
}

export async function createOrder(
  workspaceId: string,
  membershipId: string,
  input: unknown,
  requestId?: string | null,
) {
  const data = createOrderInput.parse(input)
  const ticketIds = unique(data.ticketIds)
  if (ticketIds.length !== data.ticketIds.length) throw new RequestError('Ticket list contains duplicates.')
  const safeRequestId = requestId?.trim().slice(0, 120) || null
  const idempotencyKey = safeRequestId ? `${workspaceId}:${membershipId}:${safeRequestId}` : null
  if (safeRequestId) {
    const [prior] = await db.select({ orderId: auditLogs.entityId }).from(auditLogs).where(and(
      eq(auditLogs.workspaceId, workspaceId),
      eq(auditLogs.actorMembershipId, membershipId),
      eq(auditLogs.action, 'order.created'),
      eq(auditLogs.requestId, safeRequestId),
    )).orderBy(desc(auditLogs.createdAt)).limit(1)
    if (prior?.orderId) {
      const [existing] = await db.select().from(orders).where(and(
        eq(orders.workspaceId, workspaceId), eq(orders.id, prior.orderId),
      )).limit(1)
      if (existing) {
        const lines = await db.select({ ticketId: orderLines.ticketId }).from(orderLines).where(and(
          eq(orderLines.workspaceId, workspaceId), eq(orderLines.orderId, existing.id),
        ))
        return { ...existing, ticketIds: lines.map((line) => line.ticketId), total: existing.totalVnd, paymentUrl: null }
      }
    }
  }

  const now = new Date()
  const holdExpiresAt = new Date(now.getTime() + (data.holdMinutes ?? DEFAULT_HOLD_MINUTES) * 60_000)

  return db.transaction(async (tx) => {
    if (safeRequestId && idempotencyKey) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`)
      const [prior] = await tx.select({ orderId: auditLogs.entityId }).from(auditLogs).where(and(
        eq(auditLogs.workspaceId, workspaceId),
        eq(auditLogs.actorMembershipId, membershipId),
        eq(auditLogs.action, 'order.created'),
        eq(auditLogs.requestId, safeRequestId),
      )).orderBy(desc(auditLogs.createdAt)).limit(1)
      if (prior?.orderId) {
        const [existing] = await tx.select().from(orders).where(and(
          eq(orders.workspaceId, workspaceId), eq(orders.id, prior.orderId),
        )).limit(1)
        if (existing) {
          const lines = await tx.select({ ticketId: orderLines.ticketId }).from(orderLines).where(and(
            eq(orderLines.workspaceId, workspaceId), eq(orderLines.orderId, existing.id),
          ))
          return { ...existing, ticketIds: lines.map((line) => line.ticketId), total: existing.totalVnd, paymentUrl: null }
        }
      }
    }

    for (const ticketId of [...ticketIds].sort()) {
      await tx.execute(sql`select id from tickets where workspace_id = ${workspaceId} and id = ${ticketId} for update`)
    }

    const selectedTickets = await tx
      .select()
      .from(tickets)
      .where(and(eq(tickets.workspaceId, workspaceId), inArray(tickets.id, ticketIds)))

    if (selectedTickets.length !== ticketIds.length) throw new RequestError('One or more tickets do not exist.', 404)
    if (selectedTickets.some((ticket) => ticket.status !== 'available')) {
      throw new RequestError('One or more tickets are no longer available.', 409)
    }

    for (const purchaseId of unique(selectedTickets.map((ticket) => ticket.purchaseId)).sort()) {
      await tx.execute(sql`select id from purchases where workspace_id = ${workspaceId} and id = ${purchaseId} for share`)
    }
    for (const accountId of unique(selectedTickets.map((ticket) => ticket.sourceAccountId)).sort()) {
      await tx.execute(sql`select id from source_accounts where workspace_id = ${workspaceId} and id = ${accountId} for share`)
    }
    for (const tierId of unique(selectedTickets.map((ticket) => ticket.ticketTierId)).sort()) {
      await tx.execute(sql`select id from ticket_tiers where workspace_id = ${workspaceId} and id = ${tierId} for share`)
    }
    for (const sessionId of unique(selectedTickets.map((ticket) => ticket.eventSessionId)).sort()) {
      await tx.execute(sql`select id from event_sessions where workspace_id = ${workspaceId} and id = ${sessionId} for share`)
    }

    const [purchaseRows, accountRows, tierRows, sessionRows] = await Promise.all([
      tx.select().from(purchases).where(and(
        eq(purchases.workspaceId, workspaceId),
        inArray(purchases.id, unique(selectedTickets.map((ticket) => ticket.purchaseId))),
      )),
      tx.select().from(sourceAccounts).where(and(
        eq(sourceAccounts.workspaceId, workspaceId),
        inArray(sourceAccounts.id, unique(selectedTickets.map((ticket) => ticket.sourceAccountId))),
      )),
      tx.select().from(ticketTiers).where(and(
        eq(ticketTiers.workspaceId, workspaceId),
        inArray(ticketTiers.id, unique(selectedTickets.map((ticket) => ticket.ticketTierId))),
      )),
      tx.select().from(eventSessions).where(and(
        eq(eventSessions.workspaceId, workspaceId),
        inArray(eventSessions.id, unique(selectedTickets.map((ticket) => ticket.eventSessionId))),
      )),
    ])
    for (const eventId of unique(sessionRows.map((session) => session.eventId)).sort()) {
      await tx.execute(sql`select id from events where workspace_id = ${workspaceId} and id = ${eventId} for share`)
    }
    const eventRows = sessionRows.length
      ? await tx.select().from(events).where(and(
          eq(events.workspaceId, workspaceId),
          inArray(events.id, unique(sessionRows.map((session) => session.eventId))),
        ))
      : []
    const purchaseMap = new Map(purchaseRows.map((row) => [row.id, row]))
    const accountMap = new Map(accountRows.map((row) => [row.id, row]))
    const tierMap = new Map(tierRows.map((row) => [row.id, row]))
    const sessionMap = new Map(sessionRows.map((row) => [row.id, row]))
    const eventMap = new Map(eventRows.map((row) => [row.id, row]))
    const ineligible = selectedTickets.some((ticket) => {
      const tier = tierMap.get(ticket.ticketTierId)
      const session = sessionMap.get(ticket.eventSessionId)
      const event = session ? eventMap.get(session.eventId) : null
      return purchaseMap.get(ticket.purchaseId)?.status !== 'confirmed'
        || accountMap.get(ticket.sourceAccountId)?.status !== 'active'
        || tier?.transferStatus !== 'verified'
        || !tier.transferMethod
        || event?.status !== 'active'
        || !ticket.artifactReference?.trim()
    })
    if (ineligible) {
      throw new RequestError('One or more tickets no longer satisfy sale and transfer requirements.', 409)
    }

    const subtotalVnd = selectedTickets.reduce((total, ticket) => total + ticket.askingPriceVnd, 0)
    if (!Number.isSafeInteger(subtotalVnd) || subtotalVnd <= 0) throw new RequestError('Order total is invalid.', 409)

    const [order] = await tx
      .insert(orders)
      .values({
        workspaceId,
        status: 'awaiting_payment',
        customerName: data.customerName,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        subtotalVnd,
        totalVnd: subtotalVnd,
        holdExpiresAt,
        createdByMembershipId: membershipId,
        notes: data.notes || null,
      })
      .returning()

    await tx.insert(orderLines).values(selectedTickets.map((ticket) => ({
      workspaceId,
      orderId: order.id,
      ticketId: ticket.id,
      description: ticketDescription(ticket),
      unitPriceVnd: ticket.askingPriceVnd,
      quantity: 1,
      lineTotalVnd: ticket.askingPriceVnd,
    })))

    await tx.insert(ticketHolds).values(selectedTickets.map((ticket) => ({
      workspaceId,
      orderId: order.id,
      ticketId: ticket.id,
      status: 'active' as const,
      expiresAt: holdExpiresAt,
    })))

    const changed = await tx
      .update(tickets)
      .set({ status: 'held', updatedAt: now })
      .where(and(eq(tickets.workspaceId, workspaceId), inArray(tickets.id, ticketIds), eq(tickets.status, 'available')))
      .returning({ id: tickets.id })
    if (changed.length !== ticketIds.length) throw new RequestError('Ticket availability changed. Please retry.', 409)

    await tx.insert(auditLogs).values({
      workspaceId,
      actorMembershipId: membershipId,
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      requestId: safeRequestId,
      metadata: { orderCode: order.orderCode, ticketIds, totalVnd: subtotalVnd },
    })

    return { ...order, ticketIds, total: order.totalVnd, paymentUrl: null }
  })
}

async function paymentLinkPreparation(workspaceId: string, orderId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from orders where workspace_id = ${workspaceId} and id = ${orderId} for update`)
    const [order] = await tx.select().from(orders).where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, orderId)))
    if (!order) throw new RequestError('Order not found.', 404)
    if (order.status === 'paid' || order.status === 'fulfilled') throw new RequestError('Order is already paid.', 409)
    if (order.status !== 'awaiting_payment') throw new RequestError('Order cannot accept payment in its current state.', 409)
    if (!order.holdExpiresAt || order.holdExpiresAt <= new Date()) throw new RequestError('Ticket hold has expired.', 409)

    const lines = await tx.select().from(orderLines).where(and(eq(orderLines.workspaceId, workspaceId), eq(orderLines.orderId, orderId)))
    const holds = await tx.select().from(ticketHolds).where(and(
      eq(ticketHolds.workspaceId, workspaceId),
      eq(ticketHolds.orderId, orderId),
      eq(ticketHolds.status, 'active'),
    ))
    if (!lines.length || holds.length !== lines.length || holds.some((hold) => hold.expiresAt <= new Date())) {
      throw new RequestError('Order no longer has a complete live ticket hold.', 409)
    }

    const [existing] = await tx
      .select()
      .from(paymentLinks)
      .where(and(
        eq(paymentLinks.workspaceId, workspaceId),
        eq(paymentLinks.orderId, orderId),
        inArray(paymentLinks.status, LIVE_LINK_STATUSES),
      ))
      .orderBy(desc(paymentLinks.createdAt))
      .limit(1)

    if (existing?.status === 'active' && existing.checkoutUrl) return { action: 'return' as const, order, lines, link: existing }
    if (existing) return { action: 'recover' as const, order, lines, link: existing }

    const [link] = await tx.insert(paymentLinks).values({
      workspaceId,
      orderId,
      amountVnd: order.totalVnd,
      status: 'creating',
      expiresAt: order.holdExpiresAt,
    }).returning()
    return { action: 'create' as const, order, lines, link }
  })
}

export async function ensurePaymentLink(workspaceId: string, orderId: string, membershipId: string) {
  if (!isPayOSConfigured()) {
    throw new RequestError('payOS is not configured; no payment request was sent.', 503)
  }

  const prepared = await paymentLinkPreparation(workspaceId, orderId)
  if (prepared.action === 'return') return prepared.link

  try {
    const providerLink = prepared.action === 'recover'
      ? await getPayOSPaymentLink(prepared.order.orderCode)
      : await createPayOSPaymentLink({
          orderCode: prepared.order.orderCode,
          amountVnd: prepared.order.totalVnd,
          description: `Order ${prepared.order.orderCode}`,
          customerName: prepared.order.customerName,
          customerEmail: prepared.order.customerEmail,
          customerPhone: prepared.order.customerPhone,
          expiresAt: prepared.order.holdExpiresAt,
          items: prepared.lines.map((line) => ({ name: line.description, quantity: line.quantity, price: line.unitPriceVnd })),
        })

    if (providerLink.orderCode !== prepared.order.orderCode || providerLink.amount !== prepared.order.totalVnd) {
      await db.update(paymentLinks).set({ status: 'unknown', failureCode: 'PAYMENT_DETAILS_MISMATCH',
        failureMessage: 'payOS returned a different order code or amount; do not share the link.', updatedAt: new Date() })
        .where(eq(paymentLinks.id, prepared.link.id))
      throw new RequestError('payOS payment details do not match the held order. Manual review is required.', 409)
    }
    const providerId = 'paymentLinkId' in providerLink ? providerLink.paymentLinkId : providerLink.id
    const checkoutUrl = 'checkoutUrl' in providerLink ? providerLink.checkoutUrl : prepared.link.checkoutUrl
    const mappedStatus = mapPayOSStatus(providerLink.status)
    if (!checkoutUrl) {
      await db.update(paymentLinks).set({
        providerPaymentLinkId: providerId,
        status: 'unknown',
        failureCode: 'CHECKOUT_URL_UNAVAILABLE',
        failureMessage: 'payOS has the payment request but its checkout URL was not persisted. Manual review is required.',
        updatedAt: new Date(),
      }).where(and(
        eq(paymentLinks.id, prepared.link.id),
        inArray(paymentLinks.status, ['creating', 'unknown', 'active']),
      ))
      throw new RequestError('The payOS request exists but its checkout URL cannot be recovered safely.', 409)
    }
    const [updated] = await db.update(paymentLinks).set({
      providerPaymentLinkId: providerId,
      checkoutUrl,
      status: mappedStatus,
      failureCode: null,
      failureMessage: null,
      updatedAt: new Date(),
    }).where(and(
      eq(paymentLinks.id, prepared.link.id),
      eq(paymentLinks.workspaceId, workspaceId),
      inArray(paymentLinks.status, ['creating', 'unknown', 'active']),
    )).returning()
    if (!updated) {
      try { await cancelPayOSPaymentLink(providerId, 'Order is no longer payable') } catch { /* webhook handling remains authoritative */ }
      throw new RequestError('Order changed while its payment link was being created.', 409)
    }

    await db.insert(auditLogs).values({
      workspaceId,
      actorMembershipId: membershipId,
      action: 'payment_link.ready',
      entityType: 'payment_link',
      entityId: prepared.link.id,
      metadata: { orderId, orderCode: prepared.order.orderCode },
    })
    return updated
  } catch (error) {
    if (error instanceof RequestError) throw error
    if (prepared.action === 'recover') {
      await db.update(paymentLinks).set({
        status: 'unknown',
        failureCode: error instanceof Error ? error.name.slice(0, 120) : 'PAYOS_RECOVERY_ERROR',
        failureMessage: error instanceof Error ? error.message : 'Unable to determine existing payOS request state.',
        updatedAt: new Date(),
      }).where(and(
        eq(paymentLinks.id, prepared.link.id),
        inArray(paymentLinks.status, ['creating', 'unknown', 'active']),
      ))
      throw new RequestError('The existing payOS request state is uncertain; no duplicate request was created.', 502)
    }
    if (prepared.action === 'create') {
      let recoveredWithoutCheckoutUrl = false
      try {
        const recovered = await getPayOSPaymentLink(prepared.order.orderCode)
        await db.update(paymentLinks).set({
          providerPaymentLinkId: recovered.id,
          status: 'unknown',
          failureCode: 'CHECKOUT_URL_UNAVAILABLE',
          failureMessage: 'The create response was lost; payOS confirmed the request but GET does not return its checkout URL.',
          updatedAt: new Date(),
        }).where(and(
          eq(paymentLinks.id, prepared.link.id),
          inArray(paymentLinks.status, ['creating', 'unknown', 'active']),
        ))
        recoveredWithoutCheckoutUrl = true
      } catch (recoveryError) {
        await db.update(paymentLinks).set({
          status: 'unknown',
          failureCode: 'CREATE_RESULT_UNCERTAIN',
          failureMessage: recoveryError instanceof Error ? recoveryError.message : 'payOS recovery lookup failed.',
          updatedAt: new Date(),
        }).where(and(
          eq(paymentLinks.id, prepared.link.id),
          inArray(paymentLinks.status, ['creating', 'unknown', 'active']),
        ))
        throw new RequestError('The payOS create result is uncertain; no duplicate request was created.', 502)
      }
      if (recoveredWithoutCheckoutUrl) {
        throw new RequestError('payOS confirmed the request, but its checkout URL could not be recovered; no duplicate request was created.', 409)
      }
    }
    await db.update(paymentLinks).set({
      status: 'failed',
      failureCode: error instanceof Error ? error.name.slice(0, 120) : 'PAYOS_ERROR',
      failureMessage: error instanceof Error ? error.message : 'Unknown payOS error',
      updatedAt: new Date(),
    }).where(and(
      eq(paymentLinks.id, prepared.link.id),
      inArray(paymentLinks.status, ['creating', 'unknown', 'active']),
    ))
    throw new RequestError('Unable to create or recover the payOS payment link.', 502)
  }
}

export async function cancelOrder(workspaceId: string, orderId: string, membershipId: string, requestId?: string | null) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from orders where workspace_id = ${workspaceId} and id = ${orderId} for update`)
    const [order] = await tx.select().from(orders).where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, orderId)))
    if (!order) throw new RequestError('Order not found.', 404)
    if (order.status === 'cancelled' || order.status === 'expired') return order
    if (order.status !== 'awaiting_payment') {
      throw new RequestError('A paid or reviewed order cannot be cancelled automatically.', 409)
    }

    // Once payment creation has been attempted, do not release tickets until payOS confirms non-payment.
    const [link] = await tx.select({ id: paymentLinks.id }).from(paymentLinks).where(and(
      eq(paymentLinks.workspaceId, workspaceId), eq(paymentLinks.orderId, orderId),
    )).limit(1)
    if (link) throw new RequestError('A payment request may exist. Wait for provider reconciliation before releasing tickets.', 409)

    const activeHolds = await tx.select().from(ticketHolds).where(and(
      eq(ticketHolds.workspaceId, workspaceId), eq(ticketHolds.orderId, orderId), eq(ticketHolds.status, 'active'),
    ))
    const ticketIds = activeHolds.map((hold) => hold.ticketId)
    const now = new Date()
    await tx.update(ticketHolds).set({ status: 'released', releasedAt: now }).where(and(
      eq(ticketHolds.workspaceId, workspaceId), eq(ticketHolds.orderId, orderId), eq(ticketHolds.status, 'active'),
    ))
    if (ticketIds.length) {
      await tx.update(tickets).set({ status: 'available', updatedAt: now }).where(and(
        eq(tickets.workspaceId, workspaceId), inArray(tickets.id, ticketIds), eq(tickets.status, 'held'),
      ))
    }

    const [updated] = await tx.update(orders).set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, orderId))).returning()
    await tx.insert(auditLogs).values({
      workspaceId,
      actorMembershipId: membershipId,
      action: 'order.cancelled',
      entityType: 'order',
      entityId: orderId,
      requestId: requestId?.trim().slice(0, 120) || null,
      metadata: { releasedTicketIds: ticketIds },
    })
    return updated
  })
}

export async function deliverOrder(workspaceId: string, orderId: string, membershipId: string, input: unknown, requestId?: string | null) {
  const data = deliverInput.parse(input)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from orders where workspace_id = ${workspaceId} and id = ${orderId} for update`)
    const [order] = await tx.select().from(orders).where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, orderId)))
    if (!order) throw new RequestError('Order not found.', 404)
    if (order.status === 'fulfilled') return order
    if (order.status !== 'paid') throw new RequestError('Only a fully paid order can be delivered.', 409)

    const lines = await tx.select().from(orderLines).where(and(eq(orderLines.workspaceId, workspaceId), eq(orderLines.orderId, orderId)))
    if (!lines.length) throw new RequestError('Order has no tickets.', 409)
    const submittedIds = data.deliveries.map((delivery) => delivery.ticketId)
    if (unique(submittedIds).length !== submittedIds.length) throw new RequestError('Each ticket may have only one delivery proof.')
    const lineIds = new Set(lines.map((line) => line.ticketId))
    if (submittedIds.length !== lines.length || submittedIds.some((ticketId) => !lineIds.has(ticketId))) {
      throw new RequestError('A separate delivery proof is required for every ticket in the order.', 409)
    }
    const now = new Date()
    for (const proof of data.deliveries) {
      const recipientContact = proof.recipientContact || order.customerEmail || order.customerPhone
      await tx.insert(deliveries).values({
        workspaceId,
        orderId,
        ticketId: proof.ticketId,
        status: 'confirmed',
        recipientName: data.recipientName || order.customerName,
        recipientContact,
        method: data.method,
        evidenceReference: proof.evidenceReference,
        assignedMembershipId: membershipId,
        confirmedAt: now,
      }).onConflictDoUpdate({
        target: [deliveries.orderId, deliveries.ticketId],
        set: {
          status: 'confirmed',
          recipientName: data.recipientName || order.customerName,
          recipientContact,
          method: data.method,
          evidenceReference: proof.evidenceReference,
          assignedMembershipId: membershipId,
          confirmedAt: now,
          failureReason: null,
          updatedAt: now,
        },
      })
    }
    const [updated] = await tx.update(orders).set({ status: 'fulfilled', updatedAt: now })
      .where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, orderId))).returning()
    await tx.insert(auditLogs).values({
      workspaceId,
      actorMembershipId: membershipId,
      action: 'order.delivered',
      entityType: 'order',
      entityId: orderId,
      requestId: requestId?.trim().slice(0, 120) || null,
      metadata: {
        evidenceAttested: true,
        deliveries: data.deliveries.map((proof) => ({
          ticketId: proof.ticketId,
          evidenceReference: proof.evidenceReference,
        })),
      },
    })
    return updated
  })
}
