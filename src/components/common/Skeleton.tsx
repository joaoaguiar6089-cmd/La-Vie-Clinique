import React from 'react';

/**
 * Blocos bege no lugar da lista, enquanto a primeira resposta do Firestore não chega.
 *
 * O que havia antes era pior de duas formas: a tela ficava vazia (ou com um
 * "Carregando pacientes...") e, quando os dados chegavam, a lista aparecia de uma vez e
 * empurrava tudo para baixo. O skeleton ocupa desde já mais ou menos o espaço que a lista
 * vai ocupar, então o conteúdo entra no lugar em que a pessoa já estava olhando.
 *
 * A pulsação mora no CSS (`.animate-pulso-skeleton`) e some sozinha quando o sistema pede
 * movimento reduzido — ver a regra `prefers-reduced-motion` no index.css. O bloco parado
 * continua dizendo o que precisa dizer.
 */
interface SkeletonProps {
  /** Classes de tamanho e forma. O padrão é uma linha de texto. */
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => (
  <div
    aria-hidden="true"
    className={`bg-line-soft rounded-sm animate-pulso-skeleton ${className}`}
  />
);

/**
 * Uma linha de lista: avatar redondo, nome e uma segunda linha de metadado.
 *
 * As larguras variam de propósito (`larguras`), porque cinco linhas idênticas parecem uma
 * tabela vazia, e não uma lista carregando.
 */
const LARGURAS_DE_NOME = ['w-40', 'w-56', 'w-32', 'w-48', 'w-44', 'w-36'];
const LARGURAS_DE_META = ['w-24', 'w-32', 'w-20', 'w-28', 'w-24', 'w-36'];

interface SkeletonListaProps {
  /** Quantas linhas desenhar. Seis enche uma tela de celular sem passar do fim. */
  linhas?: number;
  /** Linha com avatar redondo à esquerda — o formato da lista de pacientes. */
  comAvatar?: boolean;
  className?: string;
}

export const SkeletonLista: React.FC<SkeletonListaProps> = ({
  linhas = 6,
  comAvatar = true,
  className = '',
}) => (
  <ul className={`space-y-1.5 ${className}`} aria-busy="true" aria-live="polite">
    <li className="sr-only">Carregando…</li>
    {Array.from({ length: linhas }).map((_, i) => (
      <li key={i} className="glass-card rounded-sm flex items-center gap-3 px-4 py-3.5">
        {comAvatar && <Skeleton className="w-9 h-9 rounded-full shrink-0" />}
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className={`h-3.5 ${LARGURAS_DE_NOME[i % LARGURAS_DE_NOME.length]}`} />
          <Skeleton className={`h-3 ${LARGURAS_DE_META[i % LARGURAS_DE_META.length]}`} />
        </div>
        <Skeleton className="w-8 h-8 rounded-sm shrink-0" />
      </li>
    ))}
  </ul>
);

interface SkeletonCardsProps {
  /** Quantos cards. */
  quantidade?: number;
  /** Classes da grade. O padrão acompanha a grade do catálogo. */
  className?: string;
}

/** Grade de cards — o formato do catálogo de procedimentos e do painel de orçamentos. */
export const SkeletonCards: React.FC<SkeletonCardsProps> = ({
  quantidade = 6,
  className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
}) => (
  <div className={className} aria-busy="true" aria-live="polite">
    <span className="sr-only">Carregando…</span>
    {Array.from({ length: quantidade }).map((_, i) => (
      <div key={i} className="glass-card rounded-card overflow-hidden">
        <Skeleton className="h-40 w-full rounded-none" />
        <div className="p-4 space-y-2.5">
          <Skeleton className={`h-4 ${LARGURAS_DE_NOME[i % LARGURAS_DE_NOME.length]}`} />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-5 w-24 mt-1" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * A grade da agenda enquanto os atendimentos não chegam: a coluna de horas à esquerda e
 * alguns blocos soltos, na altura em que cartões de verdade cairiam.
 */
export const SkeletonAgenda: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`glass-card rounded-card p-3 sm:p-4 ${className}`} aria-busy="true">
    <span className="sr-only">Carregando a agenda…</span>
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-3 w-10 shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            {/* Nem toda faixa de horário tem atendimento — duas em cada três, aqui. */}
            {i % 3 !== 2 ? (
              <Skeleton className={`h-12 ${i % 2 === 0 ? 'w-full' : 'w-3/4'} rounded-sm`} />
            ) : (
              <div className="h-12" />
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Linhas simples, sem avatar nem card — para dentro de um card que já existe. */
export const SkeletonLinhas: React.FC<{ linhas?: number; className?: string }> = ({
  linhas = 3,
  className = '',
}) => (
  <div className={`space-y-2.5 ${className}`} aria-busy="true">
    <span className="sr-only">Carregando…</span>
    {Array.from({ length: linhas }).map((_, i) => (
      <Skeleton
        key={i}
        className={`h-3.5 ${LARGURAS_DE_NOME[i % LARGURAS_DE_NOME.length]}`}
      />
    ))}
  </div>
);
