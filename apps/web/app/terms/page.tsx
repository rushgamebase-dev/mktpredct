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
        Voltar
      </Link>

      <h1 className="text-2xl font-black text-white mb-6">
        Termos de Uso — Rush Markets
      </h1>
      <p className="text-[10px] text-gray-600 mb-6">Versão 1.0 · Atualizado em Abril 2026</p>

      <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
        <Section title="1. Natureza do serviço">
          Rush Markets é uma plataforma descentralizada de mercados de predição operando na blockchain Base (Layer 2 da Ethereum).
          Os mercados permitem que usuários façam apostas especulativas sobre eventos futuros utilizando ETH (Ether).
          <strong className="block mt-2 text-white">
            Este serviço NÃO é uma corretora de valores, fundo de investimento, ou instituição financeira.
          </strong>
        </Section>

        <Section title="2. Riscos">
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Perda total:</strong> Você pode perder 100% do valor apostado em qualquer mercado.</li>
            <li><strong>Volatilidade:</strong> Os odds mudam em tempo real com base em apostas de outros participantes.</li>
            <li><strong>Smart contracts:</strong> Os contratos são imutáveis após o deploy. Bugs, embora testados, podem existir.</li>
            <li><strong>Resolução:</strong> A resolução dos mercados depende de um operador centralizado (signer). Não há oracle descentralizado.</li>
            <li><strong>Irreversibilidade:</strong> Transações on-chain são irreversíveis. Uma vez enviada, a aposta não pode ser cancelada.</li>
            <li><strong>Sem proteção off-chain:</strong> Pausas na plataforma NÃO impedem interações diretas com os contratos na Base.</li>
          </ul>
        </Section>

        <Section title="3. Elegibilidade">
          Ao utilizar a plataforma, você declara ter no mínimo 18 anos de idade e capacidade legal para realizar transações
          financeiras em sua jurisdição. A plataforma não realiza verificação de identidade (KYC).
        </Section>

        <Section title="4. Criação de mercados">
          Qualquer usuário pode propor a criação de um mercado de predição. Propostas são revisadas e aprovadas
          manualmente pelo operador da plataforma. Criadores de mercados aprovados recebem uma parcela das taxas
          de protocolo (fee-share). O criador deve declarar conflitos de interesse e definir critérios objetivos de resolução.
        </Section>

        <Section title="5. Taxas">
          O protocolo cobra uma taxa de 5% sobre o pool total de cada mercado no momento da resolução.
          Desta taxa, até 80% pode ser direcionada ao criador do mercado (fee-share). A taxa é calculada e
          cobrada automaticamente pelo smart contract e não pode ser alterada após o deploy.
        </Section>

        <Section title="6. Resolução e disputas">
          Mercados são resolvidos pelo operador da plataforma com base nos critérios de resolução definidos
          na proposta. Não existe mecanismo formal de apelação on-chain. O operador pode pausar ou marcar
          mercados como "em disputa" caso identifique irregularidades.
        </Section>

        <Section title="7. Anti-abuso">
          A plataforma monitora automaticamente comportamentos suspeitos, incluindo:
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>Auto-aposta (proposer apostando no próprio mercado)</li>
            <li>Apostas em ambos os lados (round-trip)</li>
            <li>Concentração de volume em uma única carteira</li>
          </ul>
          Atividades abusivas podem resultar no bloqueio de pagamentos de fee-share e cancelamento de mercados.
        </Section>

        <Section title="8. Isenção de responsabilidade">
          <strong className="text-white">
            A plataforma é fornecida "como está" (as-is), sem garantias de qualquer tipo.
          </strong>{" "}
          O operador não garante disponibilidade contínua, resolução correta de todos os mercados,
          ou proteção contra perdas financeiras. O uso da plataforma é por sua conta e risco.
        </Section>

        <Section title="9. Jurisdição">
          Este serviço não é operado por empresa sediada no Brasil. Não é regulado pela CVM,
          Banco Central, SUSEP ou qualquer órgão regulador brasileiro. Mercados relacionados a
          eleições brasileiras ou eventos esportivos regulados pela Lei 14.790/2023 não são
          permitidos na plataforma.
        </Section>

        <Section title="10. Aceitação">
          Ao conectar sua carteira e interagir com a plataforma, você declara ter lido, compreendido
          e aceito integralmente estes termos. O aceite é registrado com assinatura criptográfica (EIP-191)
          e timestamp para fins de auditoria.
        </Section>
      </div>

      <div className="mt-8 mb-12 text-center text-[10px] text-gray-600">
        Dúvidas: maumcrez@gmail.com
      </div>
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
