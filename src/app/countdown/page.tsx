"use client";

import { useEffect, useState } from "react";

const KICKOFF = new Date("2026-06-11T19:00:00Z").getTime();

function calcTimeLeft() {
  const now = Date.now();
  const diff = KICKOFF - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function CountdownPage() {
  const [time, setTime] = useState<ReturnType<typeof calcTimeLeft> | null>(null);

  useEffect(() => {
    setTime(calcTimeLeft());
    const id = setInterval(() => setTime(calcTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const isOver = time !== null && time.days === 0 && time.hours === 0 && time.minutes === 0 && time.seconds === 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        overflow: "hidden",
      }}
    >
      {/* Background image */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(/countdown-bg.png)",
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Dark gradient overlay at bottom for readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Title at top */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 0,
          right: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: 42,
            fontWeight: 700,
            color: "#ffffff",
            textShadow: "0 3px 20px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)",
            direction: "rtl",
          }}
        >
          הולכים על דאבל
        </h1>
      </div>

      {/* Countdown content */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingBottom: 64,
          gap: 24,
        }}
      >

        {time && !isOver && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <TimeBlock value={time.days} label="Days" />
            <Separator />
            <TimeBlock value={time.hours} label="Hours" />
            <Separator />
            <TimeBlock value={time.minutes} label="Minutes" />
            <Separator />
            <TimeBlock value={time.seconds} label="Seconds" />
          </div>
        )}

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            textShadow: "0 1px 8px rgba(0,0,0,0.5)",
          }}
        >
          FIFA World Cup 2026 &middot; June 11 &middot; Mexico vs South Africa
        </p>
      </div>
    </div>
  );
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minWidth: 80,
      }}
    >
      <span
        style={{
          fontFamily: "'Space Grotesk', 'Inter', monospace",
          fontSize: 56,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1,
          textShadow: "0 2px 20px rgba(0,0,0,0.6)",
          letterSpacing: "-0.02em",
          fontFeatureSettings: '"tnum" 1',
        }}
      >
        {pad(value)}
      </span>
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 500,
          color: "rgba(255,255,255,0.6)",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          marginTop: 8,
          textShadow: "0 1px 8px rgba(0,0,0,0.5)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Separator() {
  return (
    <span
      style={{
        fontFamily: "'Space Grotesk', monospace",
        fontSize: 44,
        fontWeight: 300,
        color: "rgba(255,255,255,0.4)",
        lineHeight: 1,
        marginBottom: 20,
      }}
    >
      :
    </span>
  );
}
