"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Key,
  Lock,
  ShieldAlert,
  X,
} from "lucide-react";
import type { AdminMarketProposal, ApprovalChecklist } from "@rush/shared";
import {
  useAdminProposals,
  useApproveProposal,
  useRejectProposal,
} from "@/hooks/useAdminProposals";
import { clearAdminKey, getAdminKey, setAdminKey } from "@/lib/adminKey";
import { formatAddress } from "@/lib/format";

const STATUS_TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
] as const;

type Status = (typeof STATUS_TABS)[number]["id"];

const CHECKLIST_ITEMS: Array<{ key: keyof ApprovalChecklist; label: string; hint: string }> = [
  { key: "clarity",  label: "Question is unambiguous",          hint: "A rational third party would resolve it the same way given identical evidence." },
  { key: "criteria", label: "Resolution criteria are concrete", hint: "Data source, cutoff, tiebreaker all specified. No subjective terms." },
  { key: "conflict", label: "No undeclared conflicts",          hint: "If the proposer's wallet has a big stake in the outcome, it's disclosed." },
  { key: "tos",      label: "ToS accepted (or agent proposal)", hint: "Human proposers must have accepted Terms. Agents bypass this check." },
  { key: "source",   label: "Truth source is reachable",        hint: "You can verify the outcome via a public, durable source at the deadline." },
  { key: "legal",    label: "Not a restricted topic",           hint: "No markets on political assassinations, lives of named individuals, or jurisdictional issues." },
];

const EMPTY_CHECKLIST: ApprovalChecklist = {
  clarity: false,
  criteria: false,
  conflict: false,
  tos: false,
  source: false,
  legal: false,
};

export default function AdminProposalsPage() {
  const [keyPresent, setKeyPresent] = useState(false);
  const [status, setStatus] = useState<Status>("pending");

  useEffect(() => {
    setKeyPresent(!!getAdminKey());
  }, []);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useAdminProposals({ status, keyPresent });

  const proposals = data?.proposals ?? [];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up px-4 py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Home
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" style={{ color: "var(--gold)" }} />
            <h1 className="text-xl font-black text-white">Admin · Proposals</h1>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Approve or reject market proposals. Admin-only; your <code>x-api-key</code> is stored in this browser.
          </p>
        </div>

        {keyPresent && (
          <button
            type="button"
            onClick={() => {
              clearAdminKey();
              setKeyPresent(false);
            }}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-white"
          >
            Clear key
          </button>
        )}
      </div>

      {!keyPresent ? (
        <AdminKeyGate onSet={() => setKeyPresent(true)} />
      ) : (
        <>
          {/* Status tabs */}
          <div className="mb-4 flex items-center gap-2 overflow-x-auto">
            {STATUS_TABS.map((t) => {
              const active = t.id === status;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStatus(t.id)}
                  className="rounded-md border px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{
                    borderColor: active ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)",
                    background: active ? "rgba(255,215,0,0.08)" : "transparent",
                    color: active ? "var(--gold)" : "var(--muted)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
            <div className="ml-auto text-[10px] uppercase tracking-wider text-gray-600">
              {data ? `${data.total} total` : ""}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
              {String((error as Error).message)}
            </div>
          )}

          {isLoading && (
            <div className="space-y-3">
              <div className="skeleton h-28 w-full rounded-xl" />
              <div className="skeleton h-28 w-full rounded-xl" />
            </div>
          )}

          {!isLoading && proposals.length === 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-gray-500">
              No proposals with status <span className="text-gray-300">{status}</span>.
            </div>
          )}

          <div className="space-y-3">
            {proposals.map((p) => (
              <ProposalRow key={p.id} proposal={p} onAction={() => refetch()} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function AdminKeyGate({ onSet }: { onSet: () => void }) {
  const [val, setVal] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!val.trim()) return;
        setAdminKey(val.trim());
        onSet();
      }}
      className="card space-y-3 p-5"
    >
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <Lock className="h-4 w-4" style={{ color: "var(--gold)" }} />
        Admin API key required
      </div>
      <p className="text-xs text-gray-500">
        Paste the <code>ADMIN_API_KEY</code> env var from Railway. It is stored only in your browser localStorage and sent as <code>x-api-key</code> on every admin request. It never leaves this device except to the Rush API.
      </p>
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4 text-gray-500" />
        <input
          type="password"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="admin api key"
          autoFocus
          autoComplete="off"
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={!val.trim()}
          className="rounded-md px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
          style={{ background: "var(--gold)", color: "#000" }}
        >
          Unlock
        </button>
      </div>
    </form>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function ProposalRow({
  proposal,
  onAction,
}: {
  proposal: AdminMarketProposal;
  onAction: () => void;
}) {
  const [open, setOpen] = useState(proposal.status === "pending");
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");

  const approve = useApproveProposal();
  const reject = useRejectProposal();

  const [checklist, setChecklist] = useState<ApprovalChecklist>(EMPTY_CHECKLIST);
  const [feeShareBps, setFeeShareBps] = useState<number>(8000);
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const allChecked = useMemo(
    () => CHECKLIST_ITEMS.every((i) => checklist[i.key]),
    [checklist],
  );

  const age = Math.floor(Date.now() / 1000) - proposal.createdAt;
  const ageStr =
    age < 3600 ? `${Math.floor(age / 60)}m` :
    age < 86400 ? `${Math.floor(age / 3600)}h` :
    `${Math.floor(age / 86400)}d`;
  const deadline = new Date(proposal.deadline * 1000);

  const statusColor =
    proposal.status === "approved" ? "#00ff88" :
    proposal.status === "rejected" ? "#ff4444" : "#ffc828";

  const tosOk = proposal.agentId != null || proposal.tosAcceptedAt != null;
  const criteriaOk = proposal.resolutionCriteria.length >= 20;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-white/[0.02]"
      >
        <span
          className="mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}
        >
          {proposal.status}
        </span>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white leading-tight">{proposal.question}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
            <span>#{proposal.id}</span>
            <span>by {formatAddress(proposal.proposerAddress)}</span>
            <span>{ageStr} ago</span>
            <span>{proposal.labels.join(" / ")}</span>
            <span>ends {deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            {proposal.agentId != null && (
              <span className="rounded px-1.5 py-[1px] font-bold" style={{ background: "rgba(0,170,255,0.12)", color: "#00aaff" }}>
                agent #{proposal.agentId}
              </span>
            )}
          </div>
        </div>

        <span className="text-gray-500">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 py-4 space-y-4">
          {/* Details */}
          <DetailRow label="Rationale" value={proposal.rationale || <em className="text-gray-600">(none)</em>} />
          <DetailRow
            label="Resolution criteria"
            value={
              <span style={{ color: criteriaOk ? "#e0e0e0" : "#ff9999" }}>
                {proposal.resolutionCriteria || <em className="text-red-400">MISSING</em>}
              </span>
            }
          />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <DetailRow label="Grace period" value={`${Math.round(proposal.gracePeriod / 86400)} days`} />
            <DetailRow label="Market type" value={proposal.marketType} />
            <DetailRow
              label="ToS accepted"
              value={tosOk ? (proposal.agentId != null ? "agent (skipped)" : new Date((proposal.tosAcceptedAt ?? 0) * 1000).toLocaleString()) : <span className="text-red-400">NO</span>}
            />
            <DetailRow
              label="Conflict declared"
              value={
                proposal.conflictDeclared === true
                  ? <span className="text-yellow-300">{proposal.conflictDetail || "yes (no detail)"}</span>
                  : proposal.conflictDeclared === false ? "none" : <span className="text-gray-600">—</span>
              }
            />
          </div>

          {/* If already resolved */}
          {proposal.status === "approved" && proposal.marketAddress && (
            <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3 text-xs">
              Market live at{" "}
              <Link
                href={`/markets/${proposal.marketAddress}`}
                className="inline-flex items-center gap-1 font-mono font-bold"
                style={{ color: "#00ff88" }}
              >
                {proposal.marketAddress}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
          {proposal.status === "rejected" && proposal.rejectReason && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
              <strong className="uppercase tracking-wider text-[10px]">Reason:</strong> {proposal.rejectReason}
            </div>
          )}

          {/* Action panel */}
          {proposal.status === "pending" && (
            <div className="space-y-3">
              {mode === "idle" && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("approve")}
                    className="flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase"
                    style={{ background: "#00ff88", color: "#001a0d" }}
                  >
                    <Check className="mr-1 inline h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("reject")}
                    className="flex-1 rounded-md border border-white/10 px-3 py-2 text-xs font-bold uppercase text-red-400 hover:bg-red-500/10"
                  >
                    <X className="mr-1 inline h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              )}

              {mode === "approve" && (
                <div className="space-y-3 rounded-lg border border-green-500/20 bg-green-500/[0.03] p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-green-300">
                    Approval checklist — all 6 required
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {CHECKLIST_ITEMS.map((item) => (
                      <label
                        key={item.key}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-white/5 p-2 hover:bg-white/[0.02]"
                      >
                        <input
                          type="checkbox"
                          checked={checklist[item.key]}
                          onChange={(e) =>
                            setChecklist((c) => ({ ...c, [item.key]: e.target.checked }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-xs font-bold text-white">{item.label}</span>
                          <span className="block text-[10px] leading-snug text-gray-500">{item.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs">
                      <span className="mb-1 block font-bold uppercase tracking-wider text-gray-500">
                        Fee share bps (0–9500)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={9500}
                        step={100}
                        value={feeShareBps}
                        onChange={(e) => setFeeShareBps(Number(e.target.value))}
                        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-white/30"
                      />
                      <span className="mt-1 block text-[10px] text-gray-600">
                        8000 = proposer gets 80% of the 5% fee = 4% of pool. Max 9500 (protocol keeps ≥5% of the fee).
                      </span>
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block font-bold uppercase tracking-wider text-gray-500">
                        Admin notes (optional, internal)
                      </span>
                      <input
                        type="text"
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="e.g. reviewed alongside similar market #12"
                        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30"
                      />
                    </label>
                  </div>

                  {!criteriaOk && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
                      Cannot approve: resolution criteria is missing or shorter than 20 chars. The proposer has to edit and resubmit.
                    </div>
                  )}
                  {!tosOk && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
                      Cannot approve: proposer has not accepted ToS.
                    </div>
                  )}

                  {approve.error && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
                      {String((approve.error as Error).message)}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!allChecked || !criteriaOk || !tosOk || approve.isPending}
                      onClick={async () => {
                        try {
                          await approve.mutateAsync({
                            id: proposal.id,
                            feeShareBps,
                            approvalChecklist: checklist,
                            adminNotes: adminNotes || undefined,
                          });
                          setMode("idle");
                          setChecklist(EMPTY_CHECKLIST);
                          setAdminNotes("");
                          onAction();
                        } catch {
                          /* error already surfaced via approve.error */
                        }
                      }}
                      className="rounded-md px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                      style={{ background: "#00ff88", color: "#001a0d" }}
                    >
                      {approve.isPending ? "Approving…" : "Confirm approve (deploys on-chain)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("idle")}
                      className="rounded-md border border-white/10 px-3 py-2 text-xs font-bold uppercase text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mode === "reject" && (
                <div className="space-y-3 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
                  <label className="text-xs">
                    <span className="mb-1 block font-bold uppercase tracking-wider text-gray-500">
                      Rejection reason (shown publicly, 10–500 chars)
                    </span>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="e.g. duplicate of market #7; consider reframing around a different deadline."
                      className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30"
                    />
                    <span className="mt-1 block text-[10px] text-gray-600">{rejectReason.length}/500</span>
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block font-bold uppercase tracking-wider text-gray-500">
                      Admin notes (optional, internal)
                    </span>
                    <input
                      type="text"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30"
                    />
                  </label>

                  {reject.error && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
                      {String((reject.error as Error).message)}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={rejectReason.trim().length < 10 || rejectReason.length > 500 || reject.isPending}
                      onClick={async () => {
                        try {
                          await reject.mutateAsync({
                            id: proposal.id,
                            reason: rejectReason.trim(),
                            adminNotes: adminNotes || undefined,
                          });
                          setMode("idle");
                          setRejectReason("");
                          setAdminNotes("");
                          onAction();
                        } catch {
                          /* error already surfaced via reject.error */
                        }
                      }}
                      className="rounded-md px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                      style={{ background: "#ff4444", color: "#140000" }}
                    >
                      {reject.isPending ? "Rejecting…" : "Confirm reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("idle")}
                      className="rounded-md border border-white/10 px-3 py-2 text-xs font-bold uppercase text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-600">{label}</span>
      <span className="mt-0.5 block text-gray-300">{value}</span>
    </div>
  );
}
