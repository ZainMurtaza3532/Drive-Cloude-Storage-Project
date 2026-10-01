import type { Prisma } from '@prisma/client'

export const fileListSelect = {
  id: true,
  name: true,
  folderId: true,
  updatedAt: true,
  isStarred: true,
  isTrash: true,
  trashedAt: true,
  user: { select: { name: true } },
  versions: {
    where: { isCurrent: true },
    select: { size: true, mimeType: true, isEncrypted: true, originalMimeType: true, originalSize: true, encryptionChunkSize: true },
    take: 1,
  },
} satisfies Prisma.FileSelect

type ListedFile = Prisma.FileGetPayload<{ select: typeof fileListSelect }>

export function toDriveFilePayload(file: ListedFile, owner = file.user.name || 'You') {
  const currentVersion = file.versions[0]
  return {
    id: file.id,
    name: file.name,
    size: Number(currentVersion?.size ?? 0),
    mimeType: currentVersion?.mimeType ?? 'application/octet-stream',
    isEncrypted: currentVersion?.isEncrypted ?? false,
    originalMimeType: currentVersion?.originalMimeType ?? null,
    originalSize: currentVersion?.originalSize === null || currentVersion?.originalSize === undefined
      ? null
      : Number(currentVersion.originalSize),
    encryptionChunkSize: currentVersion?.encryptionChunkSize ?? null,
    folderId: file.folderId,
    owner,
    updatedAt: file.updatedAt.toISOString(),
    isStarred: file.isStarred,
    isTrash: file.isTrash,
    trashedAt: file.trashedAt?.toISOString() ?? null,
  }
}

export function contentDispositionFilename(filename: string) {
  return encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}