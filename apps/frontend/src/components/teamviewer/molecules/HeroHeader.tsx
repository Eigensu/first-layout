"use client";

import React from "react";

export interface HeroHeaderProps {
  title: string;
  subtitle?: string;
}

export function HeroHeader({ title, subtitle }: HeroHeaderProps) {
  return (
    <div className="px-4 sm:px-6 mb-3 sm:mb-4">
      <div className="text-center max-w-3xl mx-auto mt-1 sm:mt-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-brand leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 sm:mt-1.5 text-text-muted text-sm sm:text-base">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
