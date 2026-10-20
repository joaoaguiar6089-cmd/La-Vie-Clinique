import React from 'react';
import { AreaDoProcedimento } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { precoDaArea } from '../../utils/laserAreas';

/**
 * As áreas de um procedimento vendido por área, com o valor de cada uma — a tabela de preços que
 * o card de um procedimento só mostraria como "a partir de".
 *
 * Mesmo componente no detalhe do catálogo, no cartão e no catálogo em PDF, para "Axilas R$ 90"
 * ler igual nos três. Os dois últimos saem do DOM pelo html2canvas, por isso nada aqui depende de
 * interação.
 */
export const ListaDeAreasEValores: React.FC<{
  areas: AreaDoProcedimento[];
  /** Sem preço: o catálogo pode ser gerado com os valores ocultos. */
  mostrarPrecos?: boolean;
  /** Quantas cabem; o resto vira "+N áreas". O catálogo em PDF tem altura fixa por card. */
  limite?: number;
  compacto?: boolean;
}> = ({ areas, mostrarPrecos = true, limite, compacto = false }) => {
  if (areas.length === 0) return null;
  const visiveis = limite ? areas.slice(0, limite) : areas;
  const restantes = areas.length - visiveis.length;
  const texto = compacto ? 'text-[10.5px]' : 'text-[13px]';

  return (
    <div className={`grid grid-cols-2 ${compacto ? 'gap-x-4 gap-y-0.5' : 'gap-x-5 gap-y-1'}`}>
      {visiveis.map((area) => (
        <div
          key={area.id}
          className={`flex items-baseline justify-between gap-2 ${texto} leading-snug border-b border-dotted border-[rgba(26,26,26,.15)] pb-0.5`}
        >
          <span className="text-ink-soft truncate">{area.nome}</span>
          {mostrarPrecos && (
            <span className="text-ink font-semibold tabular-nums shrink-0">
              {formatBRL(precoDaArea(area))}
            </span>
          )}
        </div>
      ))}
      {restantes > 0 && (
        <span className={`${texto} text-muted col-span-2`}>
          + {restantes} {restantes === 1 ? 'área' : 'áreas'}
        </span>
      )}
    </div>
  );
};
