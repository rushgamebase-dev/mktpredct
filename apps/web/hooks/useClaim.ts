"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MarketABI } from "@rush/shared";

export function useClaim(marketAddress: string) {
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

  function claim() {
    writeContract({
      address: marketAddress as `0x${string}`,
      abi: MarketABI,
      functionName: "claim",
      args: [],
    });
  }

  return {
    claim,
    hash,
    isPending: isWritePending || isConfirming,
    isSuccess,
    error: writeError || receiptError,
    reset,
  };
}
