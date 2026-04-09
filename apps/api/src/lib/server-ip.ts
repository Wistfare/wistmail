let cachedIp: string | null = null
let cacheExpiry = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function getServerIp(): Promise<string> {
  if (cachedIp && Date.now() < cacheExpiry) return cachedIp

  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = (await response.json()) as { ip: string }
    cachedIp = data.ip
    cacheExpiry = Date.now() + CACHE_TTL_MS
    return cachedIp
  } catch {
    // Fallback: try alternative service
    const response = await fetch('https://checkip.amazonaws.com')
    const ip = (await response.text()).trim()
    cachedIp = ip
    cacheExpiry = Date.now() + CACHE_TTL_MS
    return ip
  }
}
