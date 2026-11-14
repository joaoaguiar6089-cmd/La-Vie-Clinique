import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { ClinicProfile, Patient, Procedure, Quote, QuoteDraft } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  itemEhProduto,
  itemQuantidade,
  itemSessoes,
  itemValorFinal,
  NOME_FORMA_PAGAMENTO,
} from '../../utils/quoteCalc';
import { SidePanel } from '../common/SidePanel';
import { AvisoTinta } from '../common/Tinta';
import { CustoEmEdicao, quantidadeDoProduto } from '../../utils/estoque';
import { useOrcamentoEmEdicao } from './useOrcamentoEmEdicao';
import {
  FormasDePagamentoDoOrcamento,
  ListaDeItensDoOrcamento,
  ModaisDoOrcamento,
  NotasDoPagamento,
  SecaoDadosDoOrcamento,
  TotaisDoOrcamento,
} from './SecoesDoOrcamento';
import { TituloDeSecao } from './PecasDoOrcamento';

interface QuoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * `custo` só vem quando há custo de material para gravar (ou para apagar): quem salva o
   * orçamento grava o custo depois, com o id que o orçamento ganhou. Ver `useAcoesDeOrcamento`.
   */
  onSave: (draft: QuoteDraft, existing?: Quote, custo?: CustoEmEdicao) => void | Promise<void>;
  quoteToEdit?: Quote | null;
  /** Itens iniciais ao duplicar ou substituir um orçamento — o número é novo, o conteúdo vem pronto. */
  seedFrom?: Quote | null;
  /**
   * Paciente já escolhido ao abrir um orçamento em branco — é assim que a página do paciente
   * chama o formulário. Ignorado quando há `quoteToEdit` ou `seedFrom`, que trazem o próprio.
   */
  initialPatient?: Patient | null;
  procedures: Procedure[];
  patients: Patient[];
  clinic: ClinicProfile;
}

/** As quatro etapas do orçamento — a ordem em que a conversa com a paciente acontece. */
type Etapa = 1 | 2 | 3 | 4;

const ETAPAS: { numero: Etapa; rotulo: string }[] = [
  { numero: 1, rotulo: 'Paciente' },
  { numero: 2, rotulo: 'Procedimentos' },
  { numero: 3, rotulo: 'Pagamento' },
  { numero: 4, rotulo: 'Revisar' },
];

/**
 * O orçamento sozinho, em quatro etapas. O estado e a conta moram em `useOrcamentoEmEdicao`, e
 * as partes da tela em `SecoesDoOrcamento` — a ficha de avaliação monta o mesmo orçamento dentro
 * dela.
 *
 * No computador abre como os relatórios: uma janela no meio da tela, com as etapas em abas presas
 * no topo e cada etapa em colunas — os procedimentos ao lado do desconto e do total, as formas de
 * pagamento ao lado das notas, a paciente ao lado da mensagem. No celular, a tela cheia de sempre,
 * com as etapas no cabeçalho preto.
 */
export const QuoteFormModal: React.FC<QuoteFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  quoteToEdit,
  seedFrom,
  initialPatient,
  procedures,
  patients,
  clinic,
}) => {
  const orc = useOrcamentoEmEdicao({
    aberto: isOpen,
    quoteToEdit,
    seedFrom,
    initialPatient,
    procedures,
    clinic,
  });
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** A etapa aberta: 1 paciente, 2 procedimentos, 3 pagamento, 4 revisar. */
  const [etapa, setEtapa] = useState<Etapa>(1);

  const base = quoteToEdit || seedFrom || null;

  useEffect(() => {
    if (!isOpen) return;
    setErroAoSalvar(null);
    setIsSaving(false);
    // Com a paciente já conhecida (editar, duplicar, vir da página dela), a primeira pergunta já
    // está respondida — o formulário abre nos procedimentos.
    setEtapa(base || initialPatient ? 2 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, quoteToEdit?.id, seedFrom?.id, initialPatient?.id]);

  if (!isOpen) return null;

  const { itens, totais, pacienteNome, dataValidade } = orc;

  const handleSubmit = async () => {
    const novosErros = orc.validar();
    if (Object.keys(novosErros).length > 0) {
      // Volta para a etapa do primeiro problema — o aviso mora lá, junto do campo.
      setEtapa(novosErros.paciente || novosErros.validade || novosErros.avaliacao ? 1 : 2);
      return;
    }

    const { draft, custo } = orc.montar();
    try {
      setIsSaving(true);
      await onSave(draft, quoteToEdit || undefined, custo);
      onClose();
    } catch (e) {
      setIsSaving(false);
      // Mostra o motivo real: sem isso, um erro de permissão do Firestore vira
      // "tente de novo" e a pessoa fica repetindo uma ação que nunca vai funcionar
      setErroAoSalvar(`Não foi possível salvar: ${(e as Error).message}`);
    }
  };

  const tituloModal = quoteToEdit
    ? `Editar orçamento ${quoteToEdit.numero}`
    : seedFrom
      ? `Novo a partir de ${seedFrom.numero}`
      : 'Novo orçamento';

  const proximaEtapa = ETAPAS.find((e) => e.numero === etapa + 1);

  /* As etapas no cabeçalho preto do celular. Tocáveis: nada obriga a seguir a ordem, e voltar
     para mudar a paciente depois de montar os procedimentos não perde nada. */
  const cabecalho = (
    <nav aria-label="Etapas do orçamento" className="-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ol className="flex gap-4 px-1 w-max">
        {ETAPAS.map((e) => {
          const ativa = e.numero === etapa;
          return (
            <li key={e.numero}>
              <button
                type="button"
                onClick={() => setEtapa(e.numero)}
                aria-current={ativa ? 'step' : undefined}
                className={`pb-1.5 border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  ativa
                    ? 'text-white border-brand-light'
                    : 'text-cream/60 border-transparent hover:text-cream'
                }`}
              >
                {e.numero} {e.rotulo}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  /* No computador, as mesmas etapas viram as abas presas sob o título — como as páginas dos
     relatórios. */
  const navegacao = (
    <nav
      aria-label="Etapas do orçamento"
      className="hidden sm:block px-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ol className="flex gap-8 w-max">
        {ETAPAS.map((e) => {
          const ativa = e.numero === etapa;
          return (
            <li key={e.numero}>
              <button
                type="button"
                onClick={() => setEtapa(e.numero)}
                aria-current={ativa ? 'step' : undefined}
                className={`pt-1 pb-3 border-b-2 text-[15px] font-semibold whitespace-nowrap transition-colors ${
                  ativa ? 'text-white border-brand-light' : 'text-cream/60 border-transparent hover:text-cream'
                }`}
              >
                <span className={`mr-1 tabular-nums ${ativa ? 'text-brand-light' : ''}`}>{e.numero}</span>
                {e.rotulo}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  const etapaAnterior = ETAPAS.find((e) => e.numero === etapa - 1);

  /* A barra preta de baixo: o total, que se atualiza enquanto se monta, e o próximo passo. */
  const rodape = (
    <div className="flex items-center gap-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-cream/75 truncate">
          Total · {itens.length} {itens.length === 1 ? 'procedimento' : 'procedimentos'}
        </p>
        <p className="text-[22px] font-bold text-white tabular-nums leading-tight truncate">
          {formatBRL(totais.total)}
        </p>
      </div>
      {/* Os dois botões têm `key` próprio e nenhum é `submit`. Com o mesmo elemento nos dois
          ramos, o clique em "Revisar" trocava a etapa, o React re-renderizava no meio do clique, e
          o navegador terminava o clique num botão que já era o de salvar — o orçamento era gravado
          sem ninguém ter revisado. */}
      {/* No computador, o voltar fica também aqui embaixo, ao lado do seguir. */}
      {etapaAnterior && (
        <button
          key="anterior"
          type="button"
          onClick={() => setEtapa(etapaAnterior.numero)}
          className="hidden sm:flex shrink-0 h-[52px] px-5 rounded-full border border-cream/25 text-cream text-[15px] font-semibold items-center gap-2 hover:border-cream/50 transition-colors"
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
          {etapaAnterior.rotulo}
        </button>
      )}
      {etapa < 4 && proximaEtapa ? (
        <button
          key="proxima"
          type="button"
          onClick={() => setEtapa(proximaEtapa.numero)}
          className="shrink-0 h-[52px] px-[22px] rounded-full bg-brand-light text-ink text-[16px] font-bold flex items-center gap-2 hover:brightness-105 active:scale-[.97] transition"
        >
          {proximaEtapa.rotulo}
          <ArrowRight className="w-[18px] h-[18px]" />
        </button>
      ) : (
        <button
          key="salvar"
          type="button"
          onClick={() => handleSubmit()}
          disabled={isSaving}
          className="shrink-0 h-[52px] px-[22px] rounded-full bg-brand-light text-ink text-[16px] font-bold flex items-center gap-2 hover:brightness-105 active:scale-[.97] transition disabled:opacity-50"
        >
          {isSaving ? 'Salvando…' : quoteToEdit ? 'Salvar alterações' : 'Salvar orçamento'}
        </button>
      )}
    </div>
  );

  const principal = totais.opcoesPagamento[0];
  const opcaoPrincipal = orc.opcoesPagamento[0];

  return (
    <SidePanel
      aberto={isOpen}
      onFechar={onClose}
      titulo={tituloModal}
      sobretitulo={pacienteNome.trim() || 'Orçamento'}
      cabecalho={cabecalho}
      navegacao={navegacao}
      formato="central"
      largura="tela"
      cabecalhoSoNoCelular
      onVoltar={etapa > 1 ? () => setEtapa((etapa - 1) as Etapa) : undefined}
      etapa={etapa}
      bloqueado={isSaving}
      /* Adicionar ou remover um procedimento não passa por `input`/`change`, então o painel
         não enxergaria a alteração sozinho. */
      alterado={itens.length > 0 && !quoteToEdit}
      rodape={rodape}
      rodapeTom="escuro"
    >
      <form
        id="form-orcamento"
        /* Enter num campo leva para a etapa seguinte; salvar é só na última, pelo botão. */
        onSubmit={(e) => {
          e.preventDefault();
          if (etapa < 4) setEtapa((etapa + 1) as Etapa);
          else handleSubmit();
        }}
        className="px-5 sm:px-10 py-5 sm:py-8"
      >
        <div className="max-w-[1180px] mx-auto space-y-6">
          {erroAoSalvar && (
            <AvisoTinta tom="erro" icone={AlertCircle}>
              {erroAoSalvar}
            </AvisoTinta>
          )}

          {/* ETAPA 1 — A PACIENTE: os dados à esquerda, a mensagem de abertura à direita. */}
          {etapa === 1 && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12 lg:items-start">
              <SecaoDadosDoOrcamento
                orc={orc}
                patients={patients}
                titulo={
                  <TituloDeSecao
                    titulo="Paciente"
                    descricao={
                      quoteToEdit
                        ? undefined
                        : 'O número do orçamento é gerado ao salvar — abrir e desistir não gasta numeração.'
                    }
                  />
                }
              />
            </div>
          )}

          {/* ETAPA 2 — OS PROCEDIMENTOS: a lista na coluna larga; desconto, total e custo ao lado. */}
          {etapa === 2 && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:items-start">
              <ListaDeItensDoOrcamento orc={orc} procedures={procedures} />
              {/* Presa enquanto a lista rola: o desconto e o total ficam à vista ao lado de qualquer
                  item. Mais alta que a tela (o custo de material aberto), o fim dela aparece no fim
                  da rolagem. */}
              <div className="space-y-6 lg:sticky lg:top-6">
                <TotaisDoOrcamento orc={orc} clinic={clinic} />
              </div>
            </div>
          )}

          {/* ETAPA 3 — O PAGAMENTO: as formas à esquerda, a negociação e as observações à direita. */}
          {etapa === 3 && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-10 lg:items-start">
              <FormasDePagamentoDoOrcamento orc={orc} />
              <NotasDoPagamento orc={orc} />
            </div>
          )}

          {/* ETAPA 4 — REVISAR: o que vai sair, antes de salvar. */}
          {etapa === 4 && (
            <div className="max-w-[720px] mx-auto space-y-4">
              <TituloDeSecao titulo="Revisar" descricao="O que vai sair no orçamento. Confira antes de salvar." />
              <div className="rounded-[20px] bg-card border border-ink/10 p-4 sm:p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setEtapa(1)} className="min-w-0 text-left group">
                    <span className="block text-[12px] font-semibold text-ink-soft">Para</span>
                    <span className="block text-[17px] font-bold text-ink truncate group-hover:underline underline-offset-2">
                      {pacienteNome.trim() || 'Falta escolher a paciente'}
                    </span>
                  </button>
                  <div className="text-right shrink-0">
                    <span className="block text-[12px] font-semibold text-ink-soft">Válido até</span>
                    <span className="block text-[15px] font-bold text-ink tabular-nums">
                      {dataValidade ? new Date(dataValidade).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                </div>

                <ul className="border-t border-ink/8 divide-y divide-ink/8">
                  {itens.length === 0 ? (
                    <li className="py-3 text-[14px] text-ink-soft">
                      Nenhum procedimento ainda.{' '}
                      <button type="button" onClick={() => setEtapa(2)} className="font-semibold text-ink underline underline-offset-2">
                        Adicionar
                      </button>
                    </li>
                  ) : (
                    itens.map((item) => (
                      <li key={item.id} className="py-2.5 flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-ink">{item.titulo || 'Sem título'}</span>
                          <span className="block text-[13px] text-ink-soft truncate">
                            {itemEhProduto(item)
                              ? `Produto · ${quantidadeDoProduto(itemQuantidade(item), item.unidade || 'un')}`
                              : [
                                  item.profissionalNome,
                                  itemSessoes(item) > 1 ? `${itemSessoes(item)} sessões` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'Sem profissional'}
                          </span>
                        </span>
                        <span className="shrink-0 text-[15px] font-bold text-ink tabular-nums">
                          {formatBRL(itemValorFinal(item))}
                        </span>
                      </li>
                    ))
                  )}
                </ul>

                <div className="border-t border-ink/8 pt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-[12px] font-semibold text-ink-soft">Investimento</span>
                    {opcaoPrincipal && principal && (
                      <span className="block text-[13px] text-ink-soft">
                        {NOME_FORMA_PAGAMENTO[opcaoPrincipal.forma]}
                        {principal.parcela ? ` · ${principal.parcelas}× de ${formatBRL(principal.parcela)}` : ''}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[22px] font-bold text-ink tabular-nums">
                    {formatBRL(principal ? principal.valorFinal : totais.total)}
                  </span>
                </div>
              </div>

              <p className="text-[14px] text-ink-soft px-1">
                Toque numa etapa lá em cima para corrigir qualquer coisa — nada do que já foi preenchido
                se perde.
              </p>
            </div>
          )}
        </div>
      </form>

      {/* Fora do <form>: um clique no mapa não pode disparar o submit do orçamento. */}
      <ModaisDoOrcamento orc={orc} procedures={procedures} clinic={clinic} />
    </SidePanel>
  );
};
