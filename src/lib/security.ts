import { createHmac } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis as UpstashRedis } from '@upstash/redis'
import Redis from 'ioredis'
import { z } from 'zod'
import {
    MULTIPART_MAX_BYTES,
    MULTIPART_MAX_PARTS,
    SINGLE_PUT_MAX_BYTES,
} from './upload-constraints'

const redisUrl = process.env.REDIS_URL?.trim()
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim()
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
let redis: Redis | undefined
let upstashRedis: UpstashRedis | undefined
const upstashLimiters = new Map<keyof typeof RATE_LIMITS, Ratelimit>()
const localBuckets = new Map<string, { count: number; resetAt: number }>()
let warnedRateLimitUnavailable = false

export const RATE_LIMITS = {
    auth: { limit: 10, windowSeconds: 60 },
    registration: { limit: 5, windowSeconds: 3_600 },
    upload: { limit: 120, windowSeconds: 60 },
} as const

export const registrationSchema = z.object({
    name: z.string().trim().max(100).optional(),
    email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
    password: z.string().min(12).refine((password) => new TextEncoder().encode(password).length <= 72),
})

export const uploadDetailsSchema = z.object({
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().min(1).max(255).optional(),
    size: z.number().int().safe().nonnegative().max(MULTIPART_MAX_BYTES),
    folderId: z.string().uuid().nullable().optional(),
    encrypted: z.boolean().optional(),
})

export const multipartPartRequestSchema = z.object({
    fileId: z.string().uuid(),
    uploadId: z.string().min(1).max(2048),
    partNumbers: z.array(z.number().int().min(1).max(MULTIPART_MAX_PARTS)).min(1).max(100),
}).refine((data) => new Set(data.partNumbers).size === data.partNumbers.length, {
    message: 'Part numbers must be unique.',
    path: ['partNumbers'],
})

export const multipartSessionSchema = z.object({
    fileId: z.string().uuid(),
    uploadId: z.string().min(1).max(2048),
})

export const uploadCompletionSchema = z.object({
    fileId: z.string().uuid(),
    versionId: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().min(1).max(255).optional(),
    size: z.number().int().safe().nonnegative().max(MULTIPART_MAX_BYTES),
    folderId: z.string().uuid().nullable().optional(),
    encrypted: z.boolean().optional(),
    originalMimeType: z.string().min(1).max(255).nullable().optional(),
    originalSize: z.number().int().safe().nonnegative().max(MULTIPART_MAX_BYTES).nullable().optional(),
    encryptionChunkSize: z.number().int().positive().nullable().optional(),
})

type JsonBodyResult<T> = { data: T; response?: never } | { data?: never; response: Response }

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<JsonBodyResult<T>> {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return { response: Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }) }
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        return {
            response: Response.json({ error: 'Invalid request body.', details: parsed.error.flatten() }, { status: 400 }),
        }
    }

    return { data: parsed.data }
}

export async function enforceRateLimit(subject: string, policyName: keyof typeof RATE_LIMITS): Promise<Response | null> {
    const policy = RATE_LIMITS[policyName]
    const now = Date.now()
    const keySecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'drivea-development-rate-limit-key'
    const hashedSubject = createHmac('sha256', keySecret).update(subject).digest('hex')
    const bucketKey = `drivea:rate-limit:${policyName}:${hashedSubject}`

    if (upstashUrl && upstashToken) {
        try {
            upstashRedis ??= new UpstashRedis({ url: upstashUrl, token: upstashToken })
            let limiter = upstashLimiters.get(policyName)
            if (!limiter) {
                limiter = new Ratelimit({
                    redis: upstashRedis,
                    limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowSeconds} s`),
                    prefix: `drivea:rate-limit:${policyName}`,
                    analytics: false,
                })
                upstashLimiters.set(policyName, limiter)
            }

            const result = await limiter.limit(hashedSubject)
            return result.success ? null : rateLimitedResponse(Math.max(1, Math.ceil((result.reset - now) / 1_000)), result.limit, result.remaining, result.reset)
        } catch {
            if (process.env.NODE_ENV === 'production') {
                return Response.json({ error: 'Rate limiting is temporarily unavailable.' }, { status: 503 })
            }
        }
    }

    if (redisUrl) {
        try {
            redis ??= new Redis(redisUrl, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
                commandTimeout: 1_000,
            }).on('error', () => undefined)
            const count = Number(await redis.eval(
                "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
                1,
                bucketKey,
                policy.windowSeconds,
            ))
            return count > policy.limit ? rateLimitedResponse(policy.windowSeconds) : null
        } catch {
            if (process.env.NODE_ENV === 'production') {
                return Response.json({ error: 'Rate limiting is temporarily unavailable.' }, { status: 503 })
            }
        }
    } else if (process.env.NODE_ENV === 'production') {
        if (!warnedRateLimitUnavailable) {
            console.warn('Distributed rate limiting is not configured. Skipping rate limit checks.')
            warnedRateLimitUnavailable = true
        }
        return null
    }

    const current = localBuckets.get(bucketKey)
    if (!current || current.resetAt <= now) {
        localBuckets.set(bucketKey, { count: 1, resetAt: now + policy.windowSeconds * 1_000 })
        return null
    }

    current.count += 1
    return current.count > policy.limit
        ? rateLimitedResponse(Math.max(1, Math.ceil((current.resetAt - now) / 1_000)))
        : null
}

function rateLimitedResponse(retryAfterSeconds: number, limit?: number, remaining = 0, reset?: number) {
    const headers = new Headers({
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Remaining': String(remaining),
    })
    if (limit !== undefined) headers.set('X-RateLimit-Limit', String(limit))
    if (reset !== undefined) headers.set('X-RateLimit-Reset', String(Math.ceil(reset / 1_000)))

    return Response.json(
        { error: 'Too many requests. Please retry later.' },
        { status: 429, headers },
    )
}

export function applySecurityHeaders(headers: Headers, contentSecurityPolicy: string) {
    headers.set('Content-Security-Policy', contentSecurityPolicy)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    headers.set('X-Frame-Options', 'DENY')
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (process.env.NODE_ENV === 'production') {
        headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    }
}

export function createContentSecurityPolicy() {
    const scriptPolicy = process.env.NODE_ENV === 'development'
        ? "'self' 'unsafe-inline' 'unsafe-eval'"
        : "'self' 'unsafe-inline'"
    const storageOrigin = process.env.S3_ENDPOINT
        ? new URL(process.env.S3_ENDPOINT).origin
        : `https://s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com`
    const extraConnectSources = (process.env.CSP_EXTRA_CONNECT_SRC || '').split(/\s+/).filter(Boolean)
    const connectSources = ["'self'", storageOrigin, ...extraConnectSources].join(' ')

    return [
        "default-src 'self'",
        `script-src ${scriptPolicy}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        `connect-src ${connectSources}`,
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        'upgrade-insecure-requests',
    ].join('; ')
}

export { SINGLE_PUT_MAX_BYTES }