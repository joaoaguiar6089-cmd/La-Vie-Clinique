import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { LoteDeEstoque, ProdutoDeEstoque } from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import { formatarPrecoUnitario, numeroValido, quantidadeDoProduto } from '../../utils/estoque';
import {
  ResumoDoTipo,
  arredondarQuantidade,
  situacaoDaValidade,
  totaisLegiveis,
  validadeCurta,
} from '../../utils/lotes';
import { ajustarLote, atualizarLote, saveTipoDeProduto } from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';
import {
  AcaoDoMenu,
  AvisoTinta,
  CampoTinta,
  Chip,
  INPUT_TINTA,
  MenuDeAcoes,
  PilulasDeEscolha,
} from '../common/Tinta';
import { ListaSuspensa } from '../common/ListaSuspensa';

interface TipoDeProdutoPanelProps {
  /** O tipo aberto, já resumido. `null` = fechado. */
  resumo: ResumoDoTipo | null;
  onFechar: () => void;
  hoje: string;
  /** Quem está logada — vai no registro de cada ajuste. */
  autorNome?: string;
  onEditarProduto: (produto: ProdutoDeEstoque) => void;
  onNovoProduto: (tipo: string) => void;
  acoesDoProduto: (produto: ProdutoDeEstoque) => AcaoDoMenu[];
}

/** O selo da validade de um lote: vencido, vencendo (até 30 dias) ou nada. */
export const SeloDaValidade: React.FC<{ validade?: string; hoje: string }> = ({ validade, hoje }) => {
  const s = situacaoDaValidade(validade, hoje);
  if (!s || s.situacao === 'ok') return null;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[12px] font-bold ${
        s.situacao === 'vencido' ? 'bg-danger-bg text-danger' : 'bg-warn-bg text-warn'
      }`}
    >
      {s.situacao === 'vencido' ? 'Vencido' : s.dias === 0 ? 'Vence hoje' : `Vence em ${s.dias} ${s.dias === 1 ? 'dia' : 'dias'}`}
    </span>
  );
};

type Motivo = 'contagem' | 'perda' | 'vencido' | 'outro';
const MOTIVOS: { id: Motivo; rotulo: string }[] = [
  { id: 'contagem', rotulo: 'Contagem' },
  { id: 'perda', rotulo: 'Perda' },
  { id: 'vencido', rotulo: 'Vencido' },
  { id: 'outro', rotulo: 'Outro' },
];

/** O que está aberto embaixo de um lote: o ajuste do saldo ou a correção do código e da validade. */
type Edicao = { loteId: string; tipo: 'ajuste' | 'lote' } | null;

/**
 * O painel de um tipo de produto: quanto há em estoque, o mínimo, os produtos do tipo (nome, marca,
 * preços) e os lotes — data da compra, lote, validade e quanto resta de cada um.
 *
 * O saldo de um lote só muda por dois caminhos: os materiais lançados no relatório do atendimento
 * (sozinho, do lote que vence primeiro) e o **Ajustar** daqui — perda, vencido, contagem. O ajuste
 * fica guardado no lote, com o saldo de antes, o motivo e quem fez.
 */
export const TipoDeProdutoPanel: React.FC<TipoDeProdutoPanelProps> = ({
  resumo,
  onFechar,
  hoje,
  autorNome,
  onEditarProduto,
  onNovoProduto,
  acoesDoProduto,
}) => {
  const [minimo, setMinimo] = useState('');
  const [unidadeDoMinimo, setUnidadeDoMinimo] = useState('');
  const [salvandoMinimo, setSalvandoMinimo] = useState(false);
  const [verEsgotados, setVerEsgotados] = useState(false);
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [novoSaldo, setNovoSaldo] = useState('');
  const [motivo, setMotivo] = useState<Motivo | ''>('');
  const [motivoOutro, setMotivoOutro] = useState('');
  const [codigo, setCodigo] = useState('');
  const [validade, setValidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Cada gravação daqui (mínimo, ajuste, correção do lote) já está salva: o painel não é um
   * formulário com um "Salvar" no fim, e fechar depois disso não pode perguntar se descarta.
   */
  const [gravacoes, setGravacoes] = useState(0);

  const chave = resumo?.chave;
  useEffect(() => {
    if (!resumo) return;
    setMinimo(resumo.minimo ? String(resumo.minimo) : '');
    setUnidadeDoMinimo(resumo.unidadeDoMinimo || resumo.totais[0]?.unidade || resumo.produtos[0]?.unidade || 'un');
    setVerEsgotados(false);
    setEdicao(null);
    setErro(null);
    // Recomeça quando outro tipo abre — não a cada mudança de saldo que chega do banco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  if (!resumo) return null;

  const unidades = [...new Set([...resumo.totais.map((t) => t.unidade), ...resumo.produtos.map((p) => p.unidade)])];
  const comSaldo = resumo.lotes.filter((l) => l.saldo > 0);
  const lotesVisiveis = verEsgotados ? resumo.lotes : comSaldo;
  const esgotados = resumo.lotes.length - comSaldo.length;
  const saldoDoProduto = (id: string) =>
    arredondarQuantidade(resumo.lotes.filter((l) => l.produtoId === id && l.saldo > 0).reduce((s, l) => s + l.saldo, 0));
  const unidadeDoLote = (l: LoteDeEstoque) => resumo.produtos.find((p) => p.id === l.produtoId)?.unidade || 'un';

  const salvarMinimo = async () => {
    setSalvandoMinimo(true);
    setErro(null);
    try {
      await saveTipoDeProduto({
        id: resumo.chave,
        nome: resumo.nome,
        minimo: numeroValido(minimo) || undefined,
        unidade: unidadeDoMinimo || undefined,
      });
      setGravacoes((n) => n + 1);
    } catch (e) {
      setErro(`Não foi possível salvar o mínimo: ${(e as Error).message}`);
    } finally {
      setSalvandoMinimo(false);
    }
  };

  /** Cancelar o ajuste ou a correção descarta o que foi digitado nela — não sobra nada pendente. */
  const cancelarEdicao = () => {
    setEdicao(null);
    setGravacoes((n) => n + 1);
  };

  const abrirAjuste = (l: LoteDeEstoque) => {
    setEdicao({ loteId: l.id, tipo: 'ajuste' });
    setNovoSaldo(String(l.saldo));
    setMotivo('');
    setMotivoOutro('');
    setErro(null);
  };

  const abrirCorrecao = (l: LoteDeEstoque) => {
    setEdicao({ loteId: l.id, tipo: 'lote' });
    setCodigo(l.lote || '');
    setValidade(l.validade || '');
    setErro(null);
  };

  const salvarAjuste = async (l: LoteDeEstoque) => {
    const para = arredondarQuantidade(Number(String(novoSaldo).replace(',', '.')));
    if (!Number.isFinite(para) || para < 0) {
      setErro('Informe quanto ficou no lote — zero ou mais.');
      return;
    }
    if (!motivo || (motivo === 'outro' && !motivoOutro.trim())) {
      setErro('Diga o motivo do ajuste.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await ajustarLote(
        l.id,
        para,
        motivo === 'outro' ? motivoOutro.trim() : MOTIVOS.find((m) => m.id === motivo)!.rotulo,
        autorNome
      );
      setEdicao(null);
      setGravacoes((n) => n + 1);
    } catch (e) {
      setErro(`Não foi possível ajustar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const salvarCorrecao = async (l: LoteDeEstoque) => {
    setSalvando(true);
    setErro(null);
    try {
      await atualizarLote(l.id, { lote: codigo, validade });
      setEdicao(null);
      setGravacoes((n) => n + 1);
    } catch (e) {
      setErro(`Não foi possível corrigir o lote: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const botaoPequeno =
    'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-ink/15 text-[13px] font-semibold text-ink hover:border-ink/40 transition-colors';

  const cabecalho = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <p className="text-[12px] font-semibold text-brand-light">Em estoque</p>
        <p className="text-[24px] font-bold text-white tabular-nums leading-tight">{totaisLegiveis(resumo.totais)}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {resumo.abaixoDoMinimo && (
          <span className="px-2.5 py-1 rounded-full bg-danger-bg text-danger text-[12px] font-bold">Abaixo do mínimo</span>
        )}
        {resumo.vencidos > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-danger-bg text-danger text-[12px] font-bold">
            {resumo.vencidos} {resumo.vencidos === 1 ? 'lote vencido' : 'lotes vencidos'}
          </span>
        )}
        {resumo.vencendo > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-warn-bg text-warn text-[12px] font-bold">
            {resumo.vencendo} vencendo em 30 dias
          </span>
        )}
      </div>
    </div>
  );

  return (
    <SidePanel
      aberto={!!resumo}
      onFechar={onFechar}
      titulo={resumo.nome}
      sobretitulo="Estoque"
      largura="larga"
      cabecalho={cabecalho}
      gravado={gravacoes}
    >
      <div className="px-5 sm:px-6 py-5 flex flex-col gap-7">
        {erro && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {erro}
          </AvisoTinta>
        )}

        {resumo.chave && (
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="font-serif-luxury text-[24px] font-semibold text-ink">Quantidade mínima</h3>
              <p className="text-[14px] text-ink-soft leading-snug">
                Abaixo dela, o tipo aparece em destaque no Estoque. Deixe em branco para não avisar.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <CampoTinta rotulo="Mínimo" htmlFor="tipo-minimo" className="w-36">
                <input
                  id="tipo-minimo"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={minimo}
                  onChange={(e) => setMinimo(e.target.value)}
                  placeholder="—"
                  className={`${INPUT_TINTA} tabular-nums`}
                />
              </CampoTinta>
              {unidades.length > 1 ? (
                <ListaSuspensa
                  id="tipo-minimo-unidade"
                  rotulo="Em"
                  className="w-40"
                  valor={unidadeDoMinimo}
                  onMudar={setUnidadeDoMinimo}
                  opcoes={unidades.map((u) => ({ valor: u, rotulo: u }))}
                  buscavel={false}
                />
              ) : (
                <span className="pb-4 text-[15px] font-semibold text-ink-soft">{unidadeDoMinimo}</span>
              )}
              <button
                type="button"
                onClick={salvarMinimo}
                disabled={salvandoMinimo}
                className="h-[56px] px-5 rounded-[14px] bg-ink text-white text-[15px] font-semibold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {salvandoMinimo && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar mínimo
              </button>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h3 className="font-serif-luxury text-[24px] font-semibold text-ink">Produtos</h3>
            <button type="button" onClick={() => onNovoProduto(resumo.chave ? resumo.nome : '')} className={botaoPequeno}>
              <Plus className="w-4 h-4" />
              Novo produto{resumo.chave ? ' deste tipo' : ''}
            </button>
          </div>
          {resumo.produtos.length === 0 ? (
            <p className="text-[14px] text-ink-soft">Nenhum produto cadastrado neste tipo.</p>
          ) : (
            <ul className="rounded-[20px] bg-card border border-ink/10 divide-y divide-ink/8 overflow-hidden">
              {resumo.produtos.map((p) => (
                <li key={p.id} className="flex items-center gap-2 pr-2">
                  <button
                    type="button"
                    onClick={() => onEditarProduto(p)}
                    className="flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left hover:bg-surface transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-ink truncate">
                        {p.nome}
                        {p.arquivado && <span className="ml-2 text-[12px] font-semibold text-ink-soft">arquivado</span>}
                      </span>
                      <span className="block text-[13px] text-ink-soft truncate">
                        {[p.marca, `comprado a ${formatarPrecoUnitario(p.custoUnitario)} por ${p.unidade}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[15px] font-bold text-ink tabular-nums">
                      {quantidadeDoProduto(saldoDoProduto(p.id), p.unidade)}
                    </span>
                  </button>
                  <MenuDeAcoes tom="discreto" acoes={acoesDoProduto(p)} rotulo={`Mais ações para ${p.nome}`} titulo={p.nome} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-serif-luxury text-[24px] font-semibold text-ink">Lotes</h3>
              <p className="text-[14px] text-ink-soft leading-snug">
                O que entrou em cada compra e quanto resta. O atendimento tira do que vence primeiro.
              </p>
            </div>
            {esgotados > 0 && (
              <Chip ativo={verEsgotados} onClick={() => setVerEsgotados((v) => !v)}>
                Mostrar esgotados ({esgotados})
              </Chip>
            )}
          </div>

          {lotesVisiveis.length === 0 ? (
            <p className="text-[14px] text-ink-soft">
              {resumo.lotes.length === 0
                ? 'Nenhum lote ainda. Registre uma compra (ou o estoque atual) na aba Compras.'
                : 'Todos os lotes estão esgotados.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {lotesVisiveis.map((l) => {
                const unidade = unidadeDoLote(l);
                const aberto = edicao?.loteId === l.id ? edicao.tipo : null;
                const ultimoAjuste = l.ajustes?.[l.ajustes.length - 1];
                return (
                  <li
                    key={l.id}
                    className={`rounded-[18px] border p-4 flex flex-col gap-2.5 ${
                      l.saldo > 0 ? 'bg-card border-ink/10' : 'bg-surface border-ink/8 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-ink">
                          {l.produtoNome}
                          {l.marca && <span className="font-medium text-ink-soft"> · {l.marca}</span>}
                        </p>
                        <p className="text-[13px] text-ink-soft mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>Comprado em {formatDateOnly(l.dataCompra)}</span>
                          <span>· {l.lote ? `Lote ${l.lote}` : 'sem lote'}</span>
                          <span>· {l.validade ? `Validade ${validadeCurta(l.validade)}` : 'sem validade'}</span>
                          <SeloDaValidade validade={l.saldo > 0 ? l.validade : undefined} hoje={hoje} />
                        </p>
                        {l.fornecedor && <p className="text-[13px] text-ink-soft">{l.fornecedor}</p>}
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="text-[18px] font-bold text-ink leading-tight">{quantidadeDoProduto(l.saldo, unidade)}</p>
                        <p className="text-[12px] text-ink-soft">de {quantidadeDoProduto(l.quantidade, unidade)}</p>
                      </div>
                    </div>
                    {ultimoAjuste && (
                      <p className="text-[13px] text-ink-soft">
                        Último ajuste: {ultimoAjuste.motivo}, de {quantidadeDoProduto(ultimoAjuste.de, unidade)} para{' '}
                        {quantidadeDoProduto(ultimoAjuste.para, unidade)}
                        {ultimoAjuste.porNome ? ` · ${ultimoAjuste.porNome}` : ''} · {formatDateOnly(ultimoAjuste.em.slice(0, 10))}
                      </p>
                    )}

                    {aberto === 'ajuste' ? (
                      <div className="rounded-2xl bg-surface border border-ink/8 p-3.5 flex flex-col gap-3">
                        <CampoTinta rotulo={`Quanto ficou no lote (${unidade})`} htmlFor={`ajuste-${l.id}`} className="max-w-[240px]">
                          <input
                            id={`ajuste-${l.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={novoSaldo}
                            onChange={(e) => setNovoSaldo(e.target.value)}
                            className={`${INPUT_TINTA} tabular-nums`}
                          />
                        </CampoTinta>
                        <PilulasDeEscolha
                          rotulo="Motivo"
                          compacta
                          opcoes={MOTIVOS}
                          valor={motivo}
                          onMudar={(m) => setMotivo(m)}
                        />
                        {motivo === 'outro' && (
                          <CampoTinta rotulo="Qual motivo?" htmlFor={`ajuste-motivo-${l.id}`}>
                            <input
                              id={`ajuste-motivo-${l.id}`}
                              value={motivoOutro}
                              onChange={(e) => setMotivoOutro(e.target.value)}
                              className={INPUT_TINTA}
                            />
                          </CampoTinta>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={cancelarEdicao} className={botaoPequeno}>
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => salvarAjuste(l)}
                            disabled={salvando}
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-ink text-white text-[13px] font-semibold disabled:opacity-50"
                          >
                            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Salvar ajuste
                          </button>
                        </div>
                      </div>
                    ) : aberto === 'lote' ? (
                      <div className="rounded-2xl bg-surface border border-ink/8 p-3.5 flex flex-col gap-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <CampoTinta rotulo="Lote" htmlFor={`codigo-${l.id}`}>
                            <input id={`codigo-${l.id}`} value={codigo} onChange={(e) => setCodigo(e.target.value)} className={INPUT_TINTA} />
                          </CampoTinta>
                          <CampoTinta rotulo="Validade" htmlFor={`validade-${l.id}`}>
                            <input
                              id={`validade-${l.id}`}
                              type="date"
                              value={validade}
                              onChange={(e) => setValidade(e.target.value)}
                              className={`${INPUT_TINTA} min-h-[24px]`}
                            />
                          </CampoTinta>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={cancelarEdicao} className={botaoPequeno}>
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => salvarCorrecao(l)}
                            disabled={salvando}
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-ink text-white text-[13px] font-semibold disabled:opacity-50"
                          >
                            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => abrirAjuste(l)} className={botaoPequeno}>
                          <SlidersHorizontal className="w-4 h-4" />
                          Ajustar
                        </button>
                        <button type="button" onClick={() => abrirCorrecao(l)} className={botaoPequeno}>
                          <Pencil className="w-4 h-4" />
                          Lote e validade
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </SidePanel>
  );
};
