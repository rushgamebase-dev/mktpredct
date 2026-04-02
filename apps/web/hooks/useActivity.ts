import { useQuery } from "@tanstack/react-query";
import type { ActivityResponse } from "@rush/shared";
import { apiGet } from "@/lib/api";

export function useActivity(address: string) {
  return useQuery<ActivityResponse>({
    queryKey: ["activity", address],
    queryFn: () => apiGet<ActivityResponse>(`/api/markets/${address}/activity`),
    enabled: !!address,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
