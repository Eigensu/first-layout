"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { CarouselImage } from "@/lib/api/public/carousel";
import { API_BASE_URL } from "@/common/consts";

interface HeroCarouselProps {
  images: CarouselImage[];
  autoPlayInterval?: number;
  showArrows?: boolean;
  className?: string;
}

export function HeroCarousel({
  images,
  autoPlayInterval = 5000,
  showArrows = true,
  className = "",
}: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Auto-play functionality
  useEffect(() => {
    if (images.length <= 1 || isPaused) {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
      return;
    }

    autoPlayRef.current = setInterval(nextSlide, autoPlayInterval);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [images.length, isPaused, nextSlide, autoPlayInterval]);

  // Touch handlers for mobile swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setIsPaused(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      nextSlide();
    } else if (isRightSwipe) {
      prevSlide();
    }

    // Resume auto-play after a delay
    setTimeout(() => setIsPaused(false), 3000);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        prevSlide();
        setIsPaused(true);
        setTimeout(() => setIsPaused(false), 3000);
      } else if (e.key === "ArrowRight") {
        nextSlide();
        setIsPaused(true);
        setTimeout(() => setIsPaused(false), 3000);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  if (images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex];

  return (
    <div className={`${className}`}>
      {/* Title Display - Above Carousel */}
      {currentImage.title && (
        <div className="mb-4 mt-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentIndex}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className="text-primary-600 font-bold text-2xl text-center"
            >
              {currentImage.title}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      <div
        className="relative w-full h-48 sm:h-64 md:h-80 mb-10"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-none md:shadow-xl">
          {/* Carousel Images */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              {currentImage.link_url ? (
                <Link
                  href={currentImage.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full h-full"
                >
                  {currentImage.image_url ? (
                    <Image
                      src={`${API_BASE_URL}${currentImage.image_url}`}
                      alt={currentImage.title || "Carousel image"}
                      fill
                      className="object-cover"
                      priority={currentIndex === 0}
                      sizes="100vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-200 to-primary-100">
                      <p className="text-primary-700 text-xl font-semibold">
                        No image available
                      </p>
                    </div>
                  )}
                </Link>
              ) : (
                <div className="w-full h-full">
                  {currentImage.image_url ? (
                    <Image
                      src={`${API_BASE_URL}${currentImage.image_url}`}
                      alt={currentImage.title || "Carousel image"}
                      fill
                      className="object-cover"
                      priority={currentIndex === 0}
                      sizes="100vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-200 to-primary-100">
                      <p className="text-primary-700 text-xl font-semibold">
                        No image available
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Arrows */}
          {showArrows && images.length > 1 && (
            <>
              <button
                onClick={prevSlide}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-primary-600 hover:text-primary-700 transition-all duration-200 z-10 rounded-full"
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>
              <button
                onClick={nextSlide}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-primary-600 hover:text-primary-700 transition-all duration-200 z-10 rounded-full"
                aria-label="Next slide"
              >
                <ChevronRight className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>
            </>
          )}
        </div>

        {/* Navigation Dots */}
        {images.length > 1 && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? "bg-primary-600 w-8"
                    : "bg-primary-300 hover:bg-primary-400"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
