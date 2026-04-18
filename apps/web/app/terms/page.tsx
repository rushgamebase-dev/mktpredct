"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Link>

      <h1 className="text-2xl font-black text-white mb-6">
        Terms of Service — Rush Markets
      </h1>
      <p className="text-[10px] text-gray-600 mb-6">Version 1.0 · Updated April 2026</p>

      <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
        <Section title="1. Nature of Service">
          Rush Markets is a decentralized prediction market platform operating on the Base blockchain (Ethereum Layer 2).
          Markets allow users to place speculative bets on future events using ETH (Ether).
          <strong className="block mt-2 text-white">
            This service is NOT a brokerage, investment fund, or financial institution.
          </strong>
        </Section>

        <Section title="2. Risks">
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Total loss:</strong> You may lose 100% of the amount bet on any market.</li>
            <li><strong>Volatility:</strong> Odds change in real-time based on other participants&apos; bets.</li>
            <li><strong>Smart contracts:</strong> Contracts are immutable after deployment. Bugs, although tested for, may exist.</li>
            <li><strong>Resolution:</strong> Market resolution depends on a centralized operator (signer). There is no decentralized oracle.</li>
            <li><strong>Irreversibility:</strong> On-chain transactions are irreversible. Once sent, a bet cannot be cancelled.</li>
            <li><strong>No off-chain protection:</strong> Platform pauses do NOT prevent direct interactions with contracts on Base.</li>
          </ul>
        </Section>

        <Section title="3. Eligibility">
          By using the platform, you declare that you are at least 18 years old and legally capable of
          conducting financial transactions in your jurisdiction. The platform does not perform identity verification (KYC).
        </Section>

        <Section title="4. Market Creation">
          Any user can propose the creation of a prediction market. Proposals are manually reviewed and approved
          by the platform operator. Creators of approved markets receive a share of protocol fees (fee-share).
          Creators must declare conflicts of interest and define objective resolution criteria.
        </Section>

        <Section title="5. Fees">
          The protocol charges a 5% fee on the total pool of each market at the time of resolution.
          Of this fee, up to 80% may be directed to the market creator (fee-share). The fee is calculated
          and collected automatically by the smart contract and cannot be changed after deployment.
        </Section>

        <Section title="6. Resolution and Disputes">
          Markets are resolved by the platform operator based on the resolution criteria defined
          in the proposal. There is no formal on-chain appeal mechanism. The operator may pause or flag
          markets as &quot;disputed&quot; if irregularities are identified.
        </Section>

        <Section title="7. Anti-Abuse">
          The platform automatically monitors suspicious behavior, including:
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>Self-betting (proposer betting on their own market)</li>
            <li>Round-trip betting (betting on both sides)</li>
            <li>Volume concentration in a single wallet</li>
          </ul>
          Abusive activities may result in blocked fee-share payments and market cancellation.
        </Section>

        <Section title="8. Disclaimer">
          <strong className="text-white">
            The platform is provided &quot;as-is&quot;, without warranties of any kind.
          </strong>{" "}
          The operator does not guarantee continuous availability, correct resolution of all markets,
          or protection against financial losses. Use of the platform is at your own risk.
        </Section>

        <Section title="9. Jurisdiction">
          This service is not operated by a company based in any specific jurisdiction. It is not regulated
          by any financial regulatory authority. Markets related to regulated events in your jurisdiction
          may not be permitted on the platform.
        </Section>

        <Section title="10. Acceptance">
          By connecting your wallet and interacting with the platform, you declare that you have read,
          understood, and fully accepted these terms. Acceptance is recorded with a cryptographic signature
          (EIP-191) and timestamp for audit purposes.
        </Section>
      </div>

      <div className="mt-8 mb-12" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="text-base font-bold text-white mb-2">{title}</h2>
      <div className="text-sm text-gray-400 leading-relaxed">{children}</div>
    </div>
  );
}
