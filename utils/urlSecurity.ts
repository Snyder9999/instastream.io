import dns from "node:dns/promises";
import net from "node:net";

function ipToLong(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function isPrivateIPv4(ip: string): boolean {
  const long = ipToLong(ip);

  // 0.0.0.0/8
  if ((long & 0xff000000) === 0x00000000) return true;
  // 10.0.0.0/8
  if (((long & 0xff000000) >>> 0) === 0x0a000000) return true;
  // 100.64.0.0/10
  if (((long & 0xffc00000) >>> 0) === 0x64400000) return true;
  // 127.0.0.0/8
  if (((long & 0xff000000) >>> 0) === 0x7f000000) return true;
  // 169.254.0.0/16
  if (((long & 0xffff0000) >>> 0) === 0xa9fe0000) return true;
  // 172.16.0.0/12
  if (((long & 0xfff00000) >>> 0) === 0xac100000) return true;
  // 192.0.0.0/24
  if (((long & 0xffffff00) >>> 0) === 0xc0000000) return true;
  // 192.0.2.0/24
  if (((long & 0xffffff00) >>> 0) === 0xc0000200) return true;
  // 192.88.99.0/24
  if (((long & 0xffffff00) >>> 0) === 0xc0586300) return true;
  // 192.168.0.0/16
  if (((long & 0xffff0000) >>> 0) === 0xc0a80000) return true;
  // 198.18.0.0/15
  if (((long & 0xfffe0000) >>> 0) === 0xc6120000) return true;
  // 198.51.100.0/24
  if (((long & 0xffffff00) >>> 0) === 0xc6336400) return true;
  // 203.0.113.0/24
  if (((long & 0xffffff00) >>> 0) === 0xcb007100) return true;
  // 224.0.0.0/4 (Multicast)
  if (((long & 0xf0000000) >>> 0) === 0xe0000000) return true;
  // 240.0.0.0/4 (Reserved)
  if (((long & 0xf0000000) >>> 0) === 0xf0000000) return true;
  // 255.255.255.255 (Broadcast)
  if (long === 0xffffffff) return true;

  return false;
}

function parseIPv6(ip: string): number[] | null {
  // Handle IPv4-mapped IPv6 ::ffff:192.168.1.1
  if (ip.includes('.')) {
    const lastColon = ip.lastIndexOf(':');
    const ipv4 = ip.substring(lastColon + 1);
    if (!net.isIPv4(ipv4)) return null;

    const parts = ipv4.split('.').map(Number);
    const part6 = (parts[0] << 8) + parts[1];
    const part7 = (parts[2] << 8) + parts[3];

    const prefix = ip.substring(0, lastColon);
    // Recursively parse the prefix part (expecting it to end with :)
    // Actually, ::ffff: returns [0,0,0,0,0,ffff] for ::ffff
    // Construct a temporary IPv6 string to parse prefix
    // E.g. ::ffff -> ::ffff:0:0

    // Simplest way: manually construct the 8 parts
    // But prefix might be ::, or 0:0:0:0:0:ffff

    // Let's rely on recursive call by replacing the IPv4 part with dummy 0:0
    const prefixIP = prefix + ':0:0';
    const prefixParts = parseIPv6(prefixIP);
    if (!prefixParts) return null;

    prefixParts[6] = part6;
    prefixParts[7] = part7;
    return prefixParts;
  }

  if (ip.indexOf('::') !== -1) {
    const doubleColon = ip.indexOf('::');
    if (ip.indexOf('::', doubleColon + 1) !== -1) return null;

    const head = ip.substring(0, doubleColon);
    const tail = ip.substring(doubleColon + 2);

    const headParts = head ? head.split(':').map(h => parseInt(h, 16)) : [];
    const tailParts = tail ? tail.split(':').map(t => parseInt(t, 16)) : [];

    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;

    return [...headParts, ...Array(missing).fill(0), ...tailParts];
  }

  const parts = ip.split(':');
  if (parts.length !== 8) return null;
  return parts.map(p => parseInt(p, 16));
}

function isPrivateIPv6(ip: string): boolean {
  const parts = parseIPv6(ip);
  if (!parts) return true; // Treat invalid as unsafe

  // ::1 (Loopback)
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 &&
      parts[4] === 0 && parts[5] === 0 && parts[6] === 0 && parts[7] === 1) return true;

  // :: (Unspecified)
  if (parts.every(p => p === 0)) return true;

  // fc00::/7 (Unique Local)
  if ((parts[0] & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (Link-Local)
  if ((parts[0] & 0xffc0) === 0xfe80) return true;

  // ff00::/8 (Multicast)
  if ((parts[0] & 0xff00) === 0xff00) return true;

  // 2001:db8::/32 (Documentation)
  if (parts[0] === 0x2001 && parts[1] === 0xdb8) return true;

  // IPv4-mapped ::ffff:0:0/96
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && parts[5] === 0xffff) {
    const p1 = (parts[6] >> 8) & 0xff;
    const p2 = parts[6] & 0xff;
    const p3 = (parts[7] >> 8) & 0xff;
    const p4 = parts[7] & 0xff;
    return isPrivateIPv4(`${p1}.${p2}.${p3}.${p4}`);
  }

  return false;
}

export async function isSafeUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    let hostname = parsed.hostname;

    // Remove brackets from IPv6 if present
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }

    // Check if hostname is an IP address
    if (net.isIP(hostname)) {
        if (net.isIPv4(hostname)) {
            return !isPrivateIPv4(hostname);
        } else if (net.isIPv6(hostname)) {
            return !isPrivateIPv6(hostname);
        }
        return false;
    }

    // Resolve hostname
    const addresses = await dns.lookup(hostname, { all: true });

    for (const address of addresses) {
      if (address.family === 4) {
        if (isPrivateIPv4(address.address)) return false;
      } else if (address.family === 6) {
        if (isPrivateIPv6(address.address)) return false;
      }
    }

    return true;
  } catch (error) {
    // If URL parsing fails or DNS lookup fails, treat as unsafe
    return false;
  }
}
