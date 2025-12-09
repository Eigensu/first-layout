"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components";
import { PointsBadge } from "@teamviewer/atoms/PointsBadge";

export interface TeamHeaderProps {
  teamName: string;
  createdAt: string | Date;
  displayPoints: number;
  onClickRename: () => void;
  totalPoints?: number;
  rank?: number;
  contestName?: string;
  contestLink?: string;
  className?: string;
}

export function TeamHeader({
  teamName,
  createdAt,
  displayPoints,
  onClickRename,
  rank,
  contestName,
  contestLink,
  className,
}: TeamHeaderProps) {
  return (
    <div className={cn("flex-1 min-w-0", className)}>
      {/* Team Name Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-xl sm:text-2xl font-bold text-[#E6E6FA] tracking-tight">
          {teamName}
        </h3>
        <PointsBadge
          points={displayPoints}
          className="px-3 py-1 text-sm font-semibold"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onClickRename}
          className="p-1.5 text-[#D8BFD8] hover:text-[#E6E6FA] hover:bg-white/10 rounded-full transition-colors"
          aria-label="Rename team"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </Button>
      </div>

      {/* Meta Row */}
      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        <span className="text-sm text-[#D8BFD8]">
          Created{" "}
          {new Date(createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>

        {rank && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-700">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Rank #{rank}
          </span>
        )}

        {contestName &&
          (contestLink ? (
            <a
              href={contestLink}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                         bg-white/10 text-[#E6E6FA] text-sm font-medium
                         hover:bg-white/20 transition-colors whitespace-nowrap border border-[#E6E6FA]/20"
            >
              <span>{contestName}</span>
            </a>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                            bg-white/10 text-[#E6E6FA] text-sm font-medium whitespace-nowrap border border-[#E6E6FA]/20"
            >
              <span>{contestName}</span>
            </span>
          ))}
      </div>
    </div>
  );
}
