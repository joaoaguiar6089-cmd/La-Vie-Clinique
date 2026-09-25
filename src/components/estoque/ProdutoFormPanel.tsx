import React, { useEffect, useState } from 'react';
import { AlertCircle, Calculator, Check, Loader2 } from 'lucide-react';
import { ProdutoDeEstoque } from '../../types';
import {
  UNIDADES_SUGERIDAS,
  formatarPrecoUnitario,
  margemUnitaria,
  numeroValido,
  precoPorUnidade,
} from '../../utils/estoque';
import { saveProdutoDeEstoque } from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';

interface ProdutoFormPanelProps {
  aberto: boolean;
  onFechar: () => void;
  /** Produto sendo editado; `null` = novo. */
  produto: ProdutoDeEstoque | null;
  /** Nome já digitado em outro lugar — "Outro material…" do atendimento, por exemplo. */
  nomeInicial?: string;
  onSalvo?: (produto: ProdutoDeEstoque) => void;
}

const labelClass = 'block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1';
const inputClass =
  'w-full glass-input px-3 py-2 rounded-sm text-sm text-ink focus:outline-hidden tabular-nums';

/** Campo numérico guardado como texto, para não travar em "0" enquanto se apaga. */
const paraCampo = (valor?: number): string =>
  valor === undefined || valor === null || valor === 0 ? '' : String(valor);

/**
 * Cadastro de um produto do estoque.
 *
 * Os dois valores são por **unidade de uso**. A pergunta que ninguém sabe responder de cabeça é
 * "quanto custa um U de toxina", então o formulário oferece a conta: preço da embalagem dividido
 * pelo que vem nela.
 */
export const ProdutoFormPanel: React.FC<ProdutoFormPanelProps> = ({
  aberto,
  onFechar,
  produto,
  nomeInicial,
  onSalvo,
}) => {
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('un');
  const [custo, setCusto] = useState('');
  const [valorCliente, setValorCliente] = useState('');
  const [marca, setMarca] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [calculadoraAberta, setCalculadoraAberta] = useState(false);
  const [precoEmbalagem, setPrecoEmbalagem] = useState('');
  const [unidadesEmbalagem, setUnidadesEmbalagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Cada abertura recomeça do produto (ou em branco) — sobra da edição anterior viraria cadastro
  // de outro produto.
  useEffect(() => {
    if (!aberto) return;
    setNome(produto?.nome || nomeInicial || '');
    setUnidade(produto?.unidade || 'un');
    setCusto(paraCampo(produto?.custoUnitario));
    setValorCliente(paraCampo(produto?.valorCliente));
    setMarca(produto?.marca || '');
    setObservacoes(produto?.observacoes || '');
    setCalculadoraAberta(false);
    setPrecoEmbalagem('');
    setUnidadesEmbalagem('');
    setSalvando(false);
    setErro(null);
  }, [aberto, produto?.id, nomeInicial]);

  const margem = margemUnitaria({
    custoUnitario: numeroValido(custo),
    valorCliente: numeroValido(valorCliente),
  });
  const precoCalculado = precoPorUnidade(numeroValido(precoEmbalagem), numeroValido(unidadesEmbalagem));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErro('Informe o nome do produto.');
      return;
    }
    if (!unidade.trim()) {
      setErro('Informe a unidade de uso.');
      return;
    }
    setSalvando(true);
    setErro(null);
    const agora = new Date().toISOString();
    const salvo: ProdutoDeEstoque = {
      ...(produto || {}),
      id: produto?.id || `prod-${Date.now().toString(36)}`,
      nome: nome.trim(),
      unidade: unidade.trim(),
      custoUnitario: numeroValido(custo),
      valorCliente: numeroValido(valorCliente),
      marca: marca.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
      createdAt: produto?.createdAt || agora,
    };
    try {
      await saveProdutoDeEstoque(salvo);
      onSalvo?.(salvo);
      onFechar();
    } catch (err) {
      setErro(`Não foi possível salvar: ${(err as Error).message}`);
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
        type="submit"
        form="form-produto"
        disabled={salvando}
        className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-ink text-white text-body-lg font-semibold disabled:opacity-40"
      >
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Salvar produto
      </button>
    </div>
  );

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo={produto ? 'Editar produto' : 'Novo produto'}
      sobretitulo="Estoque"
      bloqueado={salvando}
      rodape={rodape}
    >
      <form id="form-produto" onSubmit={salvar} className="p-4 sm:p-6 space-y-5">
        {erro && (
          <div className="flex items-start gap-2 text-body text-danger bg-danger-bg border border-danger-line rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{erro}</span>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="produto-nome">
            Nome *
          </label>
          <input
            id="produto-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Toxina botulínica 100 U"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="produto-unidade">
              Unidade de uso *
            </label>
            <input
              id="produto-unidade"
              list="produto-unidades"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              placeholder="U, ml, un, seringa…"
              className={inputClass}
            />
            <datalist id="produto-unidades">
              {UNIDADES_SUGERIDAS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <p className="mt-1 text-body text-gray-400">
              Como ele é usado no atendimento. Os valores abaixo são por esta unidade.
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="produto-marca">
              Marca / fornecedor
            </label>
            <input
              id="produto-marca"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="produto-custo">
              Valor comprado (por {unidade.trim() || 'unidade'})
            </label>
            <input
              id="produto-custo"
              type="number"
              min="0"
              step="0.0001"
              inputMode="decimal"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              placeholder="0,00"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setCalculadoraAberta((a) => !a)}
              className="mt-1.5 inline-flex items-center gap-1 text-body font-semibold text-brand hover:underline"
            >
              <Calculator className="w-3.5 h-3.5" />
              Calcular pelo preço da embalagem
            </button>
          </div>
          <div>
            <label className={labelClass} htmlFor="produto-cliente">
              Valor repassado à cliente (por {unidade.trim() || 'unidade'})
            </label>
            <input
              id="produto-cliente"
              type="number"
              min="0"
              step="0.0001"
              inputMode="decimal"
              value={valorCliente}
              onChange={(e) => setValorCliente(e.target.value)}
              placeholder="0,00"
              className={inputClass}
            />
            {margem && (
              <p
                className={`mt-1 text-body tabular-nums ${
                  margem.valor < 0 ? 'text-danger' : 'text-gray-500'
                }`}
              >
                Margem de {formatarPrecoUnitario(margem.valor)} por {unidade.trim() || 'unidade'} (
                {margem.percentual}%)
              </p>
            )}
          </div>
        </div>

        {calculadoraAberta && (
          <div className="p-3.5 rounded-xl border border-line bg-surface space-y-3">
            <p className="text-body text-muted">
              Ex.: o frasco de 100 U custa R$ 1.200,00 → R$ 12,00 por U.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="produto-preco-embalagem">
                  Preço da embalagem
                </label>
                <input
                  id="produto-preco-embalagem"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={precoEmbalagem}
                  onChange={(e) => setPrecoEmbalagem(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="produto-unidades-embalagem">
                  {unidade.trim() || 'Unidades'} na embalagem
                </label>
                <input
                  id="produto-unidades-embalagem"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={unidadesEmbalagem}
                  onChange={(e) => setUnidadesEmbalagem(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-lg text-ink tabular-nums">
                {precoCalculado > 0
                  ? `${formatarPrecoUnitario(precoCalculado)} por ${unidade.trim() || 'unidade'}`
                  : '—'}
              </span>
              <button
                type="button"
                disabled={precoCalculado <= 0}
                onClick={() => {
                  setCusto(String(precoCalculado));
                  setCalculadoraAberta(false);
                }}
                className="min-h-[40px] px-3 rounded-lg bg-ink text-white text-body font-semibold disabled:opacity-40"
              >
                Usar este valor
              </button>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="produto-obs">
            Observações
          </label>
          <textarea
            id="produto-obs"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            className="w-full glass-input px-3 py-2 rounded-sm text-sm text-ink focus:outline-hidden resize-y"
          />
        </div>
      </form>
    </SidePanel>
  );
};
