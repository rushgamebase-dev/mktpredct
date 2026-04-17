"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Check, X } from "lucide-react";
import type { MarketProposal } from "@rush/shared";
import { useProposals } from "@/hooks/useProposals";
import { formatAddress } from "@/lib/format";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

const STATUS_BADGE: Record<string, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
  pending: { bg: "rgba(255,200,40,0.1)", color: "#ffc828", icon: <Clock className="h-3 w-3" />, label: "PENDING" },
  approved: { bg: "rgba(0,255,136,0.1)", color: "#00ff88", icon: <Check className="h-3 w-3" />, label: "APPROVED" },
  rejected: { bg: "rgba(255,68,68,0.1)", color: "#ff4444", icon: <X className="h-3 w-3" />, label: "REJECTED" },
};

function ProposalCard({ proposal }: { proposal: MarketProposal }) {
  const badge = STATUS_BADGE[proposal.status] ?? STATUS_BADGE.pending;
  const deadline = new Date(proposal.deadline * 1000);
  const age = Math.floor(Date.now() / 1000) - proposal.createdAt;
  const ageStr = age < 3600 ? `${Math.floor(age / 60)}m ago` : age < 86400 ? `${Math.floor(age / 3600)}h ago` : `${Math.floor(age / 86400)}d ago`;

  return (
    <Link href={proposal.status === "approved" && proposal.marketAddress ? `/markets/${proposal.marketAddress}` : `/proposals/${proposal.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-4 transition-all hover:border-white/10 cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}25` }}
          >
            {badge.icon}
            {badge.label}
          </span>
          {proposal.status === "approved" && proposal.marketAddress && (
            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: "#00ff88" }}>
              <ArrowRight className="h-3 w-3" /> Live Market
            </span>
          )}
        </div>

        <h3 className="text-sm font-bold text-white leading-tight mb-2 line-clamp-2">
          {proposal.question}
        </h3>

        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>by {formatAddress(proposal.proposerAddress)}</span>
          <span>{ageStr}</span>
          <span>{proposal.labels.join(" / ")}</span>
          <span>ends {deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>

        {proposal.status === "rejected" && proposal.rejectReason && (
          <p className="mt-2 text-[10px] italic text-gray-600 line-clamp-1">
            Reason: {proposal.rejectReason}
          </p>
        )}
      </motion.div>
    </Link>
  );
}

export default function ProposalsPage() {
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useProposals({ status, page, pageSize: 20 });

  return (
    <div className="animate-fade-in-up">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Markets
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-black text-white">Community Proposals</h1>
        <Link
          href="/propose"
          className="btn-primary rounded-lg px-4 py-1.5 text-xs font-bold"
        >
          + Propose Market
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 mb-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setStatus(tab.id); setPage(1); }}
            className="rounded-full px-3 py-1 text-xs font-bold transition-all"
            style={
              status === tab.id
                ? { background: "rgba(0,255,136,0.12)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.25)" }
                : { background: "transparent", color: "#666", border: "1px solid transparent" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && data?.proposals.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No proposals yet</p>
          <Link href="/propose" className="mt-2 inline-block text-xs font-bold" style={{ color: "#00ff88" }}>
            Be the first to propose
          </Link>
        </div>
      )}

      {/* List */}
      {data && data.proposals.length > 0 && (
        <div className="space-y-3">
          {data.proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs font-bold text-gray-500 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-gray-600">
            {page} / {Math.ceil(data.total / 20)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 20 >= data.total}
            className="text-xs font-bold text-gray-500 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
