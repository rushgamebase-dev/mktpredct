import { useQuery } from "@tanstack/react-query";
import type { MarketDetailResponse } from "@rush/shared";
import { apiGet } from "@/lib/api";

export function useMarket(address: string) {
  return useQuery<MarketDetailResponse>({
    queryKey: ["market", address],
    queryFn: () => apiGet<MarketDetailResponse>(`/api/markets/${address}`),
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: 120_000, // Slow fallback — WS invalidation handles real-time
  });
}
