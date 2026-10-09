/**
 * Renders the UPI QR payload produced by the payment provider.
 *
 * The image is generated server-side (see src/lib/payments/upi-direct.ts) and
 * passed in as a data URL, so nothing here needs a canvas, a third-party QR
 * script, or network access at render time.
 */
export function UpiQrCode({
  dataUrl,
  alt,
  size = 224,
}: {
  dataUrl: string;
  alt: string;
  size?: number;
}) {
  return (
    <div
      className="inline-flex items-center justify-center rounded-2xl bg-white p-3 ring-1 ring-zinc-200"
      style={{ width: size + 24, height: size + 24 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={alt}
        width={size}
        height={size}
        className="rounded-lg"
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
      />
    </div>
  );
}

export default UpiQrCode;
