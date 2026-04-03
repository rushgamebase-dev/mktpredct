import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import type { UserPositionsResponse } from "@rush/shared";
import { apiGet } from "@/lib/api";

export function usePositions(marketAddress: string) {
  const { address } = useAccount();

  return useQuery<UserPositionsResponse>({
    queryKey: ["positions", marketAddress, address],
    queryFn: () =>
      apiGet<UserPositionsResponse>(
        `/api/markets/${marketAddress}/positions/${address}`,
      ),
    enabled: !!marketAddress && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000, // Safety net if WS drops
  });
}
