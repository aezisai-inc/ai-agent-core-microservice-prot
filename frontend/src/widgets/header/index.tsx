/**
 * Header Widget (FSD)
 */

"use client";

import { Settings, Bell, User } from "lucide-react";
import { Button } from "@/shared/ui/atoms/button";
import { Badge } from "@/shared/ui/atoms/badge";

export function Header() {
  return (
    <header className="h-16 border-b border-surface-800 px-6 flex items-center justify-between bg-surface-950/80 backdrop-blur-xl">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-display font-semibold text-gradient">
          Agentic RAG
        </h1>
        <Badge variant="primary">Beta</Badge>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon">
          <User className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

