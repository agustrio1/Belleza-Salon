import { useEffect, useRef, useState } from "react";

export function ServiceImage({
  src,
  alt,
  className = "",
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  // Gambar yang sudah gagal dimuat sebelum hydration tidak memicu onError
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-blush-100 ${className}`}>
      {src && !failed ? (
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="flex h-full w-full items-center justify-center text-blush-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-1/2 max-h-8 w-1/2 max-w-8"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="M21 16l-5-5-8 8" />
          </svg>
        </div>
      )}
    </div>
  );
}