import React from 'react';
import { Procedure } from '../../types';
import { ehAvaliacao, focosDoProcedimento, mesmoFoco } from '../../utils/procedimentoAvaliacao';
import { PilulasDeEscolha } from './Tinta';

interface EscolhaDoFocoProps {
  /** O procedimento escolhido — é dele que vêm os focos. */
  procedimento?: Procedure;
  valor?: string;
  onMudar: (foco: string | undefined) => void;
  /** "Foco / Aplicação", ou "Avaliação para" na Avaliação. */
  rotulo?: string;
  className?: string;
}

/**
 * A escolha do "Foco / Aplicação" de um procedimento — no agendamento, no orçamento e no
 * relatório. Pílulas com os focos cadastrados no procedimento; tocar na acesa desmarca.
 *
 * Some quando o procedimento não tem foco nenhum. Um foco gravado que saiu do cadastro continua
 * aparecendo (aceso), para não sumir da tela sem ninguém ter tirado.
 */
export const EscolhaDoFoco: React.FC<EscolhaDoFocoProps> = ({
  procedimento,
  valor,
  onMudar,
  rotulo,
  className = '',
}) => {
  const cadastrados = focosDoProcedimento(procedimento);
  const opcoes =
    valor && !cadastrados.some((f) => mesmoFoco(f, valor)) ? [...cadastrados, valor] : cadastrados;
  if (opcoes.length === 0) return null;

  const ativo = opcoes.find((f) => mesmoFoco(f, valor)) || '';
  const titulo = rotulo || (ehAvaliacao(procedimento) ? 'Avaliação para' : 'Foco / Aplicação');

  return (
    <div className={className}>
      <p className="text-[13px] font-semibold text-ink mb-1.5">{titulo}</p>
      <PilulasDeEscolha
        rotulo={titulo}
        compacta
        permiteDesmarcar
        opcoes={opcoes.map((f) => ({ id: f, rotulo: f }))}
        valor={ativo}
        onMudar={(f) => onMudar(f || undefined)}
      />
    </div>
  );
};
