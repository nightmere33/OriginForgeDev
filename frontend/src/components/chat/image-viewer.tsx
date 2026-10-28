"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * A full-screen look at an image from the chat or a progress update: a
 * native modal dialog (top layer, Escape closes, focus returns), the image
 * scaled to fit, a click outside it closes. Private files come from Django
 * with an access check, so a plain <img>, not next/image.
 */
export function ImageViewer({ image, onClose, closeLabel }: { image: { src: string; alt: string } | null; onClose: () => void; closeLabel: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (image && !d.open) d.showModal();
    if (!image && d.open) d.close();
  }, [image]);
  return (
    <dialog ref={dialog} onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={image?.alt}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-bg/90 backdrop:backdrop-blur-sm open:flex open:items-center open:justify-center">
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.alt} className="max-h-[88dvh] max-w-[92vw] border border-line object-contain [animation:step-in_var(--dur-standard)_var(--ease-out)]" />
          <button type="button" onClick={onClose} aria-label={closeLabel} autoFocus
            className="fixed right-4 top-4 flex size-11 items-center justify-center border border-line-strong bg-bg/80 text-ink hover:border-ember-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
            <X aria-hidden className="size-5" />
          </button>
          <p className="hud fixed inset-x-0 bottom-4 truncate px-16 text-center text-muted">{image.alt}</p>
        </>
      )}
    </dialog>
  );
}
