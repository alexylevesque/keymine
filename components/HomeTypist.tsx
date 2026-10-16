"use client";

import { useEffect, useRef } from "react";
import { distanceToRect, typistRate, typistRateForVisibility } from "@/lib/typist";

// Page d'accueil : le personnage qui tape au clavier (image créée avec ChatGPT, animée avec Dreamina,
// voir docs/IA.md). Plus la souris s'approche du bouton JOUER, plus il tape vite ; sur téléphone, il
// accélère quand le bouton est à l'écran. Décoratif (caché aux lecteurs d'écran) ; figé si la personne
// préfère moins d'animations ; la vidéo ne se charge qu'une fois la page prête (PERF-01).

const TARGET = "[data-typist-target]";

export function HomeTypist({ className = "" }: { className?: string }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = video.current;
    // getClientRects vide : cette copie est masquée à cette largeur d'écran (l'autre s'affiche).
    if (!v || v.getClientRects().length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let target = 1;
    let rate = 1;
    let frame = 0;
    let visible = true;

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const button = document.querySelector(TARGET);
      if (button)
        target = typistRate(distanceToRect(e.clientX, e.clientY, button.getBoundingClientRect()));
    };

    // Accélère et ralentit en douceur, sans à-coups.
    const step = () => {
      rate += (target - rate) * 0.08;
      if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;
      frame = requestAnimationFrame(step);
    };

    const observers: IntersectionObserver[] = [];
    const button = document.querySelector(TARGET);
    if (button && window.matchMedia("(pointer: coarse)").matches) {
      const io = new IntersectionObserver(
        ([entry]) => (target = typistRateForVisibility(entry?.intersectionRatio ?? 0)),
        { threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      io.observe(button);
      observers.push(io);
    }
    // Hors de l'écran : en pause (rien ne tourne pour rien).
    const seen = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) void v.play().catch(() => undefined);
      else v.pause();
    });
    observers.push(seen);

    const start = () => {
      v.preload = "auto";
      seen.observe(v);
      frame = requestAnimationFrame(step);
    };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 2_000 })
      : window.setTimeout(start, 1_000);

    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cancelAnimationFrame(frame);
      observers.forEach((o) => o.disconnect());
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div
      className={`home-typist pixel-slot mx-auto w-full max-w-[32rem] overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <video
        ref={video}
        poster="/home/typist-poster.webp"
        width={560}
        height={504}
        muted
        loop
        playsInline
        preload="none"
        className="block h-auto w-full"
      >
        {/* WebM (VP9) d'abord : lu partout, même par Chromium sans H.264 ; MP4 pour les autres. */}
        <source src="/home/typist.webm" type="video/webm" />
        <source src="/home/typist.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
