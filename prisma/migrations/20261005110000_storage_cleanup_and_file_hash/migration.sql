ALTER TABLE "File"
ADD COLUMN IF NOT EXISTS "fileHash" TEXT;

CREATE INDEX IF NOT EXISTS "File_userId_isTrash_idx" ON "File"("userId", "isTrash");
CREATE INDEX IF NOT EXISTS "File_userId_trashedAt_idx" ON "File"("userId", "trashedAt");
CREATE INDEX IF NOT EXISTS "File_userId_fileHash_idx" ON "File"("userId", "fileHash");
CREATE INDEX IF NOT EXISTS "Folder_userId_isTrash_idx" ON "Folder"("userId", "isTrash");
CREATE INDEX IF NOT EXISTS "Folder_userId_trashedAt_idx" ON "Folder"("userId", "trashedAt");

UPDATE "File"
SET "trashedAt" = "updatedAt"
WHERE "isTrash" = TRUE AND "trashedAt" IS NULL;

UPDATE "Folder"
SET "trashedAt" = "updatedAt"
WHERE "isTrash" = TRUE AND "trashedAt" IS NULL;
