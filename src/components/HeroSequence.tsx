'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';

/**
 * The four generated frames are one continuous shot: book wired to the desk →
 * lifting off → pages rising → whole thing breaking into a data vortex.
 *
 * Scroll drives a single `--p` (0→1) on the stage; every layer's transform and
 * opacity is computed in CSS from that one number (see .hero-stage in
 * globals.css), so scrolling never re-renders React.
 */
const FRAMES = [
  { src: '/hero/frame-1', alt: 'A closed book wired to a bank of monitors on a workbench' },
  { src: '/hero/frame-2', alt: 'The book lifting off the desk, pages fanning open' },
  { src: '/hero/frame-3', alt: 'Pages spiralling upward out of the book' },
  { src: '/hero/frame-4', alt: 'The book bursting into a vortex of light and text' },
];

const STAGES = [
  {
    eyebrow: 'Super AI Books',
    title: 'Handbooks for people who ship with AI.',
    body: 'Deep, practical, and yours as a plain file — no app, no subscription.',
  },
  {
    eyebrow: 'Not a subscription',
    title: 'One payment. The file is yours.',
    body: 'No account to keep, no reader app, no DRM to fight.',
  },
  {
    eyebrow: 'Straight to the shop',
    title: 'Pay by UPI. Download on confirmation.',
    body: 'The link unlocks the moment the shop verifies your payment.',
  },
];

/** The third frame is the one that talks about money, so it has to match what
 *  the till actually offers. */
function stagesFor(cardOffered: boolean) {
  if (!cardOffered) return STAGES;
  return [
    STAGES[0],
    STAGES[1],
    {
      eyebrow: 'Straight to the shop',
      title: 'Pay by UPI or card. Download on confirmation.',
      body: 'The link unlocks the moment the payment is confirmed.',
    },
  ];
}

export function HeroSequence({ cardOffered = false }: { cardOffered?: boolean }) {
  const stages = stagesFor(cardOffered);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!track || !stage) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stage.style.setProperty('--p', '0.55');
      return;
    }

    let frame = 0;
    let target = 0;
    let shown = -1;
    let tiltX = 0;
    let tiltY = 0;
    let wantX = 0;
    let wantY = 0;

    const measure = () => {
      const rect = track.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      target = span <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / span));
    };

    const loop = () => {
      // Eased follow, so a fast flick glides instead of snapping.
      shown += (target - shown) * 0.12;
      tiltX += (wantX - tiltX) * 0.08;
      tiltY += (wantY - tiltY) * 0.08;
      stage.style.setProperty('--p', shown.toFixed(4));
      stage.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
      stage.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
      frame = requestAnimationFrame(loop);
    };

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = stage.getBoundingClientRect();
      wantY = ((event.clientX - rect.left) / rect.width - 0.5) * 11;
      wantX = (0.5 - (event.clientY - rect.top) / rect.height) * 7;
    };

    measure();
    loop();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  return (
    <div ref={trackRef} className="hero-track">
      <div ref={stageRef} className="hero-stage">
        <div className="hero-scene">
          {/* Every layer is in the DOM from the first paint, so all four frames are
              already fetched before the user scrolls — no flash mid-sequence. */}
          {FRAMES.map((frame, index) => (
            <div key={frame.src} className={`hero-layer hero-layer-${index + 1}`}>
              <Image
                src={`${frame.src}-1600.webp`}
                alt={frame.alt}
                fill
                sizes="100vw"
                priority={index === 0}
                quality={index === 0 ? 80 : 70}
                draggable={false}
              />
            </div>
          ))}
          <div className="hero-vignette" />
        </div>

        <div className="hero-copy">
          {stages.map((stage, index) => (
            <div key={stage.title} className={`hero-slide hero-slide-${index + 1}`}>
              <p className="hero-eyebrow">{stage.eyebrow}</p>
              {/* Only the first slide is the page's h1; the others are the same
                  visual line but must not compete for the document outline. */}
              {index === 0 ? (
                <h1 className="hero-title">{stage.title}</h1>
              ) : (
                <p className="hero-title">{stage.title}</p>
              )}
              <p className="hero-body">{stage.body}</p>
            </div>
          ))}
        </div>

        <div className="hero-scroll-hint">
          <span>Scroll</span>
          <i />
        </div>
      </div>
    </div>
  );
}
