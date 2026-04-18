"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Loader2, Check, Zap, AlertTriangle, Scale } from "lucide-react";
import { useCreateProposal } from "@/hooks/useProposals";

const GRACE_OPTIONS = [
  { label: "7 days", value: 604800 },
  { label: "14 days", value: 1209600 },
  { label: "30 days", value: 2592000 },
];

export default function ProposePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const createProposal = useCreateProposal();

  const [question, setQuestion] = useState("");
  const [labels, setLabels] = useState(["Yes", "No"]);
  const [deadlineStr, setDeadlineStr] = useState("");
  const [gracePeriod, setGracePeriod] = useState(604800);
  const [rationale, setRationale] = useState("");
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [conflictDeclared, setConflictDeclared] = useState<boolean | null>(null);
  const [conflictDetail, setConflictDetail] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);

  const addLabel = () => {
    if (labels.length < 10) setLabels([...labels, ""]);
  };
  const removeLabel = (i: number) => {
    if (labels.length > 2) setLabels(labels.filter((_, idx) => idx !== i));
  };
  const updateLabel = (i: number, v: string) => {
    setLabels(labels.map((l, idx) => (idx === i ? v : l)));
  };

  const deadline = deadlineStr ? Math.floor(new Date(deadlineStr).getTime() / 1000) : 0;
  const isValid =
    question.length >= 3 &&
    labels.every((l) => l.trim().length > 0) &&
    deadline > Math.floor(Date.now() / 1000) + 3600 &&
    resolutionCriteria.length >= 20 &&
    conflictDeclared !== null &&
    (!conflictDeclared || conflictDetail.length >= 10) &&
    tosAccepted;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || conflictDeclared === null) return;
    try {
      const result = await createProposal.mutateAsync({
        question: question.trim(),
        labels: labels.map((l) => l.trim()),
        deadline,
        gracePeriod,
        rationale: rationale.trim() || undefined,
        resolutionCriteria: resolutionCriteria.trim(),
        conflictDeclared,
        conflictDetail: conflictDeclared ? conflictDetail.trim() : undefined,
        tosAcceptedAt: Math.floor(Date.now() / 1000),
        tosVersion: "1.0",
      });
      router.push(`/proposals/${result.id}`);
    } catch {
      // error is in createProposal.error
    }
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Markets
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Propose a Market</h1>
        <p className="mt-1 text-sm text-gray-400">
          Create a prediction market and earn <span style={{ color: "#00ff88" }}>4% of every bet</span> if approved.
        </p>
      </div>

      {!isConnected ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-400 mb-3">Connect your wallet to propose a market</p>
          <button
            className="btn-primary rounded-xl px-6 py-3 text-sm font-bold"
            onClick={() => window.dispatchEvent(new CustomEvent("rush:open-connect"))}
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Question */}
          <div className="card p-4 mb-4">
            <label className="mb-1.5 block text-xs font-bold text-gray-500 uppercase tracking-wider">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will Bitcoin hit $200k by end of 2026?"
              maxLength={200}
              className="w-full rounded-lg bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder-gray-600"
              style={{ border: "1px solid var(--border)" }}
            />
            <span className="mt-1 block text-right text-[10px] text-gray-600">
              {question.length}/200
            </span>
          </div>

          {/* Outcomes */}
          <div className="card p-4 mb-4">
            <label className="mb-1.5 block text-xs font-bold text-gray-500 uppercase tracking-wider">
              Outcomes
            </label>
            <div className="space-y-2">
              {labels.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => updateLabel(i, e.target.value)}
                    placeholder={`Outcome ${i + 1}`}
                    maxLength={50}
                    className="flex-1 rounded-lg bg-transparent px-3 py-2 text-sm text-white outline-none placeholder-gray-600"
                    style={{ border: "1px solid var(--border)" }}
                  />
                  {labels.length > 2 && (
                    <button type="button" onClick={() => removeLabel(i)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {labels.length < 10 && (
              <button type="button" onClick={addLabel}
                className="mt-2 flex items-center gap-1 text-xs font-bold hover:text-white"
                style={{ color: "var(--primary)" }}>
                <Plus className="h-3 w-3" /> Add outcome
              </button>
            )}
          </div>

          {/* Deadline + Grace */}
          <div className="card p-4 mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500 uppercase tracking-wider">Deadline</label>
              <input type="datetime-local" value={deadlineStr} onChange={(e) => setDeadlineStr(e.target.value)}
                className="w-full rounded-lg bg-transparent px-3 py-2 text-sm text-white outline-none"
                style={{ border: "1px solid var(--border)", colorScheme: "dark" }} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500 uppercase tracking-wider">Grace Period</label>
              <select value={gracePeriod} onChange={(e) => setGracePeriod(Number(e.target.value))}
                className="w-full rounded-lg bg-transparent px-3 py-2.5 text-sm text-white outline-none"
                style={{ border: "1px solid var(--border)", colorScheme: "dark" }}>
                {GRACE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Resolution Criteria — NEW, REQUIRED */}
          <div className="card p-4 mb-4">
            <label className="mb-1.5 block text-xs font-bold text-gray-500 uppercase tracking-wider">
              Resolution Criteria <span className="text-red-400">*</span>
            </label>
            <p className="text-[10px] text-gray-600 mb-2">
              How will this market be resolved? Specify the data source, time, and conditions.
            </p>
            <textarea
              value={resolutionCriteria}
              onChange={(e) => setResolutionCriteria(e.target.value)}
              placeholder="This market resolves YES if the BTC/USD price on CoinGecko is >= $200,000 at 23:59 UTC on December 31, 2026. Otherwise, it resolves NO."
              maxLength={2000}
              rows={4}
              className="w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm text-white outline-none placeholder-gray-600"
              style={{ border: `1px solid ${resolutionCriteria.length >= 20 ? "var(--border)" : resolutionCriteria.length > 0 ? "rgba(255,200,40,0.3)" : "var(--border)"}` }}
            />
            <div className="mt-1 flex justify-between text-[10px]">
              <span style={{ color: resolutionCriteria.length >= 20 ? "#00ff88" : resolutionCriteria.length > 0 ? "#ffc828" : "#666" }}>
                {resolutionCriteria.length >= 20 ? "Good" : `Min 20 chars (${resolutionCriteria.length}/20)`}
              </span>
              <span className="text-gray-600">{resolutionCriteria.length}/2000</span>
            </div>
          </div>

          {/* Rationale */}
          <div className="card p-4 mb-4">
            <label className="mb-1.5 block text-xs font-bold text-gray-500 uppercase tracking-wider">
              Why this market? <span className="text-gray-600 normal-case">(optional)</span>
            </label>
            <textarea
              value={rationale} onChange={(e) => setRationale(e.target.value)}
              placeholder="Explain why this prediction is interesting..."
              maxLength={1000} rows={3}
              className="w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm text-white outline-none placeholder-gray-600"
              style={{ border: "1px solid var(--border)" }} />
          </div>

          {/* Conflict of Interest — NEW, REQUIRED */}
          <div className="card p-4 mb-4">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <Scale className="h-3.5 w-3.5" />
              Conflict of Interest <span className="text-red-400">*</span>
            </label>
            <p className="text-[10px] text-gray-600 mb-3">
              Do you have a direct financial interest in the outcome of this market?
            </p>
            <div className="flex gap-3 mb-2">
              <button type="button" onClick={() => setConflictDeclared(false)}
                className="flex-1 rounded-lg py-2 text-xs font-bold transition-all"
                style={conflictDeclared === false
                  ? { background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.3)" }
                  : { background: "transparent", color: "#666", border: "1px solid var(--border)" }}>
                No conflict
              </button>
              <button type="button" onClick={() => setConflictDeclared(true)}
                className="flex-1 rounded-lg py-2 text-xs font-bold transition-all"
                style={conflictDeclared === true
                  ? { background: "rgba(255,200,40,0.1)", color: "#ffc828", border: "1px solid rgba(255,200,40,0.3)" }
                  : { background: "transparent", color: "#666", border: "1px solid var(--border)" }}>
                I have a conflict
              </button>
            </div>
            {conflictDeclared && (
              <textarea
                value={conflictDetail} onChange={(e) => setConflictDetail(e.target.value)}
                placeholder="Describe your conflict of interest (min 10 chars)..."
                maxLength={500} rows={2}
                className="w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm text-white outline-none placeholder-gray-600"
                style={{ border: "1px solid rgba(255,200,40,0.2)" }} />
            )}
          </div>

          {/* Terms of Service — NEW, REQUIRED */}
          <div className="card p-4 mb-4" style={{ borderColor: tosAccepted ? "rgba(0,255,136,0.15)" : "var(--border)" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#ffc828" }} />
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-300 mb-1">Risk acknowledgment</p>
                <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
                  Prediction markets are speculative. You may lose 100% of your bet.
                  Markets are resolved by a centralized operator. Smart contracts are immutable.
                  This service is not regulated by any financial authority.{" "}
                  <Link href="/terms" target="_blank" className="underline text-gray-400 hover:text-white">
                    Read full terms
                  </Link>
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tosAccepted}
                    onChange={(e) => setTosAccepted(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#00ff88]"
                  />
                  <span className="text-xs text-gray-400">
                    I have read and accept the{" "}
                    <Link href="/terms" target="_blank" className="underline font-bold text-gray-300 hover:text-white">
                      Terms of Service
                    </Link>{" "}
                    and understand the risks
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Incentive */}
          <div className="mb-4 rounded-xl p-3 flex items-center gap-3"
            style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.1)" }}>
            <Zap className="h-5 w-5 shrink-0" style={{ color: "#00ff88" }} />
            <div>
              <p className="text-xs font-bold" style={{ color: "#00ff88" }}>Earn 4% of the pool</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                If approved, every bet on your market earns you a share of the protocol fee.
                Fee-share requires minimum pool of 0.01 ETH.
              </p>
            </div>
          </div>

          {/* Submit */}
          {createProposal.isSuccess ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
              style={{ background: "rgba(0,255,136,0.12)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.25)" }}>
              <Check className="h-4 w-4" />
              Proposal submitted!
            </motion.div>
          ) : (
            <button type="submit" disabled={!isValid || createProposal.isPending}
              className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-40">
              {createProposal.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Signing...</>
              ) : (
                "Sign & Submit Proposal"
              )}
            </button>
          )}

          {createProposal.error && (
            <p className="mt-2 text-xs text-center" style={{ color: "#ff4444" }}>
              {createProposal.error.message?.includes("User rejected")
                ? "Signature rejected"
                : createProposal.error.message?.slice(0, 160) ?? "Failed to submit"}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
