"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminMarketProposal,
  AdminProposalsListResponse,
  ApprovalChecklist,
  ApproveProposalResponse,
} from "@rush/shared";
import { ApiError } from "@/lib/api";
import { clearAdminKey, getAdminKey } from "@/lib/adminKey";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey();
  if (!key) {
    throw new ApiError(401, "Admin key not set");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearAdminKey();
    throw new ApiError(401, "Admin key rejected — cleared from this browser");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

export function useAdminProposals(params?: {
  status?: "pending" | "approved" | "rejected" | "all";
  page?: number;
  pageSize?: number;
  keyPresent?: boolean;
}) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 50;
  const status = params?.status ?? "pending";
  const keyPresent = params?.keyPresent ?? true;

  return useQuery<AdminProposalsListResponse>({
    queryKey: ["admin-proposals", status, page, pageSize],
    queryFn: () =>
      adminFetch<AdminProposalsListResponse>(
        `/api/admin/proposals?status=${status}&page=${page}&pageSize=${pageSize}`,
      ),
    enabled: keyPresent,
    staleTime: 15_000,
  });
}

export function useApproveProposal() {
  const qc = useQueryClient();
  return useMutation<
    ApproveProposalResponse,
    Error,
    {
      id: number;
      feeShareBps: number;
      approvalChecklist: ApprovalChecklist;
      adminNotes?: string;
    }
  >({
    mutationFn: ({ id, ...body }) =>
      adminFetch<ApproveProposalResponse>(
        `/api/admin/proposals/${id}/approve`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-proposals"] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation<
    { success: boolean; proposalId: number },
    Error,
    { id: number; reason: string; adminNotes?: string }
  >({
    mutationFn: ({ id, ...body }) =>
      adminFetch<{ success: boolean; proposalId: number }>(
        `/api/admin/proposals/${id}/reject`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-proposals"] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export type { AdminMarketProposal };
