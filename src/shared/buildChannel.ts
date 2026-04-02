export type BuildChannel = 'dev' | 'prod';

export function resolveBuildChannel(
  value: string | null | undefined
): BuildChannel {
  return value === 'dev' ? 'dev' : 'prod';
}

