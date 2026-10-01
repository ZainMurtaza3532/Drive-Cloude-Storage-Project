/**
 * Calculates the percentage of storage used
 */
export function calculateStoragePercentage(used: number | bigint, limit: number | bigint): number {
  const usedNum = Number(used);
  const limitNum = Number(limit);
  if (limitNum === 0) return 100;

  const percentage = (usedNum / limitNum) * 100;
  return Math.min(percentage, 100);
}

/**
 * Formats bytes to human readable format (MB, GB, etc.)
 */
export function formatBytes(bytes: number | bigint, decimals = 2) {
  const bytesNum = Number(bytes);
  if (!+bytesNum) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytesNum) / Math.log(k));
  return `${parseFloat((bytesNum / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
