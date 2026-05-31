const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const secret = process.env.CRON_SECRET
const url = new URL('/api/cron/audit-checksum', baseUrl)

const response = await fetch(url, {
  headers: secret ? { Authorization: `Bearer ${secret}` } : {},
})

const text = await response.text()
if (!response.ok) {
  console.error(`Audit checksum failed: HTTP ${response.status}`)
  console.error(text)
  process.exit(1)
}

console.log(text)
