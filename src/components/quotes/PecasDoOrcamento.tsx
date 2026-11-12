import React from 'react';
import { Check } from 'lucide-react';

/*
  As peças de desenho do formulário de orçamento — o título de cada seção e a opção de ligar e
  desligar de um item. Moram juntas para o formulário inteiro falar uma língua só: antes cada parte
  tinha o seu rótulo (caixa alta em bronze, 11px; negrito de 15px; serifa pequena), e nada se
  destacava de nada.

  A hierarquia, de cima para baixo:
  - título da seção — serifa, 26px, preto;
  - nome do campo — 12px, semibold, cinza-escuro, dentro do campo (`CampoTinta`);
  - o que se digita — 16px, semibold, preto;
  - ajuda — 13px, cinza-escuro.
  Bronze só sobre fundo preto, como no resto do redesign.
*/

/** O título de uma seção: serifa grande, a contagem ao lado, a explicação embaixo e a ação à direita. */
export const TituloDeSecao: React.FC<{
  titulo: React.ReactNode;
  contagem?: number;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}> = ({ titulo, contagem, descricao, acao, className = '' }) => (
  <div className={`flex items-start justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      <h3 className="font-serif-luxury text-[24px] sm:text-[26px] font-semibold leading-[1.15] text-ink flex items-baseline gap-2.5">
        {titulo}
        {contagem !== undefined && (
          <span className="font-sans text-[13px] font-bold tabular-nums text-ink-soft bg-line-soft rounded-full px-2 py-0.5 leading-none relative -top-0.5">
            {contagem}
          </span>
        )}
      </h3>
      {descricao && <p className="mt-1 text-[14px] leading-snug text-ink-soft">{descricao}</p>}
    </div>
    {acao && <div className="shrink-0 flex items-center gap-1">{acao}</div>}
  </div>
);

/**
 * Uma opção do item que se liga e desliga — desconto, mais de uma sessão, cálculo por consumo.
 * Pílula de 40px no lugar da caixinha de 14px: dá para acertar com o dedo e para ver de longe o
 * que está ligado (preto com o visto) e o que não está.
 */
export const OpcaoLigavel: React.FC<{
  ligada: boolean;
  onMudar: (ligada: boolean) => void;
  children: React.ReactNode;
}> = ({ ligada, onMudar, children }) => (
  <button
    type="button"
    aria-pressed={ligada}
    onClick={() => onMudar(!ligada)}
    className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors ${
      ligada ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
    }`}
  >
    {ligada && <Check className="w-4 h-4 text-brand-light shrink-0" />}
    {children}
  </button>
);

/** O "R$" na frente de um campo de valor. */
export const PrefixoReais: React.FC = () => (
  <span className="text-[16px] font-semibold text-ink-soft shrink-0">R$</span>
);
