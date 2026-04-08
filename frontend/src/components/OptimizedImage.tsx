import type { ImgHTMLAttributes } from 'react';

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  fallbackSrc: string;
  webpSrc?: string;
}

export function OptimizedImage({
  fallbackSrc,
  webpSrc,
  alt,
  ...imgProps
}: OptimizedImageProps) {
  if (!webpSrc) {
    return <img src={fallbackSrc} alt={alt} {...imgProps} />;
  }

  return (
    <picture>
      <source srcSet={webpSrc} type="image/webp" />
      <img src={fallbackSrc} alt={alt} {...imgProps} />
    </picture>
  );
}
