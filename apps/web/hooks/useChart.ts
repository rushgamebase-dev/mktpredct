import { useQuery } from "@tanstack/react-query";
import type { ChartResponse } from "@rush/shared";
import { apiGet } from "@/lib/api";

export function useChart(address: string) {
  return useQuery<ChartResponse>({
    queryKey: ["chart", address],
    queryFn: () => apiGet<ChartResponse>(`/api/markets/${address}/chart`),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: false, // No polling — WS invalidation triggers refetch
  });
}
