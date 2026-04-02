"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { MarketABI } from "@rush/shared";

export function useBet(marketAddress: string) {
  const {
    data: hash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  function placeBet(outcomeIndex: number, ethAmount: string) {
    writeContract({
      address: marketAddress as `0x${string}`,
      abi: MarketABI,
      functionName: "bet",
      args: [BigInt(outcomeIndex)],
      value: parseEther(ethAmount),
    });
  }

  return {
    placeBet,
    hash,
    isPending: isWritePending || isConfirming,
    isSuccess,
    error: writeError || receiptError,
    reset,
  };
}
