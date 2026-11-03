import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { platforms } from '@/db/schema'
import { staffRequest } from '@/server/route'
import { readJson } from '@/server/http'

const schema = z.object({ name: z.string().trim().min(2).max(160), websiteUrl: z.url().optional(), notes: z.string().max(2000).optional() })

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (session) =>
    db.select().from(platforms).where(eq(platforms.workspaceId, session.workspaceId)))
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (session) => {
    const data = schema.parse(await readJson(request))
    const [platform] = await db.insert(platforms).values({ workspaceId: session.workspaceId, ...data }).returning()
    return platform
  })
}
