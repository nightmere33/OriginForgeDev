// Widths Next's image optimizer accepts by default (imageSizes and deviceSizes).
type Width = 64 | 96 | 128 | 256 | 384 | 640 | 828 | 1080;

/**
 * A copy of a media image at the size it is shown, through Next's image
 * optimizer (resized, AVIF or WebP, cached on the server). For <img> and
 * video posters that can't use next/image. SVGs pass through unchanged.
 */
export function sized(src: string | null | undefined, width: Width, quality: 70 | 82 = 70): string | undefined {
  if (!src) return undefined;
  if (/\.svg(\?|$)/i.test(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}
