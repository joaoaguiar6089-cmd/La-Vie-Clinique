import React, { useEffect, useRef, useState } from 'react';
import { Info, Loader2, Receipt } from 'lucide-react';
import {
  ClinicProfile,
  EvaluationRecord,
  MaterialUsado,
  Patient,
  Procedure,
  Quote,
  QuoteItem,
} from '../../types';
import { AlvoDaFicha } from '../../utils/fichasClinicas';
import { procedimentoDoAtendimento } from '../../utils/evaluations';
import { linhasParaGravar } from '../../utils/estoque';
import { formatBRL } from '../../utils/formatters';
import { isQuoteEditavel, resolveQuoteStatus } from '../../utils/quoteCalc';
import { getQuoteById } from '../../services/databaseService';
import { salvarOrcamentoComCusto } from '../../services/quoteWorkflow';
import { useOrcamentoEmEdicao } from '../quotes/useOrcamentoEmEdicao';
import {
  ModaisDoOrcamento,
  SecaoDadosDoOrcamento,
  SecaoItensDoOrcamento,
  SecaoPagamentoDoOrcamento,
} from '../quotes/SecoesDoOrcamento';
import { QUOTE_STATUS_LABEL } from '../quotes/QuoteDesfecho';

/** O que a avaliação grava depois que o orçamento dela foi salvo. */
export interface OrcamentoGravado {
  orcamentoId?: string;
  consumoEstimado: MaterialUsado[];
  /** Falha que não impediu salvar, mas precisa ser dita — o custo de material ficou para trás. */
  aviso?: string;
}

/**
 * O consumo estimado e o orçamento da avaliação — uma coisa só.
 *
 * Marcar "Consumo estimado de produto" abre, dentro da ficha, o mesmo orçamento do formulário de
 * orçamento: o procedimento avaliado já calculado pelo consumo padrão, e tudo o que se faz lá —
 * mudar quantidades e valores, outros itens, desconto, pagamento. Salvar a avaliação salva o
 * orçamento (com número, na lista de Orçamentos) e guarda o elo em `EvaluationRecord.orcamentoId`:
 * reabrir a avaliação edita o mesmo orçamento, enquanto ele for rascunho.
 *
 * Avaliação de antes do elo, com consumo gravado e sem orçamento ligado: o orçamento dela pode ter
 * sido feito pelo caminho antigo, então criar um novo ao salvar fica a critério da profissional.
 *
 * `ativo` falso (o acompanhamento, ou o formulário fechado) não assina nada.
 */
export const useOrcamentoDaAvaliacao = ({
  alvo,
  paciente,
  catalogo,
  clinic,
  ativo,
  registro,
}: {
  alvo: AlvoDaFicha;
  paciente?: Patient;
  catalogo: Procedure[];
  clinic: ClinicProfile;
  ativo: boolean;
  /** O registro lido do banco; `undefined` enquanto a leitura não voltou. */
  registro: EvaluationRecord | null | undefined;
}) => {
  const [estimou, setEstimou] = useState(false);
  /** O orçamento ligado, ainda rascunho — é ele que o formulário edita. */
  const [ligado, setLigado] = useState<Quote | null>(null);
  /** O orçamento ligado que já saiu (enviado, pago…) — só aparece, não muda por aqui. */
  const [travado, setTravado] = useState<Quote | null>(null);
  const [carregandoLigado, setCarregandoLigado] = useState(false);
  /** A lista já foi montada — do orçamento ligado, do consumo gravado ou do consumo padrão. */
  const [semeado, setSemeado] = useState(false);
  /** Avaliação com consumo e sem orçamento ligado (de antes do elo, ou o ligado foi excluído). */
  const [semElo, setSemElo] = useState(false);
  /** Salvar cria/atualiza o orçamento. Desligado só no caso `semElo`, até a profissional marcar. */
  const [gerar, setGerar] = useState(true);
  const [mexido, setMexido] = useState(false);
  /**
   * O orçamento já gravado nesta abertura. Se a ficha falhar depois dele, salvar de novo atualiza
   * este — e não cria um segundo número.
   */
  const gravadoAgora = useRef<Quote | null>(null);

  const orc = useOrcamentoEmEdicao({
    aberto: ativo,
    quoteToEdit: ligado,
    daAvaliacao: true,
    procedures: catalogo,
    clinic,
  });

  const carregado = registro !== undefined;

  // Cada abertura recomeça do registro — sobras da ficha anterior não podem virar a desta. Só na
  // chegada da leitura: o `setRegistro` de depois de salvar não pode recarregar o orçamento.
  useEffect(() => {
    if (!ativo || !carregado) return;
    let cancelado = false;
    const consumo = registro?.consumoEstimado || [];
    const orcamentoId = registro?.orcamentoId;

    setEstimou(consumo.length > 0 || !!orcamentoId);
    setLigado(null);
    setTravado(null);
    setSemeado(false);
    setSemElo(!orcamentoId && consumo.length > 0);
    setGerar(!(!orcamentoId && consumo.length > 0));
    setMexido(false);
    gravadoAgora.current = null;

    if (orcamentoId) {
      setCarregandoLigado(true);
      getQuoteById(orcamentoId)
        .then((quote) => {
          if (cancelado) return;
          if (!quote) {
            // Excluído em Orçamentos: a avaliação volta a ter só o consumo.
            setSemElo(true);
            setGerar(false);
          } else if (isQuoteEditavel(quote)) {
            setLigado(quote);
            setSemeado(true);
          } else {
            setTravado(quote);
            setSemeado(true);
          }
        })
        .catch((e) => {
          console.warn('Não foi possível ler o orçamento da avaliação:', e);
          if (cancelado) return;
          // Sem conseguir ler, não há como editar sem arriscar um segundo orçamento.
          setSemElo(true);
          setGerar(false);
        })
        .finally(() => {
          if (!cancelado) setCarregandoLigado(false);
        });
    } else {
      setCarregandoLigado(false);
    }

    return () => {
      cancelado = true;
    };
    // Só a identidade da ficha e a chegada da leitura: o alvo é recriado a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, alvo.registroId, carregado]);

  // Marcado sem lista: o procedimento avaliado, calculado pelo consumo — o gravado, ou o padrão
  // assim que o estoque chegar. Se o estoque não carregar, monta sem ele em vez de girar.
  useEffect(() => {
    if (!ativo || !carregado || !estimou || semeado || carregandoLigado) return;
    if (ligado || travado || !orc.estoquePronto) return;
    const consumoGravado = registro?.consumoEstimado || [];
    orc.semearDaAvaliacao(
      {
        pacienteId: alvo.pacienteId,
        pacienteNome: paciente?.nome || alvo.pacienteNome,
        pacienteContato: paciente?.contato,
        procedureId: alvo.procedureId,
        procedimentoNome: alvo.procedimentoNome,
        data: alvo.data,
        professionalId: alvo.professionalId,
      },
      consumoGravado.length > 0 ? consumoGravado : undefined
    );
    setSemeado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, carregado, estimou, semeado, carregandoLigado, ligado, travado, orc.estoquePronto]);

  /** O item do procedimento avaliado — as linhas de consumo dele são o consumo estimado. */
  const itemDaAvaliacao = (): QuoteItem | undefined => {
    const procedimento = procedimentoDoAtendimento(alvo, catalogo);
    const procedureId = procedimento?.id || alvo.procedureId;
    const doProcedimento = (i: QuoteItem) =>
      procedureId
        ? i.procedureId === procedureId
        : i.titulo.trim() === alvo.procedimentoNome.trim();
    return (
      orc.itens.find((i) => i.calculadoPorConsumo && doProcedimento(i)) ||
      orc.itens.find(doProcedimento) ||
      orc.itens.find((i) => i.calculadoPorConsumo)
    );
  };

  const montando = estimou && !travado && (carregandoLigado || !semeado);

  /** O que impede salvar, numa frase — `null` = pode salvar. Roda antes de gravar qualquer coisa. */
  const validar = (): string | null => {
    if (!ativo || !estimou || travado) return null;
    if (montando) return 'O orçamento ainda está carregando. Espere um instante e salve de novo.';
    if (!gerar) return null;
    const erros = orc.validar();
    const motivos = Object.values(erros);
    return motivos.length > 0 ? `Confira o orçamento: ${motivos.join('; ')}.` : null;
  };

  /** Grava o orçamento (quando é o caso) e devolve o que a ficha guarda dele. */
  const gravar = async (): Promise<OrcamentoGravado> => {
    if (!estimou) return { consumoEstimado: [] };
    if (travado) return { orcamentoId: travado.id, consumoEstimado: registro?.consumoEstimado || [] };

    const item = itemDaAvaliacao();
    const consumoEstimado = linhasParaGravar((item && orc.custos[item.id]) || []);
    if (!gerar) return { consumoEstimado };

    let existente = gravadoAgora.current || undefined;
    if (!existente && ligado) {
      // Pode ter sido enviado enquanto a avaliação estava aberta — e enviado não se edita.
      const atual = await getQuoteById(ligado.id);
      if (atual && !isQuoteEditavel(atual)) {
        throw new Error(
          `o orçamento ${atual.numero} foi enviado à paciente enquanto esta avaliação estava aberta. ` +
            'Feche e abra de novo — para mudar o orçamento, substitua-o pela tela de Orçamentos.'
        );
      }
      existente = atual || undefined;
    }

    const { draft, custo } = orc.montar();
    const { salvo, erroDoCusto } = await salvarOrcamentoComCusto(draft, { existente }, custo);
    gravadoAgora.current = salvo;
    return { orcamentoId: salvo.id, consumoEstimado, aviso: erroDoCusto };
  };

  return {
    ativo,
    orc,
    estimou,
    alternar: (marcado: boolean) => {
      setEstimou(marcado);
      setMexido(true);
    },
    montando,
    ligado,
    travado,
    semElo,
    gerar,
    setGerar: (valor: boolean) => {
      setGerar(valor);
      setMexido(true);
    },
    nomeDoProcedimento: procedimentoDoAtendimento(alvo, catalogo)?.title || alvo.procedimentoNome,
    /** Marcar, desmarcar ou mexer em botões — o painel só percebe digitação, não clique. */
    mexido: mexido || (estimou && !ligado && !travado && orc.itens.length > 0),
    validar,
    gravar,
  };
};

export type OrcamentoDaAvaliacao = ReturnType<typeof useOrcamentoDaAvaliacao>;

const subtitulo = 'text-label font-semibold uppercase tracking-wider text-gray-400';

/** O checkbox "Consumo estimado de produto" e, marcado, o orçamento inteiro, dentro da ficha. */
export const SecaoOrcamentoDaAvaliacao: React.FC<{
  oa: OrcamentoDaAvaliacao;
  catalogo: Procedure[];
  clinic: ClinicProfile;
}> = ({ oa, catalogo, clinic }) => {
  if (!oa.ativo) return null;
  const { orc } = oa;
  const orcamentoExistente = oa.ligado || oa.travado;

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-line bg-surface cursor-pointer">
        <input
          type="checkbox"
          checked={oa.estimou}
          onChange={(e) => oa.alternar(e.target.checked)}
          className="w-4 h-4 accent-brand mt-0.5"
        />
        <span className="text-body text-ink">
          <span className="font-semibold">Consumo estimado de produto e orçamento</span>
          <span className="block text-muted">
            Marque para estimar os produtos e as quantidades que {oa.nomeDoProcedimento} vai usar e
            montar o orçamento junto — valores, desconto e pagamento. Salvar a avaliação salva o
            orçamento, que aparece em Orçamentos.
          </span>
        </span>
      </label>

      {!oa.estimou && orcamentoExistente && (
        <p className="flex items-start gap-2 text-body text-ink-soft bg-surface border border-line rounded-xl px-3 py-2.5">
          <Info className="w-4 h-4 shrink-0 mt-px text-brand" />
          <span>
            O orçamento {orcamentoExistente.numero} continua salvo em Orçamentos — ao salvar, esta
            avaliação só deixa de estar ligada a ele.
          </span>
        </p>
      )}

      {oa.estimou && oa.montando && (
        <div className="flex items-center justify-center py-6 text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {oa.estimou && oa.travado && (
        <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
          <p className="flex items-center gap-2 text-body-lg font-semibold text-ink">
            <Receipt className="w-4 h-4 text-brand" />
            Orçamento {oa.travado.numero} · {QUOTE_STATUS_LABEL[resolveQuoteStatus(oa.travado)]}
            <span className="ml-auto tabular-nums">{formatBRL(oa.travado.total)}</span>
          </p>
          <p className="text-body text-muted">
            Já saiu do rascunho, então não muda mais por aqui. Para ajustar, substitua-o pela tela
            de Orçamentos — o consumo desta avaliação fica como está.
          </p>
        </div>
      )}

      {oa.estimou && !oa.montando && !oa.travado && (
        <>
          {orc.avisoDoEstoque && <p className="text-body text-danger">{orc.avisoDoEstoque}</p>}

          {oa.ligado ? (
            <p className="flex items-start gap-2 text-body text-ink-soft bg-surface border border-line rounded-xl px-3 py-2.5">
              <Receipt className="w-4 h-4 shrink-0 mt-px text-brand" />
              <span>
                Orçamento {oa.ligado.numero} (rascunho) — o que mudar aqui atualiza o mesmo orçamento
                ao salvar.
              </span>
            </p>
          ) : oa.semElo ? (
            <label className="flex items-start gap-2.5 text-body text-ink-soft bg-surface border border-line rounded-xl px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={oa.gerar}
                onChange={(e) => oa.setGerar(e.target.checked)}
                className="w-4 h-4 accent-brand mt-0.5"
              />
              <span>
                <span className="font-semibold text-ink">Criar o orçamento ao salvar</span>
                <span className="block">
                  Esta avaliação não tem orçamento ligado. Se já foi feito um a partir dela, deixe
                  desmarcado para não duplicar — o consumo é salvo do mesmo jeito.
                </span>
              </span>
            </label>
          ) : (
            <p className="flex items-start gap-2 text-body text-ink-soft bg-surface border border-line rounded-xl px-3 py-2.5">
              <Info className="w-4 h-4 shrink-0 mt-px text-brand" />
              <span>
                {orc.itens.some((i) => i.calculadoPorConsumo && (orc.custos[i.id] || []).length > 0)
                  ? `Preenchido com o consumo padrão de ${oa.nomeDoProcedimento}. Ajuste ao caso desta paciente — o orçamento é criado ao salvar a avaliação.`
                  : 'Adicione os produtos e as quantidades estimadas para esta paciente — o orçamento é criado ao salvar a avaliação.'}
              </span>
            </p>
          )}

          <SecaoItensDoOrcamento orc={orc} procedures={catalogo} clinic={clinic} />

          <SecaoPagamentoDoOrcamento orc={orc} />

          <div className="space-y-3.5">
            <h3 className={subtitulo}>Dados do orçamento</h3>
            <SecaoDadosDoOrcamento orc={orc} idBase="avaliacao-orcamento" />
          </div>

          <ModaisDoOrcamento orc={orc} procedures={catalogo} clinic={clinic} />
        </>
      )}
    </div>
  );
};
