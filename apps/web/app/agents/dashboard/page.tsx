"use client";

import React from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { formatEther } from "viem";
import { ArrowLeft, ArrowRight, Bot, Check, Clock, X, Zap, Key, TrendingUp } from "lucide-react";
import type { MarketProposal } from "@rush/shared";
import { useProposals, useProposerEarnings } from "@/hooks/useProposals";
import { apiGet } from "@/lib/api";
import { formatAddress } from "@/lib/format";

function formatWeiToEth(wei: string): string {
  try {
    const eth = formatEther(BigInt(wei));
    const n = Number(eth);
    return n < 0.0001 ? "0" : n.toFixed(4);
  } catch {
    return "0";
  }
}

interface AgentInfo {
  id: number;
  name: string;
  walletAddress: string;
  rateLimitPerHour: number;
  feeShareBps: number;
  isActive: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export default function AgentDashboardPage() {
  const { address, isConnected } = useAccount();

  // Fetch agents owned by this wallet (wallet_address matches connected wallet)
  const { data: agentsData } = useQuery<{ agents: AgentInfo[] }>({
    queryKey: ["my-agents", address],
    queryFn: async () => {
      // Public endpoint that lists agents for a wallet
      const all = await apiGet<{ agents: AgentInfo[] }>("/api/admin/proposals/agents");
      return { agents: all.agents.filter((a) => a.walletAddress === address?.toLowerCase()) };
    },
    enabled: !!address,
    staleTime: 30_000,
  });

  const agents = agentsData?.agents ?? [];
  const { data: earnings } = useProposerEarnings(address);
  const { data: proposals } = useProposals({ proposer: address?.toLowerCase(), pageSize: 50 });

  // Filter proposals from agents (have agentId)
  const agentProposals = proposals?.proposals ?? [];

  if (!isConnected || !address) {
    return (
      <div className="py-12 text-center animate-fade-in-up">
        <Bot className="mx-auto h-8 w-8 text-gray-600 mb-3" />
        <p className="text-sm text-gray-400 mb-3">Connect the wallet registered with your agent</p>
        <button
          className="btn-primary rounded-xl px-6 py-3 text-sm font-bold"
          onClick={() => window.dispatchEvent(new CustomEvent("rush:open-connect"))}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Markets
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Bot className="h-6 w-6" style={{ color: "#3B82F6" }} />
        <h1 className="text-xl font-black text-white">Agent Dashboard</h1>
      </div>

      {/* Agents registered to this wallet */}
      {agents.length === 0 ? (
        <div className="card p-6 text-center mb-6">
          <Bot className="mx-auto h-8 w-8 text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 mb-1">No agents registered to this wallet</p>
          <p className="text-[10px] text-gray-600">
            Contact the Rush team to register your agent and get an API key
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {agents.map((agent) => (
            <div key={agent.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" style={{ color: "#3B82F6" }} />
                  <span className="text-sm font-bold text-white">{agent.name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                    style={
                      agent.isActive
                        ? { background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }
                        : { background: "rgba(255,68,68,0.1)", color: "#ff4444", border: "1px solid rgba(255,68,68,0.2)" }
                    }
                  >
                    {agent.isActive ? "Active" : "Disabled"}
                  </span>
                </div>
                <span className="text-[10px] text-gray-600">ID: {agent.id}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Wallet</div>
                  <div className="text-xs font-mono text-gray-300">{formatAddress(agent.walletAddress)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Rate Limit</div>
                  <div className="text-xs font-bold text-gray-300">{agent.rateLimitPerHour}/hr</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Fee Share</div>
                  <div className="text-xs font-bold" style={{ color: "#00ff88" }}>
                    {(agent.feeShareBps / 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Last Used</div>
                  <div className="text-xs text-gray-300">
                    {agent.lastUsedAt
                      ? new Date(agent.lastUsedAt * 1000).toLocaleDateString()
                      : "Never"}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-600">
                <Key className="h-3 w-3" />
                API key was shown once at registration. Contact admin if you need a new one.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Earnings */}
      {earnings && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Earnings
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Earned</div>
              <div className="text-lg font-black tabular" style={{ color: "#00ff88" }}>
                {formatWeiToEth(earnings.totalEarned)} ETH
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Pending</div>
              <div className="text-lg font-black tabular" style={{ color: "#ffc828" }}>
                {formatWeiToEth(earnings.totalPending)} ETH
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Markets</div>
              <div className="text-lg font-black tabular text-white">
                {earnings.approvedCount}
                <span className="text-xs text-gray-500 ml-1">/ {earnings.proposalsCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proposals */}
      <h3 className="text-sm font-bold text-gray-300 mb-3">Proposals</h3>
      {agentProposals.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-xs text-gray-500">No proposals yet. Use the Agent API to create proposals.</p>
          <a
            href="https://github.com/rushgamebase-dev/mktpredct/blob/main/AGENT_API.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs font-bold"
            style={{ color: "#3B82F6" }}
          >
            Read API docs
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {agentProposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} />
          ))}
        </div>
      )}

      {/* API docs link */}
      <div className="mt-6 text-center">
        <a
          href="https://github.com/rushgamebase-dev/mktpredct/blob/main/AGENT_API.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold"
          style={{ color: "#3B82F6" }}
        >
          <Key className="h-3.5 w-3.5" />
          Agent API Documentation
        </a>
      </div>
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: MarketProposal }) {
  const statusColor =
    proposal.status === "approved" ? "#00ff88" : proposal.status === "rejected" ? "#ff4444" : "#ffc828";
  const StatusIcon = proposal.status === "approved" ? Check : proposal.status === "rejected" ? X : Clock;
  const href =
    proposal.status === "approved" && proposal.marketAddress
      ? `/markets/${proposal.marketAddress}`
      : `/proposals/${proposal.id}`;

  return (
    <Link href={href}>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-3 transition-all hover:border-white/10 cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIcon className="h-3.5 w-3.5 shrink-0" style={{ color: statusColor }} />
            <span className="text-sm font-semibold text-gray-200 truncate">{proposal.question}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-bold uppercase" style={{ color: statusColor }}>
              {proposal.status}
            </span>
            {proposal.status === "approved" && <ArrowRight className="h-3 w-3" style={{ color: "#00ff88" }} />}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
