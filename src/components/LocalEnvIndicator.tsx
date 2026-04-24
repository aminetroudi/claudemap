"use client";

import { Monitor } from "lucide-react";
import { useState } from "react";

export default function LocalEnvIndicator() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="local-env-indicator"
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 1000,
        animation: "fadeInDown 0.4s ease-out 0.6s both",
      }}
    >
      <div
        className="env-card"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          transition: "all 0.2s ease",
          borderColor: isHovered ? "var(--line-2)" : "var(--line)",
          boxShadow: isHovered
            ? "0 4px 12px rgba(0,0,0,0.2)"
            : "0 0 0 rgba(0,0,0,0)",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "var(--ac)",
            opacity: 0.8,
            animation: isHovered ? "rotate 0.6s ease" : "none",
          }}
        >
          <Monitor size={16} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontSize: "var(--t-2xs)",
              fontWeight: 600,
              color: "var(--tx)",
              fontFamily: "var(--font-mono), monospace",
              letterSpacing: "0.04em",
            }}
          >
            LOCAL
          </div>
          <div
            style={{
              fontSize: "var(--t-2xs)",
              color: "var(--tx-3)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            ~/
          </div>
        </div>

        {/* Hover detail */}
        <div
          style={{
            fontSize: "var(--t-2xs)",
            color: "var(--tx-2)",
            marginLeft: 8,
            paddingLeft: 8,
            borderLeft: "1px solid var(--line)",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-mono), monospace",
            opacity: isHovered ? 1 : 0,
            width: isHovered ? "auto" : 0,
            overflow: "hidden",
            transition: "opacity 0.2s ease, width 0.2s ease",
          }}
        >
          Claude Config Map
        </div>
      </div>

      {/* Subtle indicator pulse */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--green)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      />
    </div>
  );
}
