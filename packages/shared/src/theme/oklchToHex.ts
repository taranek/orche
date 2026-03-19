// Convert oklch() CSS string to hex for APIs that need it (Monaco, xterm)

function oklchToLinearSrgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLAB → LMS (cube root domain)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  // Undo cube root
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function toHex2(n: number): string {
  return clamp(n).toString(16).padStart(2, '0');
}

/**
 * Parse an oklch() CSS value and return a hex string.
 * Supports: oklch(L C H) and oklch(L C H / alpha)
 * L can be 0-1 or 0%-100%
 * If input is already a hex or rgb value, returns it unchanged.
 */
export function oklchToHex(css: string): string {
  if (!css.startsWith('oklch(')) return css;

  const inner = css.slice(6, -1); // strip oklch( and )
  const [lchPart, alphaPart] = inner.split('/').map((s) => s.trim());
  const parts = lchPart.trim().split(/\s+/);

  let L = parseFloat(parts[0]);
  const C = parseFloat(parts[1]);
  const H = parseFloat(parts[2]) || 0;

  // Percentage → 0-1
  if (parts[0].includes('%')) L /= 100;

  const [lr, lg, lb] = oklchToLinearSrgb(L, C, H);
  const r = linearToSrgb(lr);
  const g = linearToSrgb(lg);
  const b = linearToSrgb(lb);

  let hex = '#' + toHex2(r) + toHex2(g) + toHex2(b);

  if (alphaPart) {
    const a = alphaPart.includes('%') ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart);
    hex += toHex2(a);
  }

  return hex;
}
