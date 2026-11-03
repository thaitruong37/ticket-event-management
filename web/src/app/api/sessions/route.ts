import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { events, eventSessions } from '@/db/schema'
import { readJson, RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({ eventId: z.uuid(), name: z.string().trim().min(1).max(160), startsAt: z.iso.datetime({ offset: true }) })

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (staff) =>
    db.select().from(eventSessions).where(eq(eventSessions.workspaceId, staff.workspaceId)))
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (staff) => {
    const data = schema.parse(await readJson(request))
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.workspaceId, staff.workspaceId), eq(events.id, data.eventId)))
    if (!event) throw new RequestError('Sự kiện không tồn tại.', 404)
    const [session] = await db.insert(eventSessions).values({
      workspaceId: staff.workspaceId, eventId: data.eventId, name: data.name, startsAt: new Date(data.startsAt),
    }).returning()
    return session
  })
}
