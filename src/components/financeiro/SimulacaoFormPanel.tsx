import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import {
  ConsumoPadrao,
  Patient,
  Procedure,
  ProdutoDeEstoque,
  SimulacaoDeCusto,
} from '../../types';
import { formatBRL } from '../../utils/formatters';
import { numeroValido } from '../../utils/estoque';
import {
  ProcedimentoEmEdicao,
  copiaDosProcedimentos,
  materiaisDoProcedimento,
  montarSimulacao,
  novoIdDeSimulacao,
  problemaDaSimulacao,
  procedimentoDoCatalogo,
  procedimentoEmBranco,
  procedimentosParaGravar,
  totaisDaSimulacao,
  totaisDoProcedimento,
} from '../../utils/simulacaoDeCusto';
import { saveProdutoDeEstoque, saveSimulacaoDeCusto } from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';
import { AvisoTinta, BotaoPrincipal, CampoTinta, INPUT_TINTA } from '../common/Tinta';
import { PatientSearchSelect } from '../quotes/PatientSearchSelect';
import { ProcedureSearchAdd } from '../quotes/ProcedureSearchAdd';
import { COR_DA_CLIENTE, COR_DO_CUSTO, EditorDeMateriais } from '../estoque/EditorDeMateriais';
import { TituloDeSecao } from '../quotes/PecasDoOrcamento';

/** O que abre o formulário: uma simulação para editar, ou o começo de uma nova (vazia ou cópia). */
export interface PedidoDeSimulacao {
  simulacao?: SimulacaoDeCusto;
  /** A cópia de outra simulação — a cliente e os procedimentos, sem gravar ainda. */
  copiaDe?: SimulacaoDeCusto;
}

interface SimulacaoFormPanelProps {
  pedido: PedidoDeSimulacao | null;
  onFechar: () => void;
  onSalva: (simulacao: SimulacaoDeCusto) => void;
  pacientes: Patient[];
  catalogo: Procedure[];
  produtos: ProdutoDeEstoque[];
  consumos: ConsumoPadrao[];
  /** Quem está logada — é no nome dela que a simulação nova fica. */
  autor: { uid: string; nome: string };
}

/**
 * O formulário da simulação de custo: a cliente (opcional), os procedimentos e os materiais de
 * cada um, com custo e valor repassado à cliente.
 *
 * Funciona como o custo de material do orçamento: o procedimento do catálogo chega com o consumo
 * padrão × as sessões, e cada linha é editável — trocar o produto, a quantidade, o preço, ou
 * acrescentar um material fora do estoque (que pode ser cadastrado nele ao salvar). Aqui, ao
 * contrário do orçamento, os custos ficam sempre à vista: a simulação é só da equipe.
 */
export const SimulacaoFormPanel: React.FC<SimulacaoFormPanelProps> = ({
  pedido,
  onFechar,
  onSalva,
  pacientes,
  catalogo,
  produtos,
  consumos,
  autor,
}) => {
  const aberto = !!pedido;
  const anterior = pedido?.simulacao || null;
  const editando = !!anterior;

  const [pacienteId, setPacienteId] = useState<string | undefined>(undefined);
  const [pacienteNome, setPacienteNome] = useState('');
  const [procedimentos, setProcedimentos] = useState<ProcedimentoEmEdicao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** Um procedimento entrou ou saiu por botão — o painel não enxerga isso sozinho. */
  const [mexeu, setMexeu] = useState(false);

  // Cada abertura começa do que foi pedido — nunca do que sobrou da anterior.
  useEffect(() => {
    if (!pedido) return;
    const origem = pedido.simulacao || pedido.copiaDe;
    setPacienteId(origem?.pacienteId);
    setPacienteNome(origem?.pacienteNome || '');
    setProcedimentos(
      pedido.simulacao
        ? pedido.simulacao.procedimentos.map((p) => ({ ...p, materiais: p.materiais.map((m) => ({ ...m })) }))
        : copiaDosProcedimentos(pedido.copiaDe?.procedimentos || [])
    );
    setErro(null);
    setSalvando(false);
    setMexeu(!!pedido.copiaDe);
  }, [pedido]);

  const mudar = (id: string, patch: Partial<ProcedimentoEmEdicao>) =>
    setProcedimentos((atual) => atual.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const adicionarDoCatalogo = (procedure: Procedure) => {
    setProcedimentos((atual) => [...atual, procedimentoDoCatalogo(procedure, consumos, produtos, catalogo)]);
    setMexeu(true);
    setErro(null);
  };

  const adicionarEmBranco = () => {
    setProcedimentos((atual) => [...atual, procedimentoEmBranco()]);
    setMexeu(true);
    setErro(null);
  };

  const remover = (id: string) => {
    setProcedimentos((atual) => atual.filter((p) => p.id !== id));
    setMexeu(true);
  };

  const recalcular = (p: ProcedimentoEmEdicao) => {
    mudar(p.id, { materiais: materiaisDoProcedimento(p, consumos, produtos, catalogo) });
    setMexeu(true);
  };

  const totais = totaisDaSimulacao(procedimentos);

  const salvar = async () => {
    const problema = problemaDaSimulacao(procedimentos);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      // Material digitado à mão e marcado para o estoque vira produto antes, para a linha já
      // nascer apontando para ele — como nos materiais do atendimento.
      const comProdutos = await Promise.all(
        procedimentos.map(async (p) => ({
          ...p,
          materiais: await Promise.all(
            p.materiais.map(async (l) => {
              if (l.produtoId || !l.cadastrarNoEstoque || !l.nome.trim()) return l;
              const novo: ProdutoDeEstoque = {
                id: `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                nome: l.nome.trim(),
                unidade: (l.unidade || 'un').trim(),
                custoUnitario: numeroValido(l.custoUnitario),
                valorCliente: numeroValido(l.valorCliente),
                createdAt: new Date().toISOString(),
              };
              await saveProdutoDeEstoque(novo);
              return { ...l, produtoId: novo.id, cadastrarNoEstoque: false };
            })
          ),
        }))
      );
      // Cadastrado no estoque, a linha não oferece cadastrar de novo se a gravação falhar abaixo.
      setProcedimentos(comProdutos);

      const simulacao = montarSimulacao({
        id: anterior?.id || novoIdDeSimulacao(),
        paciente: { id: pacienteId, nome: pacienteNome },
        procedimentos: procedimentosParaGravar(comProdutos),
        autor,
        anterior,
        agora: new Date().toISOString(),
      });
      await saveSimulacaoDeCusto(simulacao);
      onFechar();
      onSalva(simulacao);
    } catch (e) {
      setErro(`Não foi possível salvar a simulação: ${(e as Error).message}`);
      setSalvando(false);
    }
  };

  const cabecalho =
    procedimentos.length > 0 ? (
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand-light">Custo dos materiais</p>
          <p className="text-[22px] font-bold text-white tabular-nums leading-tight">{formatBRL(totais.custo)}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[12px] font-semibold text-brand-light">Repassado à cliente</p>
          <p className="text-[15px] font-semibold text-cream tabular-nums">{formatBRL(totais.valorCliente)}</p>
        </div>
      </div>
    ) : undefined;

  /** O resumo da direita (no celular, o fim do formulário): o custo de cada procedimento e os dois totais. */
  const resumo =
    procedimentos.length > 0 ? (
      <section className="flex flex-col gap-3">
        <TituloDeSecao titulo="Resumo" />
        <div className="rounded-[20px] bg-card border border-ink/10 p-4 sm:p-5 flex flex-col gap-3 tabular-nums">
          {procedimentos.map((p, n) => {
            const t = totaisDoProcedimento(p);
            return (
              <div key={p.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="min-w-0 truncate text-ink">
                  <span className="text-ink-soft">{n + 1}.</span> {p.titulo.trim() || 'Procedimento sem nome'}
                </span>
                <span className="shrink-0 flex gap-3">
                  <span className={`font-semibold ${COR_DO_CUSTO.valor}`}>{formatBRL(t.custo)}</span>
                  <span className={`font-semibold ${COR_DA_CLIENTE.valor}`}>{formatBRL(t.valorCliente)}</span>
                </span>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-ink/8">
            <div className={`rounded-xl px-3 py-2.5 ${COR_DO_CUSTO.caixa}`}>
              <span className="block text-[12px] font-semibold">Custo total dos produtos</span>
              <span className="block text-[20px] font-bold leading-tight">{formatBRL(totais.custo)}</span>
            </div>
            <div className={`rounded-xl px-3 py-2.5 ${COR_DA_CLIENTE.caixa}`}>
              <span className="block text-[12px] font-semibold">Total para a cliente</span>
              <span className="block text-[20px] font-bold leading-tight">{formatBRL(totais.valorCliente)}</span>
            </div>
          </div>
        </div>
      </section>
    ) : null;

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo={editando ? 'Editar simulação' : 'Nova simulação de custo'}
      sobretitulo="Financeiro"
      subtitulo="O custo dos materiais de cada procedimento. O PDF mostra tudo, inclusive o custo."
      cabecalho={cabecalho}
      /* No computador, o resumo ao lado faz o papel do total no cabeçalho preto. */
      cabecalhoSoNoCelular
      largura="tela"
      bloqueado={salvando}
      alterado={mexeu}
      rodape={
        <BotaoPrincipal onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
          {salvando
            ? 'Salvando…'
            : editando
            ? 'Salvar alterações'
            : `Salvar simulação${totais.custo > 0 ? ` · ${formatBRL(totais.custo)}` : ''}`}
        </BotaoPrincipal>
      }
    >
      <form
        className="px-5 sm:px-10 py-5 sm:py-8"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:items-start">
          <div className="flex flex-col gap-7 min-w-0">
            {erro && (
              <AvisoTinta tom="erro" icone={AlertCircle}>
                {erro}
              </AvisoTinta>
            )}

            <section className="flex flex-col gap-3">
              <TituloDeSecao titulo="Cliente" descricao="Opcional — do cadastro ou digitada. Sai só no cabeçalho do PDF." />
              <PatientSearchSelect
                patients={pacientes}
                pacienteId={pacienteId}
                pacienteNome={pacienteNome}
                onSelect={(p) => {
                  setPacienteId(p.id);
                  setPacienteNome(p.nome);
                }}
              />
            </section>

            <section className="flex flex-col gap-4">
              <TituloDeSecao
                titulo="Procedimentos"
                contagem={procedimentos.length}
                descricao="Do catálogo, os materiais já vêm pelo consumo padrão do Estoque, vezes as sessões. Tudo pode ser mudado."
              />

              {procedimentos.map((p, n) => {
                const doProcedimento = totaisDoProcedimento(p);
                return (
                  <div key={p.id} className="rounded-[20px] bg-card border border-ink/10 p-4 sm:p-5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <span
                        aria-hidden
                        className="w-8 h-8 mt-0.5 sm:mt-3 shrink-0 rounded-full bg-ink text-brand-pale text-[14px] font-bold flex items-center justify-center tabular-nums"
                      >
                        {n + 1}
                      </span>
                      <CampoTinta
                        rotulo="Procedimento"
                        htmlFor={`sim-proc-${p.id}`}
                        className="order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0"
                      >
                        <input
                          id={`sim-proc-${p.id}`}
                          type="text"
                          value={p.titulo}
                          maxLength={120}
                          onChange={(e) => {
                            mudar(p.id, { titulo: e.target.value });
                            setErro(null);
                          }}
                          placeholder="Nome do procedimento"
                          className={INPUT_TINTA}
                        />
                      </CampoTinta>
                      <button
                        type="button"
                        onClick={() => remover(p.id)}
                        aria-label={`Remover o procedimento ${n + 1}`}
                        title="Remover"
                        className="ml-auto sm:ml-0 sm:mt-2 w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-danger hover:bg-danger-bg transition-colors"
                      >
                        <X className="w-[18px] h-[18px]" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-4 sm:pl-11">
                      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                        <CampoTinta rotulo="Sessões" htmlFor={`sim-sessoes-${p.id}`} className="w-[120px]">
                          <input
                            id={`sim-sessoes-${p.id}`}
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={p.sessoes || ''}
                            onChange={(e) => mudar(p.id, { sessoes: Math.floor(numeroValido(e.target.value)) })}
                            className={`${INPUT_TINTA} tabular-nums`}
                          />
                        </CampoTinta>
                        <button
                          type="button"
                          onClick={() => recalcular(p)}
                          className="inline-flex items-center gap-1.5 min-h-[44px] text-[14px] font-semibold text-ink underline underline-offset-2 hover:no-underline"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Recalcular pelo consumo padrão
                          {(p.sessoes || 1) > 1 ? ` × ${p.sessoes} sessões` : ''}
                        </button>
                      </div>

                      <div>
                        <p className="text-[15px] font-bold text-ink mb-2">Materiais</p>
                        <EditorDeMateriais
                          idBase={`sim-${p.id}`}
                          itens={p.materiais}
                          onChange={(materiais) => {
                            mudar(p.id, { materiais });
                            setMexeu(true);
                          }}
                          produtos={produtos}
                          oferecerCadastro
                          mostrarTotais={false}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-ink/8 tabular-nums">
                        <div className={`rounded-xl px-3 py-2 ${COR_DO_CUSTO.caixa}`}>
                          <span className="block text-[12px] font-semibold">Custo dos produtos</span>
                          <span className="block text-[17px] font-bold">{formatBRL(doProcedimento.custo)}</span>
                        </div>
                        <div className={`rounded-xl px-3 py-2 ${COR_DA_CLIENTE.caixa}`}>
                          <span className="block text-[12px] font-semibold">Para a cliente</span>
                          <span className="block text-[17px] font-bold">{formatBRL(doProcedimento.valorCliente)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {procedimentos.length === 0 && <p className="text-[14px] text-ink-soft">Nenhum procedimento ainda.</p>}

              <div className="flex flex-col gap-2">
                <ProcedureSearchAdd grande procedures={catalogo} onAdd={adicionarDoCatalogo} />
                <button
                  type="button"
                  onClick={adicionarEmBranco}
                  className="min-h-[40px] px-1 text-ink text-[14px] font-semibold underline underline-offset-2 hover:no-underline flex w-fit items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Procedimento fora do catálogo
                </button>
              </div>
            </section>
          </div>

          {/* Preso enquanto a lista rola: o custo e o repasse sempre à vista ao lado dos materiais. */}
          {resumo && <div className="lg:sticky lg:top-6">{resumo}</div>}
        </div>
      </form>
    </SidePanel>
  );
};
