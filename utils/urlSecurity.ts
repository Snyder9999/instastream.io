import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Checks if an IP address is in a private or local range.
 * This covers IPv4 and IPv6 private, loopback, and link-local addresses.
 */
export function isPrivateIP(ip: string): boolean {
  let normalizedIp = ip;
  let ipType = isIP(ip);

  // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  if (ipType === 6 && normalizedIp.toLowerCase().startsWith("::ffff:")) {
    const mappedIpv4 = normalizedIp.substring(7);
    const mappedType = isIP(mappedIpv4);
    if (mappedType === 4) {
      normalizedIp = mappedIpv4;
      ipType = 4;
    }
  }

  if (ipType === 4) {
    const parts = normalizedIp.split(".").map((s) => parseInt(s, 10));
    const [oct1, oct2] = parts;
    // 10.0.0.0/8
    if (oct1 === 10) return true;
    // 172.16.0.0/12
    if (oct1 === 172 && oct2 >= 16 && oct2 <= 31) return true;
    // 192.168.0.0/16
    if (oct1 === 192 && oct2 === 168) return true;
    // 127.0.0.0/8
    if (oct1 === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (oct1 === 169 && oct2 === 254) return true;
    // 0.0.0.0/8
    if (oct1 === 0) return true;
    return false;
  } else if (ipType === 6) {
    const lowerIp = normalizedIp.toLowerCase();
    // Loopback ::1
    if (lowerIp === "::1" || lowerIp === "0:0:0:0:0:0:0:1") return true;
    // Unique Local Address fc00::/7
    if (lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) return true;
    // Link Local fe80::/10
    if (lowerIp.startsWith("fe8") || lowerIp.startsWith("fe9") ||
        lowerIp.startsWith("fea") || lowerIp.startsWith("feb")) return true;
    // Unspecified ::
    if (lowerIp === "::" || lowerIp === "0:0:0:0:0:0:0:0") return true;
    return false;
  }
  return true; // Unknown IP type, block for safety
}

/**
 * Validates if a URL is safe to fetch from a server context.
 * It checks the protocol (must be http/https) and ensures the hostname
 * doesn't resolve to any private or local IP addresses.
 */
export async function isSafeUrl(urlStr: string): Promise<boolean> {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Explicitly block common local hostnames just in case
    if (hostname === "localhost" || hostname === "localhost.localdomain") {
      return false;
    }

    const ipType = isIP(hostname);

    if (ipType !== 0) {
      // Hostname is already an IP address
      if (isPrivateIP(hostname)) return false;
    } else {
      // Resolve hostname and check ALL associated IP addresses
      try {
        const addresses = await lookup(hostname, { all: true });
        if (addresses.length === 0) return false;

        for (const addr of addresses) {
          if (isPrivateIP(addr.address)) {
            return false;
          }
        }
      } catch (err) {
        // If resolution fails, it's not a safe URL we can reach
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
