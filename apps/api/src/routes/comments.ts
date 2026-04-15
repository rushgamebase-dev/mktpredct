import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import { verifyMessage } from 'viem'
import { comments } from '@rush/shared/db/schema'
import type { CommentsResponse, Comment } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

// GET /api/markets/:address/comments
app.get('/:address/comments', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()

    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.marketAddress, address))
      .orderBy(desc(comments.createdAt))
      .limit(50)

    const response: CommentsResponse = {
      comments: rows.map((row): Comment => ({
        id: row.id,
        marketAddress: row.marketAddress,
        userAddress: row.userAddress,
        content: row.content,
        createdAt: row.createdAt,
      })),
    }

    return c.json(response)
  } catch (err) {
    console.error('[comments] GET error:', err)
    return c.json({ error: 'Failed to fetch comments' }, 500)
  }
})

// POST /api/markets/:address/comments
app.post('/:address/comments', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()
    const body = await c.req.json<{ content: string; userAddress: string; signature: string }>()

    if (!body.content || body.content.length < 1 || body.content.length > 500) {
      return c.json({ error: 'Content must be between 1 and 500 characters' }, 400)
    }

    if (!body.userAddress) {
      return c.json({ error: 'userAddress is required' }, 400)
    }

    if (!body.signature) {
      return c.json({ error: 'signature is required' }, 400)
    }

    // Verify the user signed this comment (EIP-191 personal_sign)
    const message = `Rush Markets comment on ${address}:\n${body.content}`
    try {
      const valid = await verifyMessage({
        address: body.userAddress as `0x${string}`,
        message,
        signature: body.signature as `0x${string}`,
      })
      if (!valid) {
        return c.json({ error: 'Invalid signature' }, 401)
      }
    } catch {
      return c.json({ error: 'Invalid signature' }, 401)
    }

    const now = Math.floor(Date.now() / 1000)

    const [inserted] = await db
      .insert(comments)
      .values({
        marketAddress: address,
        userAddress: body.userAddress.toLowerCase(),
        content: body.content,
        createdAt: now,
      })
      .returning()

    const comment: Comment = {
      id: inserted.id,
      marketAddress: inserted.marketAddress,
      userAddress: inserted.userAddress,
      content: inserted.content,
      createdAt: inserted.createdAt,
    }

    return c.json(comment, 201)
  } catch (err) {
    console.error('[comments] POST error:', err)
    return c.json({ error: 'Failed to create comment' }, 500)
  }
})

export default app
