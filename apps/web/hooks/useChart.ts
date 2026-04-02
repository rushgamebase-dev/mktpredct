import { useQuery } from "@tanstack/react-query";
import type { ChartResponse } from "@rush/shared";
import { apiGet } from "@/lib/api";

export function useChart(address: string) {
  return useQuery<ChartResponse>({
    queryKey: ["chart", address],
    queryFn: () => apiGet<ChartResponse>(`/api/markets/${address}/chart`),
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
