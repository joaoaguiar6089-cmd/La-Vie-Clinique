import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Loader2 } from 'lucide-react';
import { ConsumoPadrao, Procedure, ProdutoDeEstoque } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  LinhaDeMaterial,
  linhaDoProduto,
  linhasParaGravar,
  totaisDosMateriais,
} from '../../utils/estoque';
import { saveConsumosPadrao } from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';
import { EditorDeMateriais } from './EditorDeMateriais';

interface ConsumoPadraoPanelProps {
  aberto: boolean;
  onFechar: () => void;
  procedimento: Procedure | null;
  catalogo: Procedure[];
  produtos: ProdutoDeEstoque[];
  consumos: ConsumoPadrao[];
}

/** O consumo padrão em linhas do editor, com o preço de hoje de cada produto. */
const linhasDoConsumo = (
  consumo: ConsumoPadrao | undefined,
  produtos: ProdutoDeEstoque[]
): LinhaDeMaterial[] =>
  (consumo?.itens || [])
    .map((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId);
      return produto ? linhaDoProduto(produto, item.quantidade) : null;
    })
    .filter((l): l is LinhaDeMaterial => !!l);

/**
 * O que um procedimento costuma consumir, por sessão.
 *
 * É daqui que o registro de materiais do atendimento e o custo estimado do orçamento abrem
 * preenchidos. Só produtos do estoque e só quantidades — o preço é sempre o do produto no dia em
 * que o consumo é usado.
 *
 * As treze áreas do laser gastam praticamente o mesmo por sessão, então "aplicar a toda a
 * categoria" grava o mesmo consumo em todas de uma vez.
 */
export const ConsumoPadraoPanel: React.FC<ConsumoPadraoPanelProps> = ({
  aberto,
  onFechar,
  procedimento,
  catalogo,
  produtos,
  consumos,
}) => {
  const [linhas, setLinhas] = useState<LinhaDeMaterial[]>([]);
  const [aplicarNaCategoria, setAplicarNaCategoria] = useState(false);
  const [copiarDe, setCopiarDe] = useState('');
  const [mexida, setMexida] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const consumoAtual = procedimento
    ? consumos.find((c) => c.procedureId === procedimento.id)
    : undefined;

  useEffect(() => {
    if (!aberto) return;
    setLinhas(linhasDoConsumo(consumoAtual, produtos));
    setAplicarNaCategoria(false);
    setCopiarDe('');
    setMexida(false);
    setSalvando(false);
    setErro(null);
    // Recomeça a cada procedimento aberto, e não a cada mudança da assinatura — senão uma
    // gravação de outra pessoa apagaria o que está sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, procedimento?.id]);

  const daMesmaCategoria = useMemo(
    () =>
      procedimento
        ? catalogo.filter((p) => p.category === procedimento.category && p.id !== procedimento.id)
        : [],
    [catalogo, procedimento]
  );

  /** Procedimentos que já têm consumo configurado — de onde dá para copiar. */
  const comConsumo = useMemo(
    () =>
      catalogo
        .filter(
          (p) =>
            p.id !== procedimento?.id &&
            consumos.some((c) => c.procedureId === p.id && c.itens.length > 0)
        )
        .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    [catalogo, consumos, procedimento?.id]
  );

  if (!procedimento) return null;

  const totais = totaisDosMateriais(linhas);

  const copiar = (procedureId: string) => {
    setCopiarDe(procedureId);
    const origem = consumos.find((c) => c.procedureId === procedureId);
    if (origem) {
      setLinhas(linhasDoConsumo(origem, produtos));
      setMexida(true);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const itens = linhasParaGravar(linhas)
      .filter((l) => l.produtoId)
      .map((l) => ({ produtoId: l.produtoId as string, quantidade: l.quantidade }));
    const alvos = [procedimento, ...(aplicarNaCategoria ? daMesmaCategoria : [])];
    try {
      await saveConsumosPadrao(
        alvos.map((p) => ({ id: p.id, procedureId: p.id, itens }))
      );
      onFechar();
    } catch (e) {
      setErro(`Não foi possível salvar: ${(e as Error).message}`);
      setSalvando(false);
    }
  };

  const rodape = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onFechar}
        disabled={salvando}
        className="min-h-[44px] px-4 rounded-xl text-body-lg font-semibold text-ink-soft hover:bg-surface-2 transition-colors disabled:opacity-40"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-ink text-white text-body-lg font-semibold disabled:opacity-40"
      >
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Salvar consumo
      </button>
    </div>
  );

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo={procedimento.title}
      sobretitulo="Consumo por sessão"
      bloqueado={salvando}
      alterado={mexida}
      rodape={rodape}
    >
      <div className="p-4 sm:p-6 space-y-5">
        <p className="text-body text-muted -mt-1">
          O que uma sessão deste procedimento costuma gastar. O registro de materiais do atendimento
          e o custo estimado do orçamento abrem com esta lista — dá para ajustar em cada um.
        </p>

        {erro && (
          <div className="flex items-start gap-2 text-body text-danger bg-danger-bg border border-danger-line rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{erro}</span>
          </div>
        )}

        {comConsumo.length > 0 && (
          <div>
            <label
              className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-gray-400 mb-1"
              htmlFor="consumo-copiar"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar de outro procedimento
            </label>
            <select
              id="consumo-copiar"
              value={copiarDe}
              onChange={(e) => copiar(e.target.value)}
              className="w-full glass-input px-3 py-2 rounded-sm text-sm text-ink focus:outline-hidden"
            >
              <option value="">Escolha um procedimento…</option>
              {comConsumo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <EditorDeMateriais
          idBase="consumo"
          itens={linhas}
          onChange={(novas) => {
            setLinhas(novas);
            setMexida(true);
          }}
          produtos={produtos}
          permitirAvulso={false}
          editarValores={false}
          mostrarTotais={false}
        />

        {linhas.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-2 border-t border-line">
            <span className="text-body text-muted">
              Valor para a cliente: <strong className="text-ink">{formatBRL(totais.valorCliente)}</strong>
            </span>
            <span className="text-body-lg text-ink">
              Custo por sessão, hoje:{' '}
              <strong className="font-serif-luxury text-title tabular-nums">
                {formatBRL(totais.custo)}
              </strong>
            </span>
          </div>
        )}

        {daMesmaCategoria.length > 0 && (
          <label className="flex items-start gap-2 p-3 rounded-xl border border-line bg-surface cursor-pointer">
            <input
              type="checkbox"
              checked={aplicarNaCategoria}
              onChange={(e) => setAplicarNaCategoria(e.target.checked)}
              className="w-4 h-4 accent-brand mt-0.5"
            />
            <span className="text-body text-ink">
              Aplicar também aos outros {daMesmaCategoria.length} procedimentos de{' '}
              <strong>{procedimento.category}</strong>
              <span className="block text-muted">
                Substitui o consumo que eles tiverem hoje.
              </span>
            </span>
          </label>
        )}
      </div>
    </SidePanel>
  );
};
