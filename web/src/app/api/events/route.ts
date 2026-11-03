import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { events } from '@/db/schema'
import { staffRequest } from '@/server/route'
import { readJson } from '@/server/http'

const schema = z.object({
  name: z.string().trim().min(2).max(240), venueName: z.string().trim().max(240).optional(),
  city: z.string().trim().max(160).optional(), notes: z.string().max(2000).optional(),
})

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (session) =>
    db.select().from(events).where(eq(events.workspaceId, session.workspaceId)))
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (session) => {
    const data = schema.parse(await readJson(request))
    const [event] = await db.insert(events).values({ workspaceId: session.workspaceId, ...data }).returning()
    return event
  })
}
