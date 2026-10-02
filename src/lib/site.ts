const configuredSiteUrl = process.env.SITE_URL?.trim() || 'https://drive-cloude-storage.vercel.app'

export const SITE_URL = new URL(configuredSiteUrl)