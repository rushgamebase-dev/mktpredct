"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { isAddress, parseEther } from "viem";
import { MarketABI } from "@rush/shared";
import { base } from "@/lib/wagmi";

export function useBet(marketAddress: string) {
  const publicClient = usePublicClient();
  const { address: userAddress, chain } = useAccount();
  const chainId = chain?.id;

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
    if (writeError) console.error(`[BET_UI] write_error: ${writeError.message?.slice(0, 120)}`);
  }, [writeError]);

  useEffect(() => {
    if (receiptError) console.error(`[BET_UI] receipt_error: ${receiptError.message?.slice(0, 120)}`);
  }, [receiptError]);

  useEffect(() => {
    if (simulateError) console.error(`[BET_UI] simulate_error: ${simulateError.message?.slice(0, 120)}`);
  }, [simulateError]);

  const placeBet = useCallback(
    async (outcomeIndex: number, ethAmount: string) => {
      setSimulateError(null);

      if (!isAddress(marketAddress)) {
        setSimulateError(new Error("Invalid market address"));
        return;
      }
      if (chainId == null) {
        setSimulateError(new Error("Wallet chain not detected — reconnect wallet"));
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
      let value: bigint;
      try {
        value = parseEther(ethAmount);
      } catch {
        setSimulateError(new Error("Invalid amount"));
        return;
      }

      setIsSimulating(true);
      try {
        // TX Safety: verify contract code exists, then simulate before signing
        const code = await publicClient.getCode({ address: addr });
        if (!code || code === "0x") {
          throw new Error("No contract at this address");
        }
        await publicClient.simulateContract({
          address: addr,
          abi: MarketABI,
          functionName: "bet",
          args: [BigInt(outcomeIndex)],
          value,
          account: userAddress,
        });
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        // viem errors often expose a short reason via `shortMessage`
        const short = (e as { shortMessage?: string } | undefined)?.shortMessage;
        setSimulateError(short ? new Error(short) : err);
        setIsSimulating(false);
        return;
      }
      setIsSimulating(false);

      console.log(`[BET_UI] click | market=${addr.slice(0, 10)} | outcome=${outcomeIndex} | amount=${ethAmount}`);
      writeContract({
        address: addr,
        abi: MarketABI,
        functionName: "bet",
        args: [BigInt(outcomeIndex)],
        value,
      });
    },
    [marketAddress, chainId, publicClient, userAddress, writeContract],
  );

  const reset = useCallback(() => {
    writeReset();
    setSimulateError(null);
  }, [writeReset]);

  return {
    placeBet,
    hash,
    isWalletOpen: isWritePending,
    isSimulating,
    isConfirming,
    isPending: isSimulating || isWritePending || isConfirming,
    isSuccess,
    error: simulateError ?? writeError ?? receiptError,
    reset,
  };
}
