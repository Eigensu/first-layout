"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HERO_SLIDES } from "./content";

const ADVANCE_MS = 10_000;

export function HeroCarousel() {
  const [active, setActive] = useState(0);
  const count = HERO_SLIDES.length;

  const go = useCallback(
    (step: number) => setActive((i) => (i + step + count) % count),
    [count]
  );

  // Restarts whenever the slide changes, so a click gets a full interval.
  useEffect(() => {
    const timer = setTimeout(() => go(1), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [active, go]);

  return (
    <div className="relative w-full h-[85vh] md:h-[65vh] lg:h-[75vh] xl:h-[80vh] min-h-[600px] group bg-bg-body overflow-hidden">
      {HERO_SLIDES.map((slide, i) => (
        <div
          key={slide.headline}
          aria-hidden={i !== active}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === active ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Image
            src={slide.imageUrl}
            alt={slide.headline}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: slide.imagePosition }}
          />
          {/* Two layers keep the copy readable on any photo. */}
          <div className="absolute inset-0 bg-bg-body opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-body to-transparent" />

          <div className="absolute bottom-9 md:bottom-16 lg:bottom-20 left-0 w-full px-5 md:px-12 lg:px-20 z-10">
            <div className="max-w-7xl mx-auto">
              <h1 className="font-heading text-4xl md:text-5xl lg:text-7xl font-extrabold text-text-main mb-3 md:mb-4 leading-tight tracking-tight max-w-xs md:max-w-none">
                {slide.headline}
              </h1>
              <p className="text-base md:text-xl lg:text-2xl text-text-muted max-w-xs md:max-w-xl font-medium leading-relaxed mb-6 md:mb-8">
                {slide.description}
              </p>
              <div className="flex flex-row flex-wrap gap-3 md:gap-4">
                <a
                  href="#tournaments"
                  className="inline-flex items-center gap-2 bg-gradient-button-primary text-text-main font-semibold px-6 py-3 md:px-8 md:py-3.5 text-sm md:text-base rounded-full transition-transform hover:scale-105 shadow-pink-soft"
                >
                  View Tournaments
                  <ChevronRight className="w-4 h-4" />
                </a>
                <a
                  href="/contact"
                  className="inline-flex items-center bg-bg-card border border-border-strong text-text-main font-semibold px-6 py-3 md:px-8 md:py-3.5 text-sm md:text-base rounded-full transition-transform hover:scale-105"
                >
                  Learn More
                </a>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="absolute bottom-4 md:bottom-6 w-full flex justify-center gap-3 z-20">
        {HERO_SLIDES.map((slide, i) => (
          <button
            key={slide.headline}
            onClick={() => setActive(i)}
            aria-label={`Show slide ${i + 1}`}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              i === active ? "w-10 bg-text-main" : "w-2.5 bg-text-subtle"
            }`}
          />
        ))}
      </div>

      {[
        { step: -1, label: "Previous slide", Icon: ChevronLeft, side: "left-3 md:left-6" },
        { step: 1, label: "Next slide", Icon: ChevronRight, side: "right-3 md:right-6" },
      ].map(({ step, label, Icon, side }) => (
        <button
          key={label}
          onClick={() => go(step)}
          aria-label={label}
          className={`absolute ${side} top-1/2 -translate-y-1/2 z-20 flex w-10 h-10 md:w-14 md:h-14 items-center justify-center rounded-full bg-bg-card border border-border-strong text-text-main transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-110`}
        >
          <Icon className="w-6 h-6 md:w-8 md:h-8" />
        </button>
      ))}
    </div>
  );
}
