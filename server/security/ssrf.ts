import dns from 'dns/promises';
import net from 'net';

const ALLOWED_OFFICIAL_DOMAINS = [
  'secp.gov.pk',
  'fbr.gov.pk',
  'srb.gos.pk',
  'pakistancode.gov.pk',
  'commerce.gov.pk',
  'eobi.gov.pk',
  'punjab.gov.pk',
  'sindh.gov.pk',
  'kp.gov.pk',
  'balochistan.gov.pk',
  'pra.punjab.gov.pk',
  'kpra.gov.pk',
  'bra.gob.pk',
  'invest.gov.pk',
];

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
  }
  return true;
}

export function isAllowedOfficialHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_OFFICIAL_DOMAINS.some(
    (domain) => clean === domain || clean.endsWith(`.${domain}`)
  );
}

export async function validateOfficialUrl(rawUrl: string): Promise<{ ok: boolean; url?: URL; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only HTTP/HTTPS URLs are permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || net.isIP(hostname)) {
    return { ok: false, error: 'Direct IP addresses and local hosts are blocked for security.' };
  }

  if (!isAllowedOfficialHost(hostname)) {
    return {
      ok: false,
      error: `Domain "${hostname}" is not in the verified Pakistani government allowlist (${ALLOWED_OFFICIAL_DOMAINS.slice(0, 5).join(', ')}, etc.).`,
    };
  }

  try {
    const resolved = await dns.lookup(hostname, { all: true });
    if (!resolved.length) {
      return { ok: false, error: 'Could not resolve official host DNS.' };
    }
    for (const addr of resolved) {
      if (isPrivateIp(addr.address)) {
        return { ok: false, error: 'Resolved host IP falls within a blocked private network range.' };
      }
    }
  } catch {
    return { ok: false, error: `DNS resolution failed for "${hostname}".` };
  }

  return { ok: true, url: parsed };
}

export function sanitizeTextInput(text: string, maxLen = 4000): string {
  return String(text || '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLen);
}
