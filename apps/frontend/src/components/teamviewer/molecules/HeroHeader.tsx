"use client";

import React from "react";

export interface HeroHeaderProps {
  title: string;
  subtitle?: string;
}

export function HeroHeader({ title, subtitle }: HeroHeaderProps) {
  return (
    <div className="px-4 sm:px-6 mb-6 sm:mb-8">
      <div className="text-center max-w-3xl mx-auto mt-4 sm:mt-6">
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-brand leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 sm:mt-3 text-text-muted text-sm sm:text-base md:text-lg">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
