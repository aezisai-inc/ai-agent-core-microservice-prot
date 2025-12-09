"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { cn } from "@/shared/lib/utils";

// Mermaid の初期化（一度だけ）
let mermaidInitialized = false;

function initializeMermaid() {
  if (mermaidInitialized) return;
  
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    themeVariables: {
      // カスタムカラー（Cyberpunk テーマに合わせる）
      primaryColor: "#14b892",       // primary-500
      primaryTextColor: "#f8fafc",   // surface-50
      primaryBorderColor: "#0d9476", // primary-600
      lineColor: "#64748b",          // surface-500
      secondaryColor: "#d946ef",     // accent-500
      tertiaryColor: "#1e293b",      // surface-800
      mainBkg: "#0f172a",            // surface-900
      nodeBkg: "#1e293b",            // surface-800
      nodeBorder: "#334155",         // surface-700
      clusterBkg: "#1e293b",         // surface-800
      clusterBorder: "#334155",      // surface-700
      titleColor: "#14b892",         // primary-500
      edgeLabelBackground: "#1e293b",// surface-800
    },
    flowchart: {
      curve: "basis",
      padding: 15,
    },
    sequence: {
      diagramMarginX: 50,
      diagramMarginY: 10,
    },
    securityLevel: "loose",
  });
  
  mermaidInitialized = true;
}

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    initializeMermaid();
    
    const renderDiagram = async () => {
      if (!chart.trim()) {
        setIsRendering(false);
        return;
      }
      
      setIsRendering(true);
      setError(null);
      
      try {
        // ユニークなIDを生成
        const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
        
        // Mermaid でレンダリング
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        setSvg(renderedSvg);
      } catch (err) {
        console.error("Mermaid render error:", err);
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      } finally {
        setIsRendering(false);
      }
    };
    
    renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div className={cn(
        "rounded-lg border border-red-500/30 bg-red-500/10 p-4",
        className
      )}>
        <p className="text-sm text-red-400 mb-2">⚠️ Mermaid diagram error:</p>
        <pre className="text-xs text-surface-400 overflow-x-auto whitespace-pre-wrap">
          {error}
        </pre>
        <details className="mt-2">
          <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-400">
            Show source
          </summary>
          <pre className="mt-2 text-xs text-surface-500 overflow-x-auto">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  if (isRendering) {
    return (
      <div className={cn(
        "rounded-lg bg-surface-800/50 p-4 flex items-center justify-center min-h-[100px]",
        className
      )}>
        <div className="flex items-center gap-2 text-surface-400 text-sm">
          <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          <span>Rendering diagram...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "mermaid-container rounded-lg bg-surface-900/50 p-4 overflow-x-auto",
        "[&_svg]:max-w-full [&_svg]:h-auto",
        className
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

