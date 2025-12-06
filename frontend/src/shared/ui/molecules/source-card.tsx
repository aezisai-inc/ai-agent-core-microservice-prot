"use client";

import { FileText, ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface SourceCardProps {
  title: string;
  content: string;
  score: number;
  source: string;
  className?: string;
}

export function SourceCard({
  title,
  content,
  score,
  source,
  className,
}: SourceCardProps) {
  const scorePercent = Math.round(score * 100);
  
  return (
    <div
      className={cn(
        "p-4 glass rounded-xl hover:border-primary-500/50 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary-400" />
          <h4 className="font-medium text-surface-100 text-sm">{title}</h4>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              scorePercent >= 80
                ? "bg-green-900 text-green-300"
                : scorePercent >= 60
                ? "bg-yellow-900 text-yellow-300"
                : "bg-surface-800 text-surface-400"
            )}
          >
            {scorePercent}%
          </span>
        </div>
      </div>
      
      <p className="mt-2 text-sm text-surface-400 line-clamp-3">{content}</p>
      
      <div className="mt-3 flex items-center gap-1 text-xs text-primary-400">
        <ExternalLink className="h-3 w-3" />
        <span className="truncate">{source}</span>
      </div>
    </div>
  );
}

