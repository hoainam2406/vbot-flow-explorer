/**
 * Resolve asset/media paths against Vite's configured `BASE_URL` so subpath
 * deployments (e.g. GitHub Pages `/<repo>/`) load files under `public/` cleanly.
 */
export function resolveMediaUrl(
  src: string,
  baseUrl: string = import.meta.env.BASE_URL ?? '/',
): string {
  if (!src) return src;
  if (/^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(src)) {
    return src;
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  if (normalizedBase !== '/' && src.startsWith(normalizedBase)) {
    return src;
  }

  const cleanSrc = src.replace(/^\/+/, '');
  return `${normalizedBase}${cleanSrc}`;
}
