import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { tickets } from '@/db/schema'
import { addTicket } from '@/server/inventory'
import { readJson } from '@/server/http'
import { staffRequest } from '@/server/route'

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (staff) => {
    const rows = await db.select().from(tickets).where(eq(tickets.workspaceId, staff.workspaceId))
    return staff.role === 'finance' || staff.role === 'viewer'
      ? rows.map((ticket) => ({ id: ticket.id, eventSessionId: ticket.eventSessionId,
        ticketTierId: ticket.ticketTierId, section: ticket.section, row: ticket.row, seat: ticket.seat,
        askingPriceVnd: ticket.askingPriceVnd, status: ticket.status }))
      : rows
  })
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => addTicket(staff.workspaceId, await readJson(request)))
}
