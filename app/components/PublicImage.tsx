import Image, { type ImageProps } from "next/image";
import { isOptimizablePublicImage, publicMediaAsset, publicMediaUrl } from "@/lib/publicMedia";

// Existing published assets use the deployed WebP copies. New uploads use the
// Next.js image cache until the next media sync and deployment.
export default function PublicImage({ src, alt, width, height, fill, sizes = "(max-width: 760px) 100vw, 50vw", ...props }: Omit<ImageProps, "src"> & { src: string }) {
  const asset = publicMediaAsset(src);
  const resolved = publicMediaUrl(src);
  return <Image
    {...props}
    src={resolved}
    alt={alt}
    fill={fill}
    width={fill ? undefined : width || asset?.width || 1200}
    height={fill ? undefined : height || asset?.height || 900}
    sizes={sizes}
    unoptimized={!isOptimizablePublicImage(resolved)}
  />;
}
