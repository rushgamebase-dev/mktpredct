import { useQuery } from "@tanstack/react-query";
import type { MarketDetailResponse } from "@rush/shared";
import { apiGet } from "@/lib/api";

export function useMarket(address: string) {
  return useQuery<MarketDetailResponse>({
    queryKey: ["market", address],
    queryFn: () => apiGet<MarketDetailResponse>(`/api/markets/${address}`),
    enabled: !!address,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
