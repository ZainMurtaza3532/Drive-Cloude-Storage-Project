import { DeleteObjectsCommand, S3Client, PutObjectCommand, GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MULTIPART_CHUNK_SIZE, MULTIPART_MAX_PARTS } from './upload-constraints'

const s3Client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT, // Supabase S3 Endpoint
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
  },
  forcePathStyle: true, // Required for Supabase Storage
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME as string;

/**
 * Generate a presigned URL for uploading a file to S3
 */
export async function generateUploadUrl(key: string, mimeType: string, expiresIn = 900) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function initiateMultipartUpload(key: string, mimeType: string) {
  const result = await s3Client.send(new CreateMultipartUploadCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  }));
  if (!result.UploadId) throw new Error('S3 did not return a multipart upload ID.');
  return result.UploadId;
}

export async function generateMultipartPartUrl(key: string, uploadId: string, partNumber: number, expiresIn = 900) {
  return getSignedUrl(s3Client, new UploadPartCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  }), { expiresIn });
}

export async function listMultipartParts(key: string, uploadId: string) {
  const parts: Array<{ PartNumber: number; ETag: string; Size: number }> = [];
  let marker: string | undefined;
  do {
    const result = await s3Client.send(new ListPartsCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumberMarker: marker,
    }));
    for (const part of result.Parts ?? []) {
      if (part.PartNumber && part.ETag && part.Size !== undefined) {
        parts.push({ PartNumber: part.PartNumber, ETag: part.ETag, Size: part.Size });
      }
    }
    marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
  } while (marker !== undefined);
  return parts;
}

export async function completeMultipartUpload(key: string, uploadId: string, expectedSize: number, mimeType: string) {
  const alreadyCompleted = async () => {
    const object = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key })).catch(() => null);
    return object?.ContentLength === expectedSize && object.ContentType === mimeType;
  };

  let parts: Awaited<ReturnType<typeof listMultipartParts>>;
  try {
    parts = await listMultipartParts(key, uploadId);
  } catch (error) {
    if (error instanceof Error && ['NoSuchUpload', 'NoSuchUploadException'].includes(error.name) && await alreadyCompleted()) {
      return undefined;
    }
    throw error;
  }
  if (!parts.length) throw new Error('Multipart upload has no uploaded parts.');
  parts.sort((left, right) => left.PartNumber - right.PartNumber);
  const partsAreContiguous = parts.every((part, index) => part.PartNumber === index + 1);
  const uploadedSize = parts.reduce((total, part) => total + part.Size, 0);
  if (!partsAreContiguous || parts.length > MULTIPART_MAX_PARTS || uploadedSize !== expectedSize ||
    parts.slice(0, -1).some((part) => part.Size < 5 * 1024 * 1024) ||
    parts.some((part) => part.Size > 5 * 1024 * 1024 * 1024)) {
    throw new Error('Uploaded parts do not match the expected multipart upload.');
  }

  try {
    return await s3Client.send(new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })) },
    }));
  } catch (error) {
    if (!(error instanceof Error) || !['NoSuchUpload', 'NoSuchUploadException'].includes(error.name)) throw error;
    if (await alreadyCompleted()) return undefined;
    throw error;
  }
}

/**
 * Generate a presigned URL for downloading/viewing a file from S3
 */
export async function generateDownloadUrl(
  key: string,
  expiresIn = 300,
  options: { responseContentDisposition?: string; responseContentType?: string } = {}
) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: options.responseContentDisposition,
    ResponseContentType: options.responseContentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteS3Objects(keys: string[]) {
  for (let index = 0; index < keys.length; index += 1000) {
    const response = await s3Client.send(new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: keys.slice(index, index + 1000).map((Key) => ({ Key })),
        Quiet: true,
      },
    }));

    if (response.Errors?.length) {
      throw new Error('S3 failed to delete one or more objects.');
    }
  }
}

export default s3Client;
