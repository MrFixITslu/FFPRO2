/**
 * Text and HTML entity decoding utilities
 */

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  hellip: '…',
  bull: '•',
  trade: '™',
  copy: '©',
  reg: '®',
  cent: '¢',
  pound: '£',
  euro: '€',
  yen: '¥',
  sect: '§',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  lsaquo: '‹',
  rsaquo: '›',
  oline: '‾',
  frasl: '⁄',
  weierp: '℘',
  image: 'ℑ',
  real: 'ℜ',
  alefsym: 'ℵ',
  larr: '←',
  uarr: '↑',
  rarr: '→',
  darr: '↓',
  harr: '↔',
  crarr: '↵',
  empty: '∅',
  isin: '∈',
  notin: '∉',
  ni: '∋',
  prod: '∏',
  sum: '∑',
  minus: '−',
  radic: '√',
  prop: '∝',
  infin: '∞',
  ang: '∠',
  and: '∧',
  or: '∨',
  cap: '∩',
  cup: '∪',
  int: '∫',
  there4: '∴',
  sim: '∼',
  cong: '≅',
  asymp: '≈',
  ne: '≠',
  equiv: '≡',
  le: '≤',
  ge: '≥',
  sub: '⊂',
  sup: '⊃',
  sube: '⊆',
  supe: '⊇',
  oplus: '⊕',
  otimes: '⊗',
  perp: '⊥',
  sdot: '⋅',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  loz: '◊',
  spades: '♠',
  clubs: '♣',
  hearts: '♥',
  diams: '♦',
  frac14: '¼',
  frac12: '½',
  frac34: '¾',
};

/**
 * Decodes all HTML entities (named, decimal, hexadecimal, and multi-pass double-encoded)
 * into standard clean readable unicode text.
 *
 * Example:
 * "We&#39;re writing to inform you &amp; your team" -> "We're writing to inform you & your team"
 */
export function decodeHtmlEntities(str: string | undefined | null): string {
  if (!str || typeof str !== 'string') return '';
  if (!str.includes('&')) return str;

  let prev = '';
  let curr = str;

  // Multi-pass loop (up to 4 passes) for double/triple encoded entities (e.g. &amp;#39;)
  for (let pass = 0; pass < 4 && curr !== prev; pass++) {
    prev = curr;
    curr = curr
      // Hexadecimal numerical entities: &#x27; or &#X2019;
      .replace(/&#x([0-9a-fA-F]+);?/gi, (match, hex) => {
        try {
          const code = parseInt(hex, 16);
          if (!isNaN(code) && code > 0 && code < 0x10ffff) {
            return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
          }
        } catch {}
        return match;
      })
      // Decimal numerical entities: &#39; or &#8217;
      .replace(/&#([0-9]+);?/g, (match, dec) => {
        try {
          const code = parseInt(dec, 10);
          if (!isNaN(code) && code > 0 && code < 0x10ffff) {
            return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
          }
        } catch {}
        return match;
      })
      // Named entities: &quot;, &amp;, &apos;, etc.
      .replace(/&([a-zA-Z]+);/g, (match, name) => {
        const lower = name.toLowerCase();
        if (NAMED_HTML_ENTITIES[lower] !== undefined) {
          return NAMED_HTML_ENTITIES[lower];
        }
        if (NAMED_HTML_ENTITIES[name] !== undefined) {
          return NAMED_HTML_ENTITIES[name];
        }
        return match;
      });
  }

  return curr;
}

/**
 * Sanitizes and cleans plain text strings for display in notifications, modals, and tables.
 */
export function cleanNotificationText(text: string | undefined | null): string {
  if (!text) return '';
  const decoded = decodeHtmlEntities(text);
  // Replace zero-width spaces or non-breaking spaces
  return decoded.replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}
