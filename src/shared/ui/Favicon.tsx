import { Github } from 'lucide-react';
import type { ReactElement } from 'react';

interface FaviconProps {
  /** A known site key, or any string — unknown keys fall back to the initial glyph. */
  site?: string;
  /** Optional explicit single-character glyph (overrides the derived initial). */
  glyph?: string;
  size?: number;
  radius?: number;
  className?: string;
}

interface FaviconStyle {
  bg: string;
  fg: string;
  t: string;
}

// CSS-only favicons — colored square + glyph, no network request. Keys mirror
// the design prototype; unknown sites fall back to a neutral chip.
const FAVI: Record<string, FaviconStyle> = {
  x: { bg: '#000', fg: '#fff', t: '𝕏' },
  wechat: { bg: '#07C160', fg: '#fff', t: '微' },
  zhihu: { bg: '#0066FF', fg: '#fff', t: '知' },
  stripe: { bg: '#635BFF', fg: '#fff', t: 'S' },
  nyt: { bg: '#000', fg: '#fff', t: 'T' },
  verge: { bg: '#5200FF', fg: '#fff', t: 'V' },
  arxiv: { bg: '#B31B1B', fg: '#fff', t: 'χ' },
  github: { bg: '#1F2328', fg: '#fff', t: '' },
  medium: { bg: '#000', fg: '#fff', t: 'M' },
  smashing: { bg: '#E85C33', fg: '#fff', t: 'S' },
  bbc: { bg: '#000', fg: '#fff', t: 'B' },
  notion: { bg: '#000', fg: '#fff', t: 'N' },
  sspai: { bg: '#D70010', fg: '#fff', t: '派' },
  default: { bg: '#9b9690', fg: '#fff', t: '·' }
};

export function Favicon({
  site = 'default',
  glyph,
  size = 18,
  radius = 5,
  className
}: FaviconProps): ReactElement {
  const key = site.toLowerCase();
  const f = FAVI[key] ?? FAVI.default;
  const label = glyph ?? f.t;

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: f.bg,
        color: f.fg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        fontSize: size * 0.56,
        fontWeight: 700,
        lineHeight: 1,
        overflow: 'hidden'
      }}
      aria-hidden="true"
    >
      {key === 'github' ? (
        <Github size={Math.round(size * 0.66)} strokeWidth={2} />
      ) : (
        label
      )}
    </span>
  );
}
