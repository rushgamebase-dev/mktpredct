"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock, Check, X, Zap } from "lucide-react";
import { useProposal } from "@/hooks/useProposals";
import { formatAddress } from "@/lib/format";

export default function ProposalDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: proposal, isLoading } = useProposal(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in-up">
        <div className="skeleton h-4 w-32 mb-6" />
        <div className="skeleton h-8 w-3/4 mb-4" />
        <div className="skeleton h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-bold text-red-400">Proposal not found</p>
        <Link href="/proposals" className="mt-2 inline-block text-sm" style={{ color: "var(--primary)" }}>
          <ArrowLeft className="inline h-4 w-4" /> Back to proposals
        </Link>
      </div>
    );
  }

  const deadline = new Date(proposal.deadline * 1000);
  const submitted = new Date(proposal.createdAt * 1000);
  const reviewed = proposal.reviewedAt ? new Date(proposal.reviewedAt * 1000) : null;
  const statusColor =
    proposal.status === "approved" ? "#00ff88" : proposal.status === "rejected" ? "#ff4444" : "#ffc828";
  const StatusIcon = proposal.status === "approved" ? Check : proposal.status === "rejected" ? X : Clock;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up">
      <Link
        href="/proposals"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Proposals
      </Link>

      {/* Status badge */}
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase"
          style={{
            background: `${statusColor}15`,
            color: statusColor,
            border: `1px solid ${statusColor}30`,
          }}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {proposal.status}
        </span>
        {proposal.status === "approved" && proposal.marketAddress && (
          <Link
            href={`/markets/${proposal.marketAddress}`}
            className="flex items-center gap-1 text-xs font-bold"
            style={{ color: "#00ff88" }}
          >
            View Live Market <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Question */}
      <h1 className="text-xl font-black text-white mb-4">{proposal.question}</h1>

      {/* Details card */}
      <div className="card p-4 mb-4 space-y-3">
        <Row label="Proposed by" value={formatAddress(proposal.proposerAddress)} />
        <Row label="Outcomes" value={proposal.labels.join(" / ")} />
        <Row label="Deadline" value={deadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
        <Row
          label="Grace period"
          value={`${Math.round(proposal.gracePeriod / 86400)} days`}
        />
        <Row label="Submitted" value={submitted.toLocaleString()} />
        {reviewed && <Row label="Reviewed" value={reviewed.toLocaleString()} />}
      </div>

      {/* Rationale */}
      {proposal.rationale && (
        <div className="card p-4 mb-4">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
            Rationale
          </h3>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {proposal.rationale}
          </p>
        </div>
      )}

      {/* Rejection reason */}
      {proposal.status === "rejected" && proposal.rejectReason && (
        <div
          className="card p-4 mb-4"
          style={{ borderColor: "rgba(255,68,68,0.2)" }}
        >
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "#ff4444" }}>
            Rejection Reason
          </h3>
          <p className="text-sm text-gray-400">{proposal.rejectReason}</p>
        </div>
      )}

      {/* Incentive */}
      {proposal.status === "pending" && (
        <div
          className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.1)" }}
        >
          <Zap className="h-5 w-5 shrink-0" style={{ color: "#00ff88" }} />
          <p className="text-xs text-gray-400">
            If approved, the proposer earns <span style={{ color: "#00ff88" }} className="font-bold">4% of the total pool</span> from protocol fees.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-bold text-gray-300">{value}</span>
    </div>
  );
}
