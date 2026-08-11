/**
 * Reduces a client address to the unit worth rate limiting.
 *
 * IPv6 collapses to its /64, because that is what a single subscriber is
 * normally handed: keying on the full address would give one attacker ~18
 * quintillion fresh buckets, which is no limit at all. IPv4 is kept whole —
 * a /24 is a real network, often a shared NAT, and collapsing it would punish
 * everyone behind one.
 *
 * Shared between the admin login limiter and the public contact form limiter
 * — both need the same address-to-bucket mapping, just against different
 * rate-limit bindings.
 */
export function rateLimitKey(address: string | null | undefined): string {
  if (!address) return 'unknown';
  if (!address.includes(':')) return address;

  // Expand the :: elision just far enough to read the first four hextets.
  const [head, tail = ''] = address.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const hextets = address.includes('::')
    ? [...headParts, ...Array(Math.max(missing, 0)).fill('0'), ...tailParts]
    : headParts;

  const prefix = hextets.slice(0, 4);
  if (prefix.length < 4) return address;
  return `${prefix.join(':')}::/64`;
}
