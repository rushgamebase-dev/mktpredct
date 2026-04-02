import { formatEther } from "viem";

/**
 * Format a wei string to a human-readable ETH value.
 * "50000000000000000" -> "0.05 ETH"
 */
export function formatEth(wei: string): string {
  const eth = formatEther(BigInt(wei));
  // Show up to 4 significant decimals, strip trailing zeros
  const num = parseFloat(eth);
  if (num === 0) return "0 ETH";
  if (num >= 1) return `${num.toFixed(2)} ETH`;
  if (num >= 0.01) return `${num.toFixed(4)} ETH`;
  return `${num.toFixed(6)} ETH`;
}

/**
 * Format a raw ETH number (not wei) for display.
 */
export function formatEthNumber(num: number): string {
  if (num === 0) return "0 ETH";
  if (num >= 1) return `${num.toFixed(2)} ETH`;
  if (num >= 0.01) return `${num.toFixed(4)} ETH`;
  return `${num.toFixed(6)} ETH`;
}

/**
 * Truncate an Ethereum address: 0x1234...5678
 */
export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Convert a Unix timestamp (seconds) to a relative time string.
 * "2m ago", "1h ago", "3d ago"
 */
export function timeAgo(timestampSec: number): string {
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - timestampSec);

  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestampSec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a deadline timestamp to a human-readable date.
 */
export function formatDeadline(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  const now = new Date();
  const diff = timestampSec - now.getTime() / 1000;

  if (diff < 0) return "Ended";
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d left`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
