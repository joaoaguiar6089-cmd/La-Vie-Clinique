import React, { useEffect, useState } from 'react';
import { AlertCircle, Calculator, Check, Loader2 } from 'lucide-react';
import { CaixaDoProduto, ProdutoDeEstoque } from '../../types';
import {
  UNIDADES_SUGERIDAS,
  formatarPrecoUnitario,
  margemUnitaria,
  numeroValido,
  precoPorUnidade,
  valoresPorUnidadeDaCaixa,
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
 *
 * Produto comprado em caixa ("caixa com unidades") vai além da conta avulsa: digitam-se a
 * quantidade e os dois valores da caixa, que ficam gravados, e o custo e o repasse por unidade
 * saem da divisão — a caixa de 5 frascos por R$ 500 dá R$ 100 por frasco.
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
  const [porCaixa, setPorCaixa] = useState(false);
  const [unidadesNaCaixa, setUnidadesNaCaixa] = useState('');
  const [custoDaCaixa, setCustoDaCaixa] = useState('');
  const [valorClienteDaCaixa, setValorClienteDaCaixa] = useState('');
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
    setPorCaixa(!!produto?.caixa);
    setUnidadesNaCaixa(paraCampo(produto?.caixa?.unidades));
    setCustoDaCaixa(paraCampo(produto?.caixa?.custo));
    setValorClienteDaCaixa(paraCampo(produto?.caixa?.valorCliente));
    setSalvando(false);
    setErro(null);
  }, [aberto, produto?.id, nomeInicial]);

  const nomeDaUnidade = unidade.trim() || 'unidade';
  const caixa: CaixaDoProduto = {
    unidades: numeroValido(unidadesNaCaixa),
    custo: numeroValido(custoDaCaixa),
    valorCliente: numeroValido(valorClienteDaCaixa),
  };
  const daCaixa = valoresPorUnidadeDaCaixa(caixa);
  /** O que vai ser gravado por unidade — digitado, ou dividido da caixa. */
  const porUnidade = porCaixa
    ? daCaixa
    : { custoUnitario: numeroValido(custo), valorCliente: numeroValido(valorCliente) };
  const margem = margemUnitaria(porUnidade);
  const precoCalculado = precoPorUnidade(numeroValido(precoEmbalagem), numeroValido(unidadesEmbalagem));

  const linhaDaMargem = margem && (
    <p
      className={`mt-1 text-body tabular-nums ${
        margem.valor < 0 ? 'text-danger' : 'text-gray-500'
      }`}
    >
      Margem de {formatarPrecoUnitario(margem.valor)} por {nomeDaUnidade} ({margem.percentual}%)
    </p>
  );

  const alternarCaixa = (marcada: boolean) => {
    // Desmarcar leva a divisão para os campos por unidade: o produto continua valendo o mesmo
    // até alguém mudar os números.
    if (!marcada && caixa.unidades) {
      setCusto(paraCampo(daCaixa.custoUnitario));
      setValorCliente(paraCampo(daCaixa.valorCliente));
    }
    setCalculadoraAberta(false);
    setPorCaixa(marcada);
  };

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
    if (porCaixa && !caixa.unidades) {
      setErro('Informe quantas unidades vêm na caixa.');
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
      custoUnitario: porUnidade.custoUnitario,
      valorCliente: porUnidade.valorCliente,
      caixa: porCaixa ? caixa : undefined,
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
              Como ele é usado no atendimento — é por esta unidade que o custo e o repasse são
              calculados.
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

        <label className="flex items-start gap-2 p-3 rounded-xl border border-line bg-surface cursor-pointer">
          <input
            type="checkbox"
            checked={porCaixa}
            onChange={(e) => alternarCaixa(e.target.checked)}
            className="w-4 h-4 accent-brand mt-0.5"
          />
          <span className="text-body text-ink">
            Caixa com unidades
            <span className="block text-muted">
              Comprado em caixa — ex.: 5 frascos por R$ 500,00. Você digita os valores da caixa e o
              sistema calcula o custo e o repasse por {nomeDaUnidade}.
            </span>
          </span>
        </label>

        {porCaixa ? (
          <>
            <div className="sm:w-1/2 sm:pr-2">
              <label className={labelClass} htmlFor="produto-caixa-unidades">
                Quantidade na caixa ({nomeDaUnidade}) *
              </label>
              <input
                id="produto-caixa-unidades"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={unidadesNaCaixa}
                onChange={(e) => setUnidadesNaCaixa(e.target.value)}
                placeholder="Ex: 5"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="produto-caixa-custo">
                  Valor comprado (por caixa)
                </label>
                <input
                  id="produto-caixa-custo"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={custoDaCaixa}
                  onChange={(e) => setCustoDaCaixa(e.target.value)}
                  placeholder="0,00"
                  className={inputClass}
                />
                {daCaixa.custoUnitario > 0 && (
                  <p className="mt-1 text-body text-ink tabular-nums">
                    = {formatarPrecoUnitario(daCaixa.custoUnitario)} por {nomeDaUnidade}
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass} htmlFor="produto-caixa-cliente">
                  Valor repassado à cliente (por caixa)
                </label>
                <input
                  id="produto-caixa-cliente"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={valorClienteDaCaixa}
                  onChange={(e) => setValorClienteDaCaixa(e.target.value)}
                  placeholder="0,00"
                  className={inputClass}
                />
                {daCaixa.valorCliente > 0 && (
                  <p className="mt-1 text-body text-ink tabular-nums">
                    = {formatarPrecoUnitario(daCaixa.valorCliente)} por {nomeDaUnidade}
                  </p>
                )}
                {linhaDaMargem}
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="produto-custo">
                Valor comprado (por {nomeDaUnidade})
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
                Valor repassado à cliente (por {nomeDaUnidade})
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
              {linhaDaMargem}
            </div>
          </div>
        )}

        {!porCaixa && calculadoraAberta && (
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
                  ? `${formatarPrecoUnitario(precoCalculado)} por ${nomeDaUnidade}`
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
