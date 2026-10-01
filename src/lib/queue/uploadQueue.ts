import { Queue, Worker, type Processor, type QueueOptions, type WorkerOptions } from 'bullmq'
import Redis from 'ioredis'

export type UploadProcessingJob = {
    kind: 'file.uploaded'
    userId: string
    fileId: string
    versionId: string
    s3Key: string
    mimeType: string
    sizeBytes: number
}

const QUEUE_NAME = 'drivea:file-processing'
let queue: Queue<UploadProcessingJob> | undefined

function createRedisConnection() {
    const redisUrl = process.env.REDIS_URL?.trim()
    if (!redisUrl) throw new Error('REDIS_URL is required by the upload processing worker.')
    return new Redis(redisUrl, { maxRetriesPerRequest: null })
}

function queueOptions(): QueueOptions {
    return { connection: createRedisConnection() }
}

export function getUploadQueue() {
    queue ??= new Queue<UploadProcessingJob>(QUEUE_NAME, {
        ...queueOptions(),
        defaultJobOptions: {
            attempts: 8,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
        },
    })
    return queue
}

export async function enqueueUploadProcessing(job: UploadProcessingJob) {
    return getUploadQueue().add(job.kind, job, { jobId: job.versionId })
}

export function startUploadWorker(
    processor: Processor<UploadProcessingJob>,
    options: Pick<WorkerOptions, 'concurrency'> = { concurrency: 8 },
) {
    return new Worker<UploadProcessingJob>(QUEUE_NAME, processor, {
        connection: createRedisConnection(),
        concurrency: options.concurrency ?? 8,
    })
}