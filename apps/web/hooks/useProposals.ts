"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import type {
  MarketProposal,
  ProposalsListResponse,
  ProposerEarningsResponse,
  CreateProposalRequest,
} from "@rush/shared";
import { apiGet, apiPost } from "@/lib/api";

export function useProposals(params?: {
  status?: string;
  proposer?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const status = params?.status ?? "all";
  const proposer = params?.proposer;

  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(status !== "all" ? { status } : {}),
    ...(proposer ? { proposer } : {}),
  }).toString();

  return useQuery<ProposalsListResponse>({
    queryKey: ["proposals", page, pageSize, status, proposer],
    queryFn: () => apiGet<ProposalsListResponse>(`/api/proposals?${qs}`),
    staleTime: 10_000,
  });
}

export function useProposal(id: number | null) {
  return useQuery<MarketProposal>({
    queryKey: ["proposal", id],
    queryFn: () => apiGet<MarketProposal>(`/api/proposals/${id}`),
    enabled: id != null && id > 0,
    staleTime: 10_000,
  });
}

export function useProposerEarnings(address: string | undefined) {
  return useQuery<ProposerEarningsResponse>({
    queryKey: ["proposer-earnings", address],
    queryFn: () =>
      apiGet<ProposerEarningsResponse>(
        `/api/proposals/earnings/${address}`,
      ),
    enabled: !!address,
    staleTime: 30_000,
  });
}

export function useCreateProposal() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  return useMutation<MarketProposal, Error, Omit<CreateProposalRequest, "proposerAddress" | "signature" | "timestamp">>({
    mutationFn: async (input) => {
      if (!address) throw new Error("Wallet not connected");

      const timestamp = Math.floor(Date.now() / 1000);
      const message = `Rush Markets proposal:\n${input.question}\nby ${address.toLowerCase()}\nat ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const body: CreateProposalRequest = {
        ...input,
        proposerAddress: address,
        signature,
        timestamp,
      };

      return apiPost<MarketProposal>("/api/proposals", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}
