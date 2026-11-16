import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { Procedure } from '../../types';
import { CampoComLista } from './CampoComLista';
import { OpcaoDaLista } from './JanelaDeEscolha';

interface ProcedureSearchSelectProps {
  procedures: Procedure[];
  procedureId?: string;
  nome: string;
  onSelect: (escolha: { procedureId?: string; procedimentoNome: string }) => void;
  erro?: string;
  /** Mais de um campo na mesma tela (os procedimentos de uma visita) pede ids distintos. */
  id?: string;
  rotulo?: string;
  /**
   * Presente = o campo pode sair da tela (um procedimento a mais da visita): o X da direita remove
   * o campo inteiro em vez de só limpar o texto, e aparece mesmo com o campo vazio.
   */
  onRemover?: () => void;
  /** O campo acabou de ser acrescentado: a janela de escolha já abre. */
  autoFocus?: boolean;
}

/**
 * O procedimento escolhido do catálogo, aceitando também o que não está nele.
 *
 * É o `PatientSearchSelect` aplicado a procedimentos, e não o `ProcedureSearchAdd` do orçamento:
 * aquele só devolve item do catálogo, e aqui um atendimento de "avaliação" ou "retorno" — coisas
 * que nunca serão procedimento com preço — precisa poder ser registrado.
 *
 * Escolher da lista guarda o `procedureId`; usar o digitado guarda só o nome. Essa diferença é o
 * que o vínculo automático de plano usa para decidir se dois atendimentos são o mesmo
 * tratamento (ver `mesmoProcedimento` em `utils/attendances.ts`).
 *
 * A lista abre na janela de escolha, no meio da tela (ver `CampoComLista`).
 */
export const ProcedureSearchSelect: React.FC<ProcedureSearchSelectProps> = ({
  procedures,
  procedureId,
  nome,
  onSelect,
  erro,
  id = 'atendimento-procedimento',
  rotulo = 'Procedimento',
  onRemover,
  autoFocus,
}) => {
  const opcoes = useMemo<OpcaoDaLista[]>(
    () => procedures.map((p) => ({ valor: p.id, rotulo: p.title, grupo: p.category || 'Sem categoria' })),
    [procedures]
  );

  const selecionado = procedureId ? procedures.find((p) => p.id === procedureId) : undefined;

  return (
    <CampoComLista
      id={id}
      rotulo={rotulo}
      texto={nome}
      placeholder="Buscar no catálogo ou digitar"
      opcoes={opcoes}
      valor={selecionado?.id}
      onEscolher={(o) => onSelect({ procedureId: o.valor, procedimentoNome: o.rotulo })}
      textoLivre={{
        rotulo: (t) => `Registrar “${t}” como digitado`,
        detalhe: 'Fora do catálogo',
        onUsar: (t) => onSelect({ procedureId: undefined, procedimentoNome: t }),
      }}
      onLimpar={() => onSelect({ procedureId: undefined, procedimentoNome: '' })}
      rotuloDoLimpar="Limpar procedimento"
      onRemover={onRemover}
      rotuloDoRemover={`Remover ${nome.trim() || 'este procedimento'}`}
      erro={erro}
      abertaAoMontar={autoFocus}
      placeholderDaBusca="Buscar no catálogo ou digitar"
      vazio="Nada no catálogo com esse nome — pode registrar como está."
    >
      {selecionado ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-ok" />
          {selecionado.category}
        </p>
      ) : nome.trim() ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft">Fora do catálogo — registrado como digitado</p>
      ) : null}
    </CampoComLista>
  );
};
