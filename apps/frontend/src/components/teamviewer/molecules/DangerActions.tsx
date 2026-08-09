"use client";

import React from "react";
import { Button } from "@/components";

export interface DangerActionsProps {
  onDelete: () => void;
  disabled?: boolean;
  className?: string;
}

export function DangerActions({ onDelete, disabled, className = "" }: DangerActionsProps) {
  return (
    <div className={"flex flex-col sm:flex-row justify-end gap-3 mt-4 pt-4 border-t border-border-subtle " + className}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={!!disabled}
        className="text-danger hover:text-danger hover:bg-bg-card-soft w-full sm:w-auto"
      >
        {disabled ? "Deleting..." : "Delete Team"}
      </Button>
    </div>
  );
}
