"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import type { MarketDetail, CommentsResponse } from "@rush/shared";
import { apiGet } from "@/lib/api";
import { formatAddress, timeAgo } from "@/lib/format";
import { MessageCircle, Send } from "lucide-react";

interface MarketCommentsProps {
  market: MarketDetail;
  labels: string[];
  colors: string[];
}

export default function MarketComments({ market }: MarketCommentsProps) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["comments", market.address],
    queryFn: () => apiGet<CommentsResponse>(`/api/markets/${market.address}/comments`),
    refetchInterval: 30000,
  });

  const postComment = useMutation({
    mutationFn: async (content: string) => {
      const message = `Rush Markets comment on ${market.address}:\n${content}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/markets/${market.address}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, userAddress: address?.toLowerCase(), signature }),
        },
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", market.address] });
      setNewComment("");
    },
  });

  const comments = data?.comments ?? [];

  return (
    <div className="card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-300 mb-3">
        <MessageCircle className="h-4 w-4" />
        Community
        {comments.length > 0 && <span className="text-[10px] text-gray-600 font-normal">{comments.length}</span>}
      </h3>

      {isConnected ? (
        <form onSubmit={(e) => { e.preventDefault(); if (newComment.trim()) postComment.mutate(newComment.trim()); }} className="flex gap-2 mb-3">
          <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your take..." maxLength={500} className="input-base flex-1 rounded-lg px-3 py-1.5 text-xs" />
          <button type="submit" disabled={postComment.isPending || !newComment.trim()} className="btn-primary rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-30">
            <Send className="h-3 w-3" />
          </button>
        </form>
      ) : (
        <p className="text-[10px] text-gray-600 mb-3">Connect wallet to comment</p>
      )}

      {isLoading ? (
        <div className="space-y-2"><div className="skeleton h-10 w-full rounded-lg" /><div className="skeleton h-10 w-full rounded-lg" /></div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-4">No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <AnimatePresence initial={false}>
            {comments.map((c) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 py-1.5">
                <div className="h-5 w-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold"
                  style={{ background: `hsl(${(c.userAddress.charCodeAt(2) ?? 0) * 15}, 60%, 40%)`, color: "#fff" }}>
                  {c.userAddress.slice(2, 4).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-gray-500">{formatAddress(c.userAddress)}</span>
                    <span className="text-[9px] text-gray-700">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{c.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
