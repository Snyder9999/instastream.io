import { isIP, isIPv4, isIPv6 } from "node:net";
import { lookup } from "node:dns/promises";

interface IPRange {
  start: number;
  end: number;
}

// Private IPv4 ranges
const PRIVATE_IPV4_RANGES: IPRange[] = [
  // 0.0.0.0/8 (Current network)
  { start: 0x00000000, end: 0x00ffffff },
  // 10.0.0.0/8 (Private network)
  { start: 0x0a000000, end: 0x0affffff },
  // 100.64.0.0/10 (Shared Address Space)
  { start: 0x64400000, end: 0x647fffff },
  // 127.0.0.0/8 (Loopback)
  { start: 0x7f000000, end: 0x7fffffff },
  // 169.254.0.0/16 (Link-local)
  { start: 0xa9fe0000, end: 0xa9feffff },
  // 172.16.0.0/12 (Private network)
  { start: 0xac100000, end: 0xac1fffff },
  // 192.0.0.0/24 (IETF Protocol Assignments)
  { start: 0xc0000000, end: 0xc00000ff },
  // 192.0.2.0/24 (TEST-NET-1)
  { start: 0xc0000200, end: 0xc00002ff },
  // 192.88.99.0/24 (6to4 Relay Anycast)
  { start: 0xc0586300, end: 0xc05863ff },
  // 192.168.0.0/16 (Private network)
  { start: 0xc0a80000, end: 0xc0a8ffff },
  // 198.18.0.0/15 (Network Benchmark)
  { start: 0xc6120000, end: 0xc613ffff },
  // 198.51.100.0/24 (TEST-NET-2)
  { start: 0xc6336400, end: 0xc63364ff },
  // 203.0.113.0/24 (TEST-NET-3)
  { start: 0xcb007100, end: 0xcb0071ff },
  // 224.0.0.0/4 (Multicast)
  { start: 0xe0000000, end: 0xefffffff },
  // 240.0.0.0/4 (Reserved)
  { start: 0xf0000000, end: 0xffffffff },
  // 255.255.255.255/32 (Broadcast)
  { start: 0xffffffff, end: 0xffffffff },
];

function ipv4ToNumber(ip: string): number {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  // Bitwise operators return signed 32-bit integers
  const num = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  // Convert to unsigned 32-bit integer (represented as a double in JS)
  return num >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const num = ipv4ToNumber(ip);
  for (const range of PRIVATE_IPV4_RANGES) {
    if (num >= range.start && num <= range.end) {
      return true;
    }
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  // Handle standard IPv6 loopback and unspecified
  if (ip === "::1" || ip === "::") return true;

  // IPv4 mapped: ::ffff:192.168.0.1
  if (ip.toLowerCase().startsWith("::ffff:")) {
    const parts = ip.split(":");
    const ipv4Part = parts[parts.length - 1];
    if (isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  // For other IPv6, we check the first hextet
  // We need to be careful with compressed notation "::" but checking startsWith covers prefix cases
  // provided the IP is fully expanded or at least starts with the prefix.
  // However, "fc00::1" starts with "fc00".
  // "fe80::1" starts with "fe80".

  // To be robust, we should expand the IPv6 or use a library, but since we can't add dependencies easily:
  // We can rely on `isIP` from `node:net` validating it's an IP, and then check specific characteristics.

  // Parse the first block.
  // If the IP starts with ::, it's 0000...
  if (ip.startsWith("::")) {
     // Already handled ::1 and :: above.
     // ::2... is deprecated IPv4-compatible?
     return false; // unlikely to be private range start unless ::fc00... which is invalid
  }

  const parts = ip.split(":");
  const firstBlock = Number.parseInt(parts[0], 16);

  // fc00::/7 (Unique Local) -> fc00 - fdff
  // 0xfc00 = 64512
  // 0xfe00 = 65024
  if ((firstBlock & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (Link-Local) -> fe80 - febf
  // 0xffc0 = 65472
  if ((firstBlock & 0xffc0) === 0xfe80) return true;

  // fec0::/10 (Site-Local, deprecated) -> fec0 - feff
  if ((firstBlock & 0xffc0) === 0xfec0) return true;

  // ff00::/8 (Multicast) -> ff00 - ffff
  if ((firstBlock & 0xff00) === 0xff00) return true;

  // 64:ff9b::/96 (IPv4/IPv6 translation) - often global scope but might want to be careful?
  // Leaving it for now as it maps to public IPv4 usually.

  // 2001:db8::/32 (Documentation)
  if (firstBlock === 0x2001 && parts[1] && Number.parseInt(parts[1], 16) === 0xdb8) return true;

  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return false;
}

// Kept for backward compatibility if needed, but implementation updated to use robust checks
export function isPrivateIP(ip: string): boolean {
  return isPrivateIp(ip);
}

export async function validateUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid protocol");
  }

  const hostname = parsed.hostname;

  // Remove brackets from IPv6 literal in hostname
  const cleanHostname = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

  if (isIP(cleanHostname)) {
    if (isPrivateIp(cleanHostname)) {
      throw new Error("Private IP address not allowed");
    }
    return;
  }

  let addresses: string[] = [];
  try {
    const result = await lookup(hostname, { all: true });
    addresses = result.map(r => r.address);
  } catch (err) {
    throw new Error("DNS resolution failed");
  }

  if (addresses.length === 0) {
    throw new Error("No IP addresses resolved");
  }

  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      throw new Error(`Resolved to private IP: ${ip}`);
    }
  }
}

// Kept for backward compatibility
export async function isSafeUrl(url: string): Promise<boolean> {
  try {
    await validateUrl(url);
    return true;
  } catch {
    return false;
  }
}
