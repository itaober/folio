import { getItemPreferredDomain } from '../../core/selectors';
import type { FolioItem } from '../../core/types';

/** Domain fragments → the CSS-only Favicon site keys shipped in the foundation. */
const DOMAIN_TO_SITE: Record<string, string> = {
  'x.com': 'x',
  'twitter.com': 'x',
  'weixin.qq.com': 'wechat',
  'zhihu.com': 'zhihu',
  'stripe.com': 'stripe',
  'nytimes.com': 'nyt',
  'theverge.com': 'verge',
  'arxiv.org': 'arxiv',
  'github.com': 'github',
  'medium.com': 'medium',
  'smashingmagazine.com': 'smashing',
  'bbc.com': 'bbc',
  'bbc.co.uk': 'bbc',
  'notion.so': 'notion',
  'sspai.com': 'sspai'
};

/**
 * Maps an item's domain to a known CSS-Favicon key, used only as the fallback
 * when the item carries no real favicon URL. Unknown domains fall through to the
 * neutral default chip.
 */
export function faviconKeyForItem(item: FolioItem): string {
  const domain = getItemPreferredDomain(item).toLowerCase();
  for (const [fragment, site] of Object.entries(DOMAIN_TO_SITE)) {
    if (domain === fragment || domain.endsWith(`.${fragment}`)) {
      return site;
    }
  }
  return 'default';
}
