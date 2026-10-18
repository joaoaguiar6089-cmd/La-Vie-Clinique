import React, { useEffect, useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
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
  ModaisDoOrcamento,
  SecaoDadosDoOrcamento,
  SecaoItensDoOrcamento,
  SecaoPagamentoDoOrcamento,
} from './SecoesDoOrcamento';

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

  /* As etapas no cabeçalho preto. Tocáveis: nada obriga a seguir a ordem, e voltar para mudar a
     paciente depois de montar os procedimentos não perde nada. */
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
      onVoltar={etapa > 1 ? () => setEtapa((etapa - 1) as Etapa) : undefined}
      etapa={etapa}
      largura="larga"
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
        className="px-5 sm:px-6 py-5 space-y-6"
      >
        {erroAoSalvar && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {erroAoSalvar}
          </AvisoTinta>
        )}

        {/* ETAPA 1 — A PACIENTE */}
        {etapa === 1 && (
          <>
            {!quoteToEdit && (
              <p className="text-[13px] text-ink-soft -mt-1">
                O número é gerado ao salvar — abrir e desistir não gasta numeração.
              </p>
            )}
            <SecaoDadosDoOrcamento orc={orc} patients={patients} />
          </>
        )}

        {/* ETAPA 2 — OS PROCEDIMENTOS */}
        {etapa === 2 && <SecaoItensDoOrcamento orc={orc} procedures={procedures} clinic={clinic} />}

        {/* ETAPA 3 — O PAGAMENTO */}
        {etapa === 3 && <SecaoPagamentoDoOrcamento orc={orc} />}

        {/* ETAPA 4 — REVISAR: o que vai sair, antes de salvar. */}
        {etapa === 4 && (
          <div className="space-y-3">
            <div className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3.5">
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

            <p className="text-[13px] text-ink-soft px-1">
              Toque numa etapa lá em cima para corrigir qualquer coisa — nada do que já foi preenchido
              se perde.
            </p>
          </div>
        )}
      </form>

      {/* Fora do <form>: um clique no mapa não pode disparar o submit do orçamento. */}
      <ModaisDoOrcamento orc={orc} procedures={procedures} clinic={clinic} />
    </SidePanel>
  );
};
