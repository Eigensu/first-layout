"use client";

import React from "react";

export interface HeroHeaderProps {
  title: string;
  subtitle?: string;
}

export function HeroHeader({ title, subtitle }: HeroHeaderProps) {
  return (
    <div className="px-4 sm:px-6 mb-4 sm:mb-6">
      <div className="text-center max-w-3xl mx-auto mt-2 sm:mt-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-brand leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 sm:mt-2 text-text-muted text-xs sm:text-sm">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
