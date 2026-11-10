import { useState, type ImgHTMLAttributes } from "react";
import { motion } from "motion/react";

/** Brand fallback shown when a course image URL is missing or broken. */
export const FALLBACK_IMG = "assets/logo.png";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

/** <img> that degrades gracefully: empty/broken src renders the fallback. */
export function SafeImg({ src, alt = "", loading = "lazy", ...rest }: Props) {
  const [failed, setFailed] = useState(false);
  const shown = !src.trim() || failed ? FALLBACK_IMG : src;
  return (
    <img
      src={shown}
      alt={alt}
      loading={loading}
      draggable={false}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}

/** Same fallback for animated (motion.img) usages that can't swap component. */
export function useImgFallback(src: string): [string, () => void] {
  const [failed, setFailed] = useState(false);
  const shown = !src.trim() || failed ? FALLBACK_IMG : src;
  return [shown, () => setFailed(true)];
}

type AnimProps = {
  src: string;
  layoutId: string;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
  draggable?: boolean;
  width?: number | string;
  height?: number | string;
};

/** motion.img with identical graceful fallback (per-instance hook state). */
export function AnimImg({
  src,
  layoutId,
  alt = "",
  className,
  loading = "lazy",
  decoding,
  draggable,
  width,
  height,
}: AnimProps) {
  const [shown, onError] = useImgFallback(src);
  return (
    <motion.img
      layoutId={layoutId}
      src={shown}
      alt={alt}
      onError={onError}
      className={className}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
      width={width}
      height={height}
    />
  );
}
