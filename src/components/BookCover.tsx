import Image from 'next/image';

/**
 * Typeset cover when the shop has not uploaded artwork yet — the catalogue began
 * with no images, and a gradient rectangle with a fake title would read as filler.
 * A real cover replaces the plate entirely; the spine and the frame stay.
 */
export function BookCover({
  title,
  author,
  imageSrc = null,
  className = '',
}: {
  title: string;
  author: string;
  imageSrc?: string | null;
  className?: string;
}) {
  if (imageSrc) {
    return (
      <div
        className={`relative aspect-3/4 overflow-hidden rounded-r-md rounded-l-sm bg-[#0f0e0d] ring-1 ring-white/10 ${className}`}
      >
        <Image src={imageSrc} alt={`Cover of ${title}`} fill sizes="(max-width: 768px) 128px, 280px" className="object-cover" />
        <span className="absolute inset-y-0 left-0 w-[7px] bg-gradient-to-r from-black/70 to-transparent" />
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_20%_0%,rgb(255_255_255/0.09),transparent_60%)]" />
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-3/4 overflow-hidden rounded-r-md rounded-l-sm bg-gradient-to-br from-[#2a2118] via-[#191512] to-[#0f0e0d] ring-1 ring-white/10 ${className}`}
    >
      <span className="absolute inset-y-0 left-0 w-[7px] bg-gradient-to-r from-black/70 to-transparent" />
      <span className="absolute inset-x-4 top-6 h-px bg-amber-300/25" />
      <span className="absolute inset-x-4 bottom-16 h-px bg-amber-300/25" />
      <div className="absolute inset-0 flex flex-col justify-between p-5 pl-7">
        <p className="font-mono text-[9px] tracking-[0.28em] text-amber-300/80 uppercase">
          Super AI Books
        </p>
        <div>
          <p className="text-[17px] leading-[1.15] font-semibold tracking-tight text-zinc-50">
            {title}
          </p>
          <p className="mt-2 text-[11px] text-zinc-400">{author}</p>
        </div>
        <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-600 uppercase">
          PDF edition
        </p>
      </div>
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_20%_0%,rgb(255_255_255/0.09),transparent_60%)]" />
    </div>
  );
}
