"use client";

import React from "react";

export const LeaderboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Top 3 skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 animate-pulse"
          >
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-200 rounded-full mb-3 sm:mb-4" />
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-200 rounded-full mb-3 sm:mb-4" />
              <div className="h-5 sm:h-6 w-24 sm:w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 sm:h-4 w-20 sm:w-24 bg-gray-200 rounded mb-2 sm:mb-3" />
              <div className="h-6 sm:h-8 w-16 sm:w-20 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* List skeletons */}
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 flex-1">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-full flex-shrink-0 hidden xs:block" />
              <div className="flex-1 space-y-2 min-w-0">
                <div className="h-4 sm:h-5 w-24 sm:w-32 bg-gray-200 rounded" />
                <div className="h-3 sm:h-4 w-20 sm:w-24 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-6 sm:h-8 w-16 sm:w-20 bg-gray-200 rounded flex-shrink-0" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
