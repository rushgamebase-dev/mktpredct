"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";

const RUSH_CARS_URL = "https://www.rushgame.vip";

export default function RushCarsBanner() {
  return (
    <motion.a
      href={RUSH_CARS_URL}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      whileHover={{ scale: 1.01 }}
      className="block rounded-2xl overflow-hidden relative cursor-pointer group"
      style={{ minHeight: 110 }}
    >
      {/* Background: neon racing gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 40% 100% at 10% 50%, rgba(0,255,136,0.12) 0%, transparent 70%),
            radial-gradient(ellipse 40% 100% at 90% 50%, rgba(239,68,68,0.10) 0%, transparent 70%),
            linear-gradient(135deg, #0a0f0a 0%, #0d0d0d 40%, #110d0d 100%)
          `,
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "inherit",
        }}
      />

      {/* Racing stripes */}
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-[1px]"
          style={{ background: "linear-gradient(90deg, rgba(0,255,136,0.3), transparent 30%, transparent 70%, rgba(239,68,68,0.3))" }}
        />
        <div
          className="absolute top-[40%] -translate-y-1/2 left-0 w-full h-[1px] opacity-40"
          style={{ background: "linear-gradient(90deg, rgba(0,255,136,0.15), transparent 20%)" }}
        />
        <div
          className="absolute top-[60%] -translate-y-1/2 right-0 w-full h-[1px] opacity-40"
          style={{ background: "linear-gradient(270deg, rgba(239,68,68,0.15), transparent 20%)" }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-5 sm:py-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-2xl">🏎️</span>
            <span className="text-lg sm:text-xl font-black text-white tracking-wide">
              Rush Cars
            </span>
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
              style={{
                background: "rgba(0,255,136,0.1)",
                color: "#00ff88",
                border: "1px solid rgba(0,255,136,0.2)",
                animation: "livePulse 1.5s ease-in-out infinite",
              }}
            >
              <span className="live-dot-green" style={{ width: 4, height: 4 }} />
              Always Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400">
            Bet on the race. Always live. Always action.
          </p>
        </div>

        <div
          className="flex items-center gap-1.5 rounded-xl px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-bold transition-all group-hover:scale-105 shrink-0"
          style={{
            background: "rgba(0,255,136,0.12)",
            border: "1px solid rgba(0,255,136,0.3)",
            color: "#00ff88",
            boxShadow: "0 0 20px rgba(0,255,136,0.1)",
          }}
        >
          <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Play Now
        </div>
      </div>
    </motion.a>
  );
}
