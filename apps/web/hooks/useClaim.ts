"use client";

import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { isAddress } from "viem";
import { MarketABI } from "@rush/shared";
import { base } from "@/lib/wagmi";

export function useClaim(marketAddress: string) {
  const publicClient = usePublicClient();
  const { address: userAddress } = useAccount();
  const chainId = useChainId();

  const [simulateError, setSimulateError] = useState<Error | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const {
    data: hash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
    reset: writeReset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const claim = useCallback(async () => {
    setSimulateError(null);

    if (!isAddress(marketAddress)) {
      setSimulateError(new Error("Invalid market address"));
      return;
    }
    if (chainId !== base.id) {
      setSimulateError(new Error(`Wrong network — switch your wallet to Base`));
      return;
    }
    if (!publicClient) {
      setSimulateError(new Error("RPC unavailable — retry in a moment"));
      return;
    }
    if (!userAddress) {
      setSimulateError(new Error("Wallet not connected"));
      return;
    }

    const addr = marketAddress as `0x${string}`;

    setIsSimulating(true);
    try {
      const code = await publicClient.getCode({ address: addr });
      if (!code || code === "0x") {
        throw new Error("No contract at this address");
      }
      await publicClient.simulateContract({
        address: addr,
        abi: MarketABI,
        functionName: "claim",
        args: [],
        account: userAddress,
      });
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const short = (e as { shortMessage?: string } | undefined)?.shortMessage;
      setSimulateError(short ? new Error(short) : err);
      setIsSimulating(false);
      return;
    }
    setIsSimulating(false);

    writeContract({
      address: addr,
      abi: MarketABI,
      functionName: "claim",
      args: [],
    });
  }, [marketAddress, chainId, publicClient, userAddress, writeContract]);

  const reset = useCallback(() => {
    writeReset();
    setSimulateError(null);
  }, [writeReset]);

  return {
    claim,
    hash,
    isSimulating,
    isPending: isSimulating || isWritePending || isConfirming,
    isSuccess,
    error: simulateError ?? writeError ?? receiptError,
    reset,
  };
}
