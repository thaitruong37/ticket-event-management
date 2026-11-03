import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { cases, deliveries, orders, tickets } from '@/db/schema'
import { staffRequest } from '@/server/route'

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (staff) => {
    const [inventory] = await db.select({
      ready: sql<number>`count(*) filter (where ${tickets.status} = 'available')::int`,
      preparing: sql<number>`count(*) filter (where ${tickets.status} = 'preparing')::int`,
    }).from(tickets).where(eq(tickets.workspaceId, staff.workspaceId))
    const [sales] = await db.select({
      awaiting: sql<number>`count(*) filter (where ${orders.status} = 'awaiting_payment')::int`,
      review: sql<number>`count(*) filter (where ${orders.status} = 'payment_review')::int`,
    }).from(orders).where(eq(orders.workspaceId, staff.workspaceId))
    const [delivery] = await db.select({ pending: sql<number>`count(*)::int` }).from(deliveries)
      .where(and(eq(deliveries.workspaceId, staff.workspaceId), eq(deliveries.status, 'pending')))
    const [attention] = await db.select({ open: sql<number>`count(*)::int` }).from(cases)
      .where(and(eq(cases.workspaceId, staff.workspaceId), eq(cases.status, 'open')))
    return { inventory: inventory ?? { ready: 0, preparing: 0 }, orders: sales ?? { awaiting: 0, review: 0 },
      delivery: delivery?.pending ?? 0, cases: attention?.open ?? 0 }
  })
}
