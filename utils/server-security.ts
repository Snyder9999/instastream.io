import { lookup } from 'node:dns/promises';
import { isIP, isIPv4, isIPv6 } from 'node:net';

/**
 * Checks if an IP address is private or reserved.
 * Supports IPv4 and IPv6.
 */
function isPrivateIP(ip: string): boolean {
  if (!isIP(ip)) {
    return false;
  }

  const family = isIPv6(ip) ? 6 : 4;

  if (family === 4) {
    // IPv4 Private Ranges
    // 10.0.0.0/8
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    // 192.168.0.0/16
    // 127.0.0.0/8 (Loopback)
    // 169.254.0.0/16 (Link-local)

    const parts = ip.split('.').map(Number);
    if (parts[0] === 0) return true; // 0.0.0.0/8 (Current network)
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;

    return false;
  } else {
    // IPv6 Private Ranges
    // ::1/128 (Loopback)
    // fc00::/7 (Unique Local Address)
    // fe80::/10 (Link-local)

    // Normalize IPv6 is complex. We rely on standard representations or simplified checks.
    // However, IPv6 can be represented in many ways (leading zeros, :: compression).
    // Node's isIPv6 validates format.

    // Check loopback (::1 or 0:0:0:0:0:0:0:1)
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;

    // Check unspecified (:: or 0:0:0:0:0:0:0:0)
    if (ip === '::' || ip === '0:0:0:0:0:0:0:0') return true;

    // Check Unique Local Address (fc00::/7 -> fc00...fdff)
    // The first hextet must match fc.. or fd..
    // Remove zone index if present
    const ipNoZone = ip.split('%')[0].toLowerCase();

    // Expand :: to full form to be safe? Or just check start.
    // If it starts with f[c|d], it's ULA.
    if (ipNoZone.startsWith('fc') || ipNoZone.startsWith('fd')) return true;

    // Check Link-Local (fe80::/10 -> fe80...febf)
    if (ipNoZone.startsWith('fe8') || ipNoZone.startsWith('fe9') || ipNoZone.startsWith('fea') || ipNoZone.startsWith('feb')) return true;

    // IPv4 mapped IPv6: ::ffff:127.0.0.1
    if (ipNoZone.includes('.')) {
        // If it looks like IPv4 mapped, extract the last part.
        const parts = ipNoZone.split(':');
        const lastPart = parts[parts.length - 1];
        if (isIPv4(lastPart)) {
            return isPrivateIP(lastPart);
        }
    }

    return false;
  }
}

/**
 * Validates a URL to ensure it is safe to fetch (SSRF protection).
 * @param url The URL to validate.
 * @throws Error if the URL is invalid or points to a private/reserved IP.
 */
export async function isSafeUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid protocol: only http and https are allowed');
  }

  // Resolve hostname
  try {
    const addresses = await lookup(parsed.hostname, { all: true });

    for (const { address } of addresses) {
        if (isPrivateIP(address)) {
            throw new Error(`Access to private IP ${address} is forbidden (resolved from ${parsed.hostname})`);
        }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Access to private IP')) {
      throw err;
    }
    // DNS resolution failure
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`DNS resolution failed for ${parsed.hostname}: ${message}`);
  }
}
