import dns from 'node:dns';
import net from 'node:net';

/**
 * Checks if an IP address falls within private or reserved ranges.
 * Supports IPv4 and IPv6.
 */
export function isPrivateIP(ip: string): boolean {
    const family = net.isIP(ip);
    if (family === 4) {
        const parts = ip.split('.').map(Number);
        // 127.0.0.0/8 - Loopback
        if (parts[0] === 127) return true;
        // 10.0.0.0/8 - Private
        if (parts[0] === 10) return true;
        // 172.16.0.0/12 - Private
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        // 192.168.0.0/16 - Private
        if (parts[0] === 192 && parts[1] === 168) return true;
        // 169.254.0.0/16 - Link-local
        if (parts[0] === 169 && parts[1] === 254) return true;
        // 0.0.0.0/8 - Current network (only valid as source)
        if (parts[0] === 0) return true;
        // 100.64.0.0/10 - Shared Address Space (CGNAT)
        if (parts[0] === 100 && (parts[1] & 192) === 64) return true;
        // 192.0.0.0/24 - IETF Protocol Assignments
        if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
        // 192.0.2.0/24 - TEST-NET-1
        if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
        // 198.18.0.0/15 - Benchmarking
        if (parts[0] === 198 && (parts[1] & 254) === 18) return true;
        // 198.51.100.0/24 - TEST-NET-2
        if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
        // 203.0.113.0/24 - TEST-NET-3
        if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
        // 224.0.0.0/4 - Multicast
        if ((parts[0] & 240) === 224) return true;
        // 240.0.0.0/4 - Reserved (future use)
        if ((parts[0] & 240) === 240) return true;
        // 255.255.255.255 - Broadcast
        if (parts[0] === 255 && parts[1] === 255 && parts[2] === 255 && parts[3] === 255) return true;

        return false;
    } else if (family === 6) {
        // Normalize IPv6 string is complex, but we can check common prefixes
        const normalized = ip.toLowerCase();

        // Loopback
        if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
        // Unspecified
        if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

        // IPv4-mapped IPv6 ::ffff:0:0/96
        if (normalized.startsWith('::ffff:')) {
            // Extract the IPv4 part
            const ipv4 = ip.substring(7);
            if (net.isIP(ipv4) === 4) return isPrivateIP(ipv4);
        }

        // We need to parse segments to check ranges properly
        // This is a simplified check for prefixes
        // fc00::/7 - Unique Local Unicast (fc00... to fdff...)
        if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
        // fe80::/10 - Link-Local Unicast (fe80... to febf...)
        if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
        // ff00::/8 - Multicast
        if (normalized.startsWith('ff')) return true;
        // 2001:db8::/32 - Documentation
        if (normalized.startsWith('2001:db8:')) return true;
        // 100::/64 - Discard-Only
        if (normalized.startsWith('100:')) return true; // simplified

        return false;
    }
    return false; // Not a valid IP
}

/**
 * Validates a URL to ensure it does not point to a private or reserved IP address.
 * Resolves DNS for hostnames and checks all returned IPs.
 */
export async function validateUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid URL format');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP(S) protocols are supported');
    }

    const hostname = parsed.hostname;

    // Remove square brackets from IPv6 literals
    const cleanHostname = hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;

    // Check if hostname is an IP literal
    if (net.isIP(cleanHostname)) {
        if (isPrivateIP(cleanHostname)) {
            throw new Error(`Access to private IP address ${cleanHostname} is denied`);
        }
        return;
    }

    // Resolve DNS
    return new Promise((resolve, reject) => {
        // dns.lookup mimics the system resolver (like ping or curl)
        dns.lookup(cleanHostname, { all: true, verbatim: true }, (err, addresses) => {
            if (err) {
                reject(new Error(`DNS resolution failed for ${cleanHostname}: ${err.message}`));
                return;
            }

            if (!addresses || addresses.length === 0) {
                reject(new Error(`No IP addresses found for ${cleanHostname}`));
                return;
            }

            // Check all resolved addresses
            for (const addr of addresses) {
                if (isPrivateIP(addr.address)) {
                    reject(new Error(`Host ${cleanHostname} resolves to private IP: ${addr.address}`));
                    return;
                }
            }
            resolve();
        });
    });
}
