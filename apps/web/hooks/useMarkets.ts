import { useQuery } from "@tanstack/react-query";
import type { MarketsListResponse, MarketsListQuery } from "@rush/shared";
import { apiGet } from "@/lib/api";

export function useMarkets(params?: MarketsListQuery) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const status = params?.status ?? "all";

  const queryString = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(status !== "all" ? { status } : {}),
  }).toString();

  return useQuery<MarketsListResponse>({
    queryKey: ["markets", page, pageSize, status],
    queryFn: () => apiGet<MarketsListResponse>(`/api/markets?${queryString}`),
    staleTime: 10_000,
    refetchInterval: 15_000, // WS invalidates on events, this is safety net
  });
}
