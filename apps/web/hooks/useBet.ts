"use client";

import { useEffect } from "react";
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

  // State machine logging — trace every transition
  useEffect(() => {
    if (isWritePending) console.log("[BET_UI] awaiting_wallet");
  }, [isWritePending]);

  useEffect(() => {
    if (hash) console.log(`[BET_UI] tx_submitted hash=${hash}`);
  }, [hash]);

  useEffect(() => {
    if (isConfirming) console.log(`[BET_UI] confirming hash=${hash}`);
  }, [isConfirming, hash]);

  useEffect(() => {
    if (isSuccess) console.log(`[BET_UI] confirmed hash=${hash}`);
  }, [isSuccess, hash]);

  useEffect(() => {
    if (writeError) console.error(`[BET_UI] write_error: ${writeError.message?.slice(0, 100)}`);
  }, [writeError]);

  useEffect(() => {
    if (receiptError) console.error(`[BET_UI] receipt_error: ${receiptError.message?.slice(0, 100)}`);
  }, [receiptError]);

  function placeBet(outcomeIndex: number, ethAmount: string) {
    console.log(`[BET_UI] click | market=${marketAddress.slice(0, 10)} | outcome=${outcomeIndex} | amount=${ethAmount}`);
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
    isWalletOpen: isWritePending,
    isConfirming,
    isPending: isWritePending || isConfirming,
    isSuccess,
    error: writeError || receiptError,
    reset,
  };
}
