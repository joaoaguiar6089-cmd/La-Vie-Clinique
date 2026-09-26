import React, { useEffect, useState } from 'react';
import { AlertCircle, Calculator, Loader2 } from 'lucide-react';
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
import {
  AvisoTinta,
  BotaoPrincipal,
  CampoTinta,
  INPUT_TINTA,
  RotuloTinta,
  Segmentado,
} from '../common/Tinta';

interface ProdutoFormPanelProps {
  aberto: boolean;
  onFechar: () => void;
  /** Produto sendo editado; `null` = novo. */
  produto: ProdutoDeEstoque | null;
  /** Nome já digitado em outro lugar — "Outro material…" do atendimento, por exemplo. */
  nomeInicial?: string;
  onSalvo?: (produto: ProdutoDeEstoque) => void;
}

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

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault();
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

  /** A unidade escolhida é uma das sugeridas — senão o campo "outra" fica aberto com ela. */
  const unidadeSugerida = UNIDADES_SUGERIDAS.includes(unidade.trim());
  const [outraUnidade, setOutraUnidade] = useState(false);
  useEffect(() => {
    if (aberto) setOutraUnidade(!!produto?.unidade && !UNIDADES_SUGERIDAS.includes(produto.unidade));
  }, [aberto, produto?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prefixoReais = <span className="text-[14px] font-semibold text-ink-soft shrink-0">R$</span>;

  /* A margem calculada ao vivo, no cabeçalho preto: é a pergunta que o formulário responde. */
  const cabecalho = (
    <div className="flex items-end justify-between gap-3 rounded-2xl bg-cream/8 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-brand-light">Margem por {nomeDaUnidade}</p>
        <p className="text-[22px] font-bold text-white tabular-nums leading-tight truncate">
          {margem ? formatarPrecoUnitario(margem.valor) : '—'}
        </p>
      </div>
      <p
        className={`text-[30px] font-bold tabular-nums leading-none shrink-0 ${
          !margem ? 'text-cream/40' : margem.valor < 0 ? 'text-[#FECACA]' : 'text-ok-claro'
        }`}
      >
        {margem ? `${margem.percentual}%` : '—'}
      </p>
    </div>
  );

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo={produto ? 'Editar produto' : 'Novo produto'}
      sobretitulo="Estoque"
      cabecalho={cabecalho}
      bloqueado={salvando}
      rodape={
        <BotaoPrincipal type="submit" form="form-produto" disabled={salvando}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
          {produto ? 'Salvar alterações' : 'Salvar produto'}
        </BotaoPrincipal>
      }
    >
      <form id="form-produto" onSubmit={salvar} className="px-5 sm:px-6 py-5 flex flex-col gap-3.5">
        {erro && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {erro}
          </AvisoTinta>
        )}

        <div className="grid grid-cols-[1.3fr_1fr] gap-2.5">
          <CampoTinta rotulo="Nome" htmlFor="produto-nome">
            <input
              id="produto-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Toxina 100 U"
              autoComplete="off"
              className={INPUT_TINTA}
            />
          </CampoTinta>
          <CampoTinta rotulo="Marca" htmlFor="produto-marca">
            <input
              id="produto-marca"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Fornecedor"
              autoComplete="off"
              className={INPUT_TINTA}
            />
          </CampoTinta>
        </div>

        <div>
          <RotuloTinta>Unidade de uso</RotuloTinta>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unidade de uso">
            {UNIDADES_SUGERIDAS.map((u) => {
              const ativa = !outraUnidade && unidade.trim() === u;
              return (
                <button
                  key={u}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => {
                    setOutraUnidade(false);
                    setUnidade(u);
                  }}
                  className={`h-10 px-4 rounded-full text-[14px] font-semibold transition-colors ${
                    ativa ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
                  }`}
                >
                  {u}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={outraUnidade || (!unidadeSugerida && !!unidade.trim())}
              onClick={() => {
                setOutraUnidade(true);
                if (unidadeSugerida) setUnidade('');
              }}
              className={`h-10 px-4 rounded-full text-[14px] font-semibold transition-colors ${
                outraUnidade || (!unidadeSugerida && !!unidade.trim())
                  ? 'bg-ink text-white'
                  : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
              }`}
            >
              Outra…
            </button>
          </div>
          {(outraUnidade || (!unidadeSugerida && !!unidade.trim())) && (
            <CampoTinta rotulo="Qual unidade?" htmlFor="produto-unidade" className="mt-2.5">
              <input
                id="produto-unidade"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="Ex: bisnaga, cápsula"
                autoFocus
                autoComplete="off"
                className={INPUT_TINTA}
              />
            </CampoTinta>
          )}
          <p className="mt-1.5 px-1 text-[13px] text-ink-soft leading-snug">
            Como ele é usado no atendimento — é por esta unidade que o custo e o repasse são
            calculados.
          </p>
        </div>

        {/* Comprado em caixa ou por unidade: é uma troca de vista, não uma opção a mais. */}
        <Segmentado
          cheio
          rotulo="Como o produto é comprado"
          opcoes={[
            { id: 'unidade', rotulo: 'Por unidade' },
            { id: 'caixa', rotulo: 'Por caixa' },
          ]}
          valor={porCaixa ? 'caixa' : 'unidade'}
          onMudar={(v) => alternarCaixa(v === 'caixa')}
        />

        {porCaixa ? (
          <>
            <p className="-mt-1 px-1 text-[13px] text-ink-soft leading-snug">
              Ex.: 5 frascos por R$ 500,00. Você digita os valores da caixa e o sistema calcula o
              custo e o repasse por {nomeDaUnidade}.
            </p>
            <CampoTinta rotulo={`Quantidade na caixa (${nomeDaUnidade})`} htmlFor="produto-caixa-unidades">
              <input
                id="produto-caixa-unidades"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={unidadesNaCaixa}
                onChange={(e) => setUnidadesNaCaixa(e.target.value)}
                placeholder="Ex: 5"
                className={`${INPUT_TINTA} tabular-nums`}
              />
            </CampoTinta>
            <div className="grid grid-cols-2 gap-2.5">
              <CampoTinta
                rotulo="Comprado · caixa"
                htmlFor="produto-caixa-custo"
                ajuda={
                  daCaixa.custoUnitario > 0
                    ? `= ${formatarPrecoUnitario(daCaixa.custoUnitario)} por ${nomeDaUnidade}`
                    : undefined
                }
                prefixo={prefixoReais}
              >
                <input
                  id="produto-caixa-custo"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={custoDaCaixa}
                  onChange={(e) => setCustoDaCaixa(e.target.value)}
                  placeholder="0,00"
                  className={`${INPUT_TINTA} text-[18px] font-bold tabular-nums`}
                />
              </CampoTinta>
              <CampoTinta
                rotulo="Repassado · caixa"
                htmlFor="produto-caixa-cliente"
                ajuda={
                  daCaixa.valorCliente > 0
                    ? `= ${formatarPrecoUnitario(daCaixa.valorCliente)} por ${nomeDaUnidade}`
                    : undefined
                }
                prefixo={prefixoReais}
              >
                <input
                  id="produto-caixa-cliente"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={valorClienteDaCaixa}
                  onChange={(e) => setValorClienteDaCaixa(e.target.value)}
                  placeholder="0,00"
                  className={`${INPUT_TINTA} text-[18px] font-bold tabular-nums`}
                />
              </CampoTinta>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <CampoTinta rotulo={`Comprado · por ${nomeDaUnidade}`} htmlFor="produto-custo" prefixo={prefixoReais}>
                <input
                  id="produto-custo"
                  type="number"
                  min="0"
                  step="0.0001"
                  inputMode="decimal"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  placeholder="0,00"
                  className={`${INPUT_TINTA} text-[18px] font-bold tabular-nums`}
                />
              </CampoTinta>
              <CampoTinta
                rotulo={`Repassado · por ${nomeDaUnidade}`}
                htmlFor="produto-cliente"
                prefixo={prefixoReais}
              >
                <input
                  id="produto-cliente"
                  type="number"
                  min="0"
                  step="0.0001"
                  inputMode="decimal"
                  value={valorCliente}
                  onChange={(e) => setValorCliente(e.target.value)}
                  placeholder="0,00"
                  className={`${INPUT_TINTA} text-[18px] font-bold tabular-nums`}
                />
              </CampoTinta>
            </div>
            <button
              type="button"
              onClick={() => setCalculadoraAberta((a) => !a)}
              className="self-start -mt-1 inline-flex items-center gap-1.5 min-h-[40px] px-1 text-[14px] font-semibold text-ink underline underline-offset-2"
            >
              <Calculator className="w-4 h-4" />
              Calcular pelo preço da embalagem
            </button>
          </>
        )}

        {!porCaixa && calculadoraAberta && (
          <div className="p-4 rounded-2xl bg-card border border-ink/10 flex flex-col gap-3">
            <p className="text-[13px] text-ink-soft">
              Ex.: o frasco de 100 U custa R$ 1.200,00 → R$ 12,00 por U.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <CampoTinta rotulo="Preço da embalagem" htmlFor="produto-preco-embalagem" prefixo={prefixoReais}>
                <input
                  id="produto-preco-embalagem"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={precoEmbalagem}
                  onChange={(e) => setPrecoEmbalagem(e.target.value)}
                  className={`${INPUT_TINTA} tabular-nums`}
                />
              </CampoTinta>
              <CampoTinta rotulo={`${unidade.trim() || 'Unidades'} na embalagem`} htmlFor="produto-unidades-embalagem">
                <input
                  id="produto-unidades-embalagem"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={unidadesEmbalagem}
                  onChange={(e) => setUnidadesEmbalagem(e.target.value)}
                  className={`${INPUT_TINTA} tabular-nums`}
                />
              </CampoTinta>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-bold text-ink tabular-nums">
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
                className="h-10 px-4 rounded-full bg-ink text-white text-[14px] font-semibold disabled:opacity-40"
              >
                Usar este valor
              </button>
            </div>
          </div>
        )}

        <CampoTinta rotulo="Observações" htmlFor="produto-obs">
          <textarea
            id="produto-obs"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            placeholder="Lote, validade, fornecedor"
            className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
          />
        </CampoTinta>
      </form>
    </SidePanel>
  );
};
