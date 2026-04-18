export function parseIpv6(address: string): bigint {
  const raw = address.trim().split('%')[0];
  if (!raw) throw new Error('Invalid IPv6 address');
  const hasDoubleColon = raw.includes('::');
  const [left, right] = raw.split('::');

  const normalizeSegment = (segment: string): string[] => {
    if (!segment) return [];
    return segment.split(':').flatMap((part) => {
      if (part.includes('.')) {
        const dots = part.split('.');
        if (dots.length !== 4) throw new Error('Invalid IPv4-mapped segment');
        const bytes = dots.map((n) => {
          const value = Number(n);
          if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Invalid IPv4-mapped segment');
          return value;
        });
        return [((bytes[0] << 8) | bytes[1]).toString(16), ((bytes[2] << 8) | bytes[3]).toString(16)];
      }
      return [part];
    });
  };

  const leftGroups = normalizeSegment(left || '');
  const rightGroups = normalizeSegment(right || '');

  let groups: string[] = [];
  if (hasDoubleColon) {
    const missing = 8 - leftGroups.length - rightGroups.length;
    if (missing < 0) throw new Error('Invalid IPv6 address');
    groups = [...leftGroups, ...Array(missing).fill('0'), ...rightGroups];
  } else {
    groups = [...leftGroups];
    if (groups.length !== 8) throw new Error('Invalid IPv6 address');
  }

  if (groups.length !== 8) {
    throw new Error('Invalid IPv6 address');
  }

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) throw new Error('Invalid IPv6 group');
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }

  return value;
}

export function formatIpv6(value: bigint): string {
  const groups: string[] = [];
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    groups.unshift((Number(v & 0xffffn)).toString(16));
    v >>= 16n;
  }

  let bestStart = -1;
  let bestLen = 0;
  let currentStart = -1;
  let currentLen = 0;

  groups.forEach((group, index) => {
    if (group === '0') {
      if (currentStart === -1) currentStart = index;
      currentLen += 1;
    } else {
      if (currentLen > bestLen) {
        bestStart = currentStart;
        bestLen = currentLen;
      }
      currentStart = -1;
      currentLen = 0;
    }
  });

  if (currentLen > bestLen) {
    bestStart = currentStart;
    bestLen = currentLen;
  }

  if (bestLen > 1) {
    groups.splice(bestStart, bestLen, '');
    if (bestStart === 0) groups.unshift('');
    if (bestStart + bestLen === 8) groups.push('');
  }

  return groups.join(':').replace(/:{3,}/, '::');
}

export function parseIpv6Cidr(cidr: string): { network: bigint; prefix: number } {
  const raw = cidr.trim();
  const parts = raw.split('/');
  if (parts.length !== 2) throw new Error('Invalid IPv6 CIDR');
  const prefix = Number(parts[1]);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    throw new Error('Invalid IPv6 prefix');
  }
  const addr = parseIpv6(parts[0]);
  const mask = prefix === 0 ? 0n : (~0n << BigInt(128 - prefix)) & ((1n << 128n) - 1n);
  const network = addr & mask;
  return { network, prefix };
}

export function isValidIpv6Cidr(cidr: string): boolean {
  try {
    parseIpv6Cidr(cidr);
    return true;
  } catch {
    return false;
  }
}

export function isValidIpv6(address: string): boolean {
  try {
    parseIpv6(address);
    return true;
  } catch {
    return false;
  }
}

export function isIpv6InSubnet(address: string, cidr: string): boolean {
  try {
    const addr = parseIpv6(address);
    const { network, prefix } = parseIpv6Cidr(cidr);
    const mask = prefix === 0 ? 0n : (~0n << BigInt(128 - prefix)) & ((1n << 128n) - 1n);
    return (addr & mask) === network;
  } catch {
    return false;
  }
}

export function getNextFreeIpv6Address(subnet: string, used: Set<string>, skipFirst = 0n): string | null {
  const { network, prefix } = parseIpv6Cidr(subnet);
  const hostBits = 128n - BigInt(prefix);
  const size = 1n << hostBits;
  const first = prefix === 128 ? network : network + 1n;
  const last = network + size - 1n;
  let candidate = first + BigInt(skipFirst);
  if (candidate < first) candidate = first;
  const maxIterations = 100000;
  let iterations = 0;
  while (candidate <= last) {
    const address = formatIpv6(candidate);
    if (!used.has(address)) return address;
    candidate += 1n;
    iterations += 1;
    if (iterations > maxIterations) break;
  }
  return null;
}