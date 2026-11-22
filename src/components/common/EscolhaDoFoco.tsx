import React from 'react';
import { Procedure } from '../../types';
import { ehAvaliacao, focosDoProcedimento, mesmoFoco, temFoco } from '../../utils/procedimentoAvaliacao';

interface EscolhaDoFocoProps {
  /** O procedimento escolhido — é dele que vêm os focos. */
  procedimento?: Procedure;
  /** Os focos marcados. */
  valores?: string[];
  onMudar: (focos: string[]) => void;
  /** "Foco / Aplicação", ou "Avaliação para" na Avaliação. */
  rotulo?: string;
  className?: string;
}

/**
 * A escolha do "Foco / Aplicação" de um procedimento — no agendamento, no orçamento e no
 * relatório. Pílulas com os focos cadastrados no procedimento; dá para marcar mais de um ("Fase 1"
 * e "Fase 2"), e tocar numa acesa a apaga.
 *
 * Some quando o procedimento não tem foco nenhum. Um foco gravado que saiu do cadastro continua
 * aparecendo (aceso), para não sumir da tela sem ninguém ter tirado.
 */
export const EscolhaDoFoco: React.FC<EscolhaDoFocoProps> = ({
  procedimento,
  valores = [],
  onMudar,
  rotulo,
  className = '',
}) => {
  const cadastrados = focosDoProcedimento(procedimento);
  const opcoes = [...cadastrados, ...valores.filter((v) => !temFoco(cadastrados, v))];
  if (opcoes.length === 0) return null;

  const titulo = rotulo || (ehAvaliacao(procedimento) ? 'Avaliação para' : 'Foco / Aplicação');

  /** Na ordem do cadastro, e na grafia dele — não na ordem em que foram tocados. */
  const alternar = (foco: string) => {
    const marcados = temFoco(valores, foco)
      ? valores.filter((v) => !mesmoFoco(v, foco))
      : [...valores, foco];
    onMudar(opcoes.filter((o) => temFoco(marcados, o)));
  };

  return (
    <div className={className}>
      <p className="text-[13px] font-semibold text-ink mb-1.5">
        {titulo}
        {opcoes.length > 1 && <span className="font-normal text-ink-soft"> · um ou mais</span>}
      </p>
      <div role="group" aria-label={titulo} className="flex flex-wrap gap-2">
        {opcoes.map((f) => {
          const ativo = temFoco(valores, f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={ativo}
              onClick={() => alternar(f)}
              className={`inline-flex items-center gap-2 h-10 px-4 rounded-full text-[14px] font-semibold transition-colors ${
                ativo ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );
};
