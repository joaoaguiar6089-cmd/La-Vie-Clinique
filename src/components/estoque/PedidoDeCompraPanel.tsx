import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ClipboardPaste, Copy, Download, FileUp, Loader2, Paperclip, Plus, Sparkles, X } from 'lucide-react';
import { ItemDoPedido, PedidoDeCompra, ProdutoDeEstoque } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  UNIDADES_SUGERIDAS,
  formatarPrecoUnitario,
  numeroValido,
  produtosAtivos,
  quantidadeDoProduto,
} from '../../utils/estoque';
import {
  COLUNAS_DA_PLANILHA,
  LinhaDaPlanilha,
  PEDIDO_PARA_OUTRA_IA,
  casarProduto,
  custoPorUnidadeDeUso,
  lerPlanilha,
  loteDoItem,
  modeloDaPlanilha,
  pareceEmbalagem,
  produtoComCustoDaCompra,
  totalDoPedido,
  unidadesDeUso,
} from '../../utils/lotes';
import { chaveDeNome } from '../../utils/templateMatching';
import { hojeISO } from '../../utils/attendances';
import { baixarArquivo } from '../../utils/exportHelpers';
import {
  COMPROVANTE_TIPOS_ACEITOS,
  apagarComprovante,
  enviarAnexoDoPedido,
  problemaNoArquivoDeComprovante,
} from '../../services/comprovantes';
import { registrarPedidoDeCompra } from '../../services/databaseService';
import { lerPedidoComIa } from '../../services/leituraDePedidoApi';
import { SidePanel } from '../common/SidePanel';
import { AvisoTinta, BotaoPrincipal, CampoTinta, INPUT_TINTA, SetaDoSelect } from '../common/Tinta';

const NOVO = '__novo__';

const novoId = (prefixo: string) =>
  `${prefixo}-${
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }`;

/** Uma linha do pedido em edição — os números como texto, para o campo não travar no zero. */
export interface LinhaDoPedido {
  id: string;
  /** O produto do cadastro, `NOVO` para cadastrar um, ou `''` enquanto ninguém escolheu. */
  produtoId: string;
  novo: { nome: string; marca: string; tipo: string; unidade: string; unidadesPorEmbalagem: string };
  quantidade: string;
  porEmbalagem: boolean;
  valorUnitario: string;
  lote: string;
  validade: string;
  /** O que foi lido no pedido (planilha ou IA), para quem confere saber de onde a linha veio. */
  lido?: { produto: string; marca?: string; unidade?: string; sugerido: boolean };
}

const linhaEmBranco = (): LinhaDoPedido => ({
  id: novoId('linha'),
  produtoId: '',
  novo: { nome: '', marca: '', tipo: '', unidade: 'un', unidadesPorEmbalagem: '' },
  quantidade: '',
  porEmbalagem: false,
  valorUnitario: '',
  lote: '',
  validade: '',
});

const comoTexto = (n?: number) => (n === undefined || n === null || !Number.isFinite(n) || n === 0 ? '' : String(n));

/**
 * Uma linha lida (da planilha ou da IA) virando linha do pedido: o produto do cadastro que a IA
 * reconheceu, ou o que mais se parece com o nome, ou um produto novo já preenchido com o que foi lido.
 */
export const linhaDoQueFoiLido = (
  l: Omit<LinhaDaPlanilha, 'linha'>,
  produtos: ProdutoDeEstoque[],
  produtoIdReconhecido?: string
): LinhaDoPedido => {
  const reconhecido = produtoIdReconhecido ? produtos.find((p) => p.id === produtoIdReconhecido && !p.arquivado) : undefined;
  const produto = reconhecido || casarProduto(l.produto, l.marca, produtos);
  return {
    id: novoId('linha'),
    produtoId: produto ? produto.id : NOVO,
    novo: {
      nome: l.produto,
      marca: l.marca || '',
      tipo: l.tipo || '',
      unidade: l.unidade || 'un',
      unidadesPorEmbalagem: '',
    },
    quantidade: comoTexto(l.quantidade),
    porEmbalagem: produto ? pareceEmbalagem(l.unidade, produto) : false,
    valorUnitario: comoTexto(l.valorUnitario),
    lote: l.lote || '',
    validade: l.validade || '',
    lido: { produto: l.produto, marca: l.marca, unidade: l.unidade, sugerido: !!produto },
  };
};

interface PedidoDeCompraPanelProps {
  aberto: boolean;
  onFechar: () => void;
  /** "Lançar o estoque atual": o que já está na prateleira, sem fornecedor nem nota. */
  estoqueInicial?: boolean;
  produtos: ProdutoDeEstoque[];
  tiposSugeridos: string[];
  autor?: { uid: string; nome: string } | null;
  onRegistrado?: (pedido: PedidoDeCompra) => void;
}

/**
 * O pedido de compra: fornecedor, data, a foto ou o PDF e os itens — cada um vira um lote no
 * estoque, e o produto passa a custar o desta compra.
 *
 * Os itens se digitam aqui ou chegam da planilha: colada do Excel/Google Planilhas ou num .csv,
 * com as colunas do modelo. Cada linha lida é casada com um produto do cadastro pelo nome (a
 * sugestão vem marcada para conferir); o que não casa entra como produto novo, já preenchido.
 */
export const PedidoDeCompraPanel: React.FC<PedidoDeCompraPanelProps> = ({
  aberto,
  onFechar,
  estoqueInicial = false,
  produtos,
  tiposSugeridos,
  autor,
  onRegistrado,
}) => {
  const [fornecedor, setFornecedor] = useState('');
  const [dataCompra, setDataCompra] = useState(hojeISO());
  const [numero, setNumero] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<LinhaDoPedido[]>([linhaEmBranco()]);
  const [planilhaAberta, setPlanilhaAberta] = useState(false);
  const [textoDaPlanilha, setTextoDaPlanilha] = useState('');
  const [avisosDaPlanilha, setAvisosDaPlanilha] = useState<string[]>([]);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  /** O resultado da última leitura pela IA — para lembrar de conferir. */
  const [lido, setLido] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setFornecedor('');
    setDataCompra(hojeISO());
    setNumero('');
    setArquivo(null);
    setLinhas([linhaEmBranco()]);
    setPlanilhaAberta(false);
    setTextoDaPlanilha('');
    setAvisosDaPlanilha([]);
    setErro(null);
    setSalvando(false);
    setLendo(false);
    setLido(null);
  }, [aberto, estoqueInicial]);

  const ativos = useMemo(() => produtosAtivos(produtos), [produtos]);
  const produtoDa = (l: LinhaDoPedido) => (l.produtoId && l.produtoId !== NOVO ? produtos.find((p) => p.id === l.produtoId) : undefined);
  /** Quantas unidades de uso vêm numa embalagem — do cadastro, ou do produto novo. */
  const embalagemDa = (l: LinhaDoPedido): number =>
    l.produtoId === NOVO ? numeroValido(l.novo.unidadesPorEmbalagem) : numeroValido(produtoDa(l)?.caixa?.unidades);
  const unidadeDa = (l: LinhaDoPedido): string => (l.produtoId === NOVO ? l.novo.unidade.trim() || 'un' : produtoDa(l)?.unidade || 'un');

  const total = totalDoPedido(linhas.map((l) => ({ quantidade: numeroValido(l.quantidade), valorUnitario: numeroValido(l.valorUnitario) })));
  const comItem = linhas.filter((l) => l.produtoId || numeroValido(l.quantidade) > 0);

  const mudar = (id: string, patch: Partial<LinhaDoPedido>) =>
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const mudarNovo = (id: string, patch: Partial<LinhaDoPedido['novo']>) =>
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, novo: { ...l.novo, ...patch } } : l)));

  /** Acrescenta linhas lidas — tomando o lugar da linha em branco do começo, se ela ainda estiver lá. */
  const adicionarLinhas = (novas: LinhaDoPedido[]) => {
    if (novas.length === 0) return;
    setLinhas((atual) => {
      const preenchidas = atual.filter((l) => l.produtoId || l.quantidade || l.valorUnitario || l.novo.nome);
      return [...preenchidas, ...novas];
    });
    setErro(null);
  };

  const lerTexto = (texto: string) => {
    const { linhas: lidas, avisos } = lerPlanilha(texto);
    setAvisosDaPlanilha(avisos);
    if (lidas.length > 0) {
      adicionarLinhas(lidas.map((l) => linhaDoQueFoiLido(l, produtos)));
      setTextoDaPlanilha('');
      setPlanilhaAberta(false);
    }
  };

  /**
   * A IA lê a foto ou o PDF anexado. Os itens entram como os da planilha — o produto reconhecido
   * vem escolhido, e o resto é novo —, e o fornecedor, o número e a data preenchem o que estiver
   * em branco. Nada é gravado: quem registra é a pessoa, depois de conferir.
   */
  const lerComIa = async () => {
    if (!arquivo) return;
    setLendo(true);
    setErro(null);
    setLido(null);
    try {
      const leitura = await lerPedidoComIa(arquivo, produtos);
      if (leitura.itens.length === 0) {
        setErro('A IA não encontrou itens neste arquivo. Tente uma foto mais nítida, ou use a planilha.');
        return;
      }
      adicionarLinhas(leitura.itens.map((item) => linhaDoQueFoiLido(item, produtos, item.produtoId)));
      if (!estoqueInicial && leitura.fornecedor && !fornecedor.trim()) setFornecedor(leitura.fornecedor);
      if (!estoqueInicial && leitura.numero && !numero.trim()) setNumero(leitura.numero);
      if (leitura.dataCompra && leitura.dataCompra <= hojeISO()) setDataCompra(leitura.dataCompra);
      const reconhecidos = leitura.itens.filter((i) => i.produtoId).length;
      setLido(
        `A IA leu ${leitura.itens.length} ${leitura.itens.length === 1 ? 'item' : 'itens'}` +
          (reconhecidos ? `, ${reconhecidos} já do cadastro` : '') +
          '. Confira o produto, a quantidade, o valor, o lote e a validade de cada um antes de registrar.'
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  };

  const escolherArquivo = (f: File | null) => {
    if (!f) return;
    const problema = problemaNoArquivoDeComprovante(f);
    if (problema) {
      setErro(problema.replace('do comprovante', 'do pedido'));
      return;
    }
    setErro(null);
    setArquivo(f);
  };

  const copiarPedidoParaIa = async () => {
    try {
      await navigator.clipboard.writeText(PEDIDO_PARA_OUTRA_IA);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie à mão.');
    }
  };

  const registrar = async () => {
    const preenchidas = linhas.filter((l) => l.produtoId || numeroValido(l.quantidade) > 0 || l.novo.nome.trim());
    if (preenchidas.length === 0) {
      setErro('Acrescente ao menos um item.');
      return;
    }
    for (const [i, l] of preenchidas.entries()) {
      const n = i + 1;
      if (!l.produtoId) return setErro(`Item ${n}: escolha o produto ou cadastre um novo.`);
      if (l.produtoId === NOVO && !l.novo.nome.trim()) return setErro(`Item ${n}: dê o nome do produto novo.`);
      if (numeroValido(l.quantidade) <= 0) return setErro(`Item ${n}: informe a quantidade.`);
      if (l.porEmbalagem && embalagemDa(l) <= 0) return setErro(`Item ${n}: diga quantas unidades vêm em cada embalagem.`);
    }
    setSalvando(true);
    setErro(null);
    const agora = new Date().toISOString();
    const pedidoId = novoId('pedido');
    let anexo: PedidoDeCompra['anexo'];
    try {
      if (arquivo) anexo = await enviarAnexoDoPedido(pedidoId, arquivo);

      // Produtos novos: um por nome e marca — duas linhas do mesmo produto novo não viram dois.
      const novos = new Map<string, ProdutoDeEstoque>();
      const itens: ItemDoPedido[] = preenchidas.map((l) => {
        const porEmbalagem = l.porEmbalagem && embalagemDa(l) > 0;
        const unidadesPorEmbalagem = porEmbalagem ? embalagemDa(l) : undefined;
        const custo = custoPorUnidadeDeUso(numeroValido(l.valorUnitario), porEmbalagem, unidadesPorEmbalagem);
        let produto = produtoDa(l);
        if (l.produtoId === NOVO) {
          const chave = `${chaveDeNome(l.novo.nome)}|${chaveDeNome(l.novo.marca)}`;
          produto = novos.get(chave);
          if (!produto) {
            const naCaixa = numeroValido(l.novo.unidadesPorEmbalagem);
            produto = {
              id: novoId('prod'),
              nome: l.novo.nome.trim(),
              unidade: l.novo.unidade.trim() || 'un',
              custoUnitario: custo,
              valorCliente: 0,
              createdAt: agora,
            };
            if (l.novo.marca.trim()) produto.marca = l.novo.marca.trim();
            if (l.novo.tipo.trim()) produto.tipo = l.novo.tipo.trim();
            if (naCaixa > 0) produto.caixa = { unidades: naCaixa, custo: Math.round(custo * naCaixa * 100) / 100, valorCliente: 0 };
            novos.set(chave, produto);
          }
        }
        const item: ItemDoPedido = {
          produtoId: produto!.id,
          nome: produto!.nome,
          quantidade: numeroValido(l.quantidade),
          porEmbalagem,
          valorUnitario: numeroValido(l.valorUnitario),
          loteId: novoId('lote'),
        };
        if (produto!.marca) item.marca = produto!.marca;
        if (unidadesPorEmbalagem) item.unidadesPorEmbalagem = unidadesPorEmbalagem;
        if (l.lote.trim()) item.lote = l.lote.trim();
        if (l.validade) item.validade = l.validade;
        return item;
      });

      const pedido: PedidoDeCompra = {
        id: pedidoId,
        dataCompra,
        itens,
        total: totalDoPedido(itens),
        createdAt: agora,
      };
      if (!estoqueInicial && fornecedor.trim()) pedido.fornecedor = fornecedor.trim();
      if (!estoqueInicial && numero.trim()) pedido.numero = numero.trim();
      if (estoqueInicial) pedido.estoqueInicial = true;
      if (anexo) pedido.anexo = anexo;
      if (autor) {
        pedido.criadoPorUid = autor.uid;
        pedido.criadoPorNome = autor.nome;
      }

      // O custo de cada produto que já existia passa a ser o desta compra (a última linha dele vale).
      const comCusto = new Map<string, ProdutoDeEstoque>();
      itens.forEach((item) => {
        const existente = produtos.find((p) => p.id === item.produtoId);
        if (!existente) return;
        const custo = custoPorUnidadeDeUso(item.valorUnitario, item.porEmbalagem, item.unidadesPorEmbalagem);
        if (custo > 0) comCusto.set(existente.id, produtoComCustoDaCompra(comCusto.get(existente.id) || existente, custo));
      });

      await registrarPedidoDeCompra({
        pedido,
        lotes: itens.map((item) => loteDoItem(item, pedido, agora)),
        produtosNovos: [...novos.values()],
        produtosComCusto: [...comCusto.values()],
      });
      onFechar();
      onRegistrado?.(pedido);
    } catch (e) {
      if (anexo) void apagarComprovante(anexo);
      setErro(`Não foi possível registrar: ${(e as Error).message}`);
      setSalvando(false);
    }
  };

  const titulo = estoqueInicial ? 'Estoque atual' : 'Novo pedido de compra';
  const cabecalho = (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-[12px] font-semibold text-brand-light">Total {estoqueInicial ? 'do estoque lançado' : 'do pedido'}</p>
        <p className="text-[24px] font-bold text-white tabular-nums leading-tight">{formatBRL(total)}</p>
      </div>
      <p className="text-[14px] text-cream/80">
        {comItem.length} {comItem.length === 1 ? 'item' : 'itens'}
      </p>
    </div>
  );

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      sobretitulo="Estoque · Compras"
      subtitulo={
        estoqueInicial
          ? 'O que já está na prateleira hoje, com lote e validade — cada item vira um lote.'
          : 'Cada item vira um lote no estoque, e o produto passa a custar o desta compra.'
      }
      cabecalho={cabecalho}
      formato="central"
      bloqueado={salvando}
      alterado={linhas.some((l) => l.produtoId || l.quantidade) || !!arquivo}
      rodape={
        <BotaoPrincipal onClick={registrar} disabled={salvando}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
          {salvando ? 'Registrando…' : `${estoqueInicial ? 'Lançar no estoque' : 'Registrar compra'}${total > 0 ? ` · ${formatBRL(total)}` : ''}`}
        </BotaoPrincipal>
      }
    >
      <div className="px-5 sm:px-10 py-5 sm:py-8">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-7">
          {erro && (
            <AvisoTinta tom="erro" icone={AlertCircle}>
              {erro}
            </AvisoTinta>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="font-serif-luxury text-[24px] sm:text-[26px] font-semibold text-ink">
              {estoqueInicial ? 'Data' : 'Pedido'}
            </h3>
            <div className={`grid grid-cols-1 gap-2.5 ${estoqueInicial ? 'sm:grid-cols-2 max-w-[560px]' : 'sm:grid-cols-[2fr_1fr_1fr]'}`}>
              {!estoqueInicial && (
                <CampoTinta rotulo="Fornecedor" htmlFor="pedido-fornecedor">
                  <input
                    id="pedido-fornecedor"
                    value={fornecedor}
                    onChange={(e) => setFornecedor(e.target.value)}
                    placeholder="Distribuidora"
                    autoComplete="off"
                    className={INPUT_TINTA}
                  />
                </CampoTinta>
              )}
              <CampoTinta rotulo={estoqueInicial ? 'Data da contagem' : 'Data da compra'} htmlFor="pedido-data">
                <input
                  id="pedido-data"
                  type="date"
                  value={dataCompra}
                  max={hojeISO()}
                  onChange={(e) => setDataCompra(e.target.value || hojeISO())}
                  className={`${INPUT_TINTA} min-h-[24px]`}
                />
              </CampoTinta>
              {!estoqueInicial && (
                <CampoTinta rotulo="Nº da nota (opcional)" htmlFor="pedido-numero">
                  <input
                    id="pedido-numero"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    autoComplete="off"
                    className={INPUT_TINTA}
                  />
                </CampoTinta>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border border-ink/15 text-[14px] font-semibold text-ink hover:border-ink/40 cursor-pointer transition-colors">
                <Paperclip className="w-4 h-4" />
                {arquivo ? 'Trocar a foto ou o PDF' : 'Anexar a foto ou o PDF do pedido'}
                <input
                  type="file"
                  accept={COMPROVANTE_TIPOS_ACEITOS}
                  className="sr-only"
                  onChange={(e) => {
                    escolherArquivo(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
              </label>
              {arquivo && (
                <span className="inline-flex items-center gap-1.5 text-[14px] text-ink">
                  <Check className="w-4 h-4 text-ok" />
                  {arquivo.name}
                  <button
                    type="button"
                    onClick={() => setArquivo(null)}
                    aria-label="Tirar o anexo"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-ink-soft hover:bg-line-soft"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </span>
              )}
              <span className="text-[13px] text-ink-soft">Opcional. Fica guardado com o pedido.</span>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-serif-luxury text-[24px] sm:text-[26px] font-semibold text-ink">Itens</h3>
                <p className="text-[14px] text-ink-soft leading-snug">
                  Digite, cole de uma planilha ou deixe a leitura preencher. Confira o produto de cada linha.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={lerComIa}
                  disabled={!arquivo || lendo}
                  title={arquivo ? 'Ler os itens da foto ou do PDF anexado' : 'Anexe a foto ou o PDF do pedido para ler'}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {lendo ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Sparkles className="w-[18px] h-[18px] text-brand-light" />}
                  {lendo ? 'Lendo o pedido…' : 'Ler com IA'}
                </button>
                <button
                  type="button"
                  onClick={() => setPlanilhaAberta((v) => !v)}
                  aria-expanded={planilhaAberta}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-full border border-ink/15 text-[14px] font-semibold text-ink hover:border-ink/40 transition-colors"
                >
                  <ClipboardPaste className="w-[18px] h-[18px]" />
                  Colar da planilha
                </button>
              </div>
            </div>

            {!arquivo && (
              <p className="-mt-2 text-[13px] text-ink-soft">
                Para a IA ler os itens, anexe a foto ou o PDF do pedido lá em cima.
              </p>
            )}
            {lido && (
              <AvisoTinta tom="info" icone={Sparkles}>
                {lido}
              </AvisoTinta>
            )}

            {planilhaAberta && (
              <ImportarPlanilha
                texto={textoDaPlanilha}
                onTexto={setTextoDaPlanilha}
                onLer={lerTexto}
                avisos={avisosDaPlanilha}
                copiado={copiado}
                onCopiarParaIa={copiarPedidoParaIa}
              />
            )}
            {!planilhaAberta && avisosDaPlanilha.length > 0 && (
              <AvisoTinta tom="alerta" icone={AlertCircle}>
                {avisosDaPlanilha.join(' ')}
              </AvisoTinta>
            )}

            <div className="flex flex-col gap-3">
              {linhas.map((l, n) => (
                <LinhaDoPedidoCard
                  key={l.id}
                  linha={l}
                  numero={n + 1}
                  ativos={ativos}
                  produto={produtoDa(l)}
                  embalagem={embalagemDa(l)}
                  unidade={unidadeDa(l)}
                  tiposSugeridos={tiposSugeridos}
                  onMudar={(patch) => mudar(l.id, patch)}
                  onMudarNovo={(patch) => mudarNovo(l.id, patch)}
                  onRemover={() => setLinhas((atual) => (atual.length > 1 ? atual.filter((x) => x.id !== l.id) : [linhaEmBranco()]))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLinhas((atual) => [...atual, linhaEmBranco()])}
              className="self-start inline-flex items-center gap-2 h-11 px-5 rounded-full bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors"
            >
              <Plus className="w-[18px] h-[18px]" />
              Adicionar item
            </button>
          </section>
        </div>
      </div>
    </SidePanel>
  );
};

/** Um item do pedido: o produto, a quantidade (por unidade ou por embalagem), o valor, o lote e a validade. */
const LinhaDoPedidoCard: React.FC<{
  linha: LinhaDoPedido;
  numero: number;
  ativos: ProdutoDeEstoque[];
  produto?: ProdutoDeEstoque;
  embalagem: number;
  unidade: string;
  tiposSugeridos: string[];
  onMudar: (patch: Partial<LinhaDoPedido>) => void;
  onMudarNovo: (patch: Partial<LinhaDoPedido['novo']>) => void;
  onRemover: () => void;
}> = ({ linha: l, numero, ativos, produto, embalagem, unidade, tiposSugeridos, onMudar, onMudarNovo, onRemover }) => {
  const id = `pedido-${l.id}`;
  const porEmbalagem = l.porEmbalagem && embalagem > 0;
  const entra = unidadesDeUso(numeroValido(l.quantidade), porEmbalagem, embalagem);
  const custo = custoPorUnidadeDeUso(numeroValido(l.valorUnitario), porEmbalagem, embalagem);
  const totalDaLinha = numeroValido(l.quantidade) * numeroValido(l.valorUnitario);
  const ajuda = 'mt-1 px-1 text-[13px] leading-snug text-ink-soft';

  return (
    <div className="rounded-[20px] bg-card border border-ink/10 p-4 sm:p-5 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          aria-hidden
          className="w-8 h-8 mt-0.5 sm:mt-3 shrink-0 rounded-full bg-ink text-brand-pale text-[14px] font-bold flex items-center justify-center tabular-nums"
        >
          {numero}
        </span>
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0">
          <CampoTinta rotulo="Produto" htmlFor={`${id}-produto`} sufixo={<SetaDoSelect />}>
            <select
              id={`${id}-produto`}
              value={l.produtoId}
              onChange={(e) => {
                const escolhido = ativos.find((p) => p.id === e.target.value);
                onMudar({
                  produtoId: e.target.value,
                  porEmbalagem: escolhido ? pareceEmbalagem(l.lido?.unidade, escolhido) : l.porEmbalagem,
                  lido: l.lido ? { ...l.lido, sugerido: false } : undefined,
                });
              }}
              className={`${INPUT_TINTA} appearance-none cursor-pointer truncate`}
            >
              <option value="">Escolha o produto…</option>
              {ativos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.marca ? ` · ${p.marca}` : ''}
                </option>
              ))}
              <option value={NOVO}>+ Cadastrar um produto novo</option>
            </select>
          </CampoTinta>
          {l.lido && (
            <p className={ajuda}>
              Lido no pedido: <strong className="text-ink">“{l.lido.produto}”</strong>
              {l.lido.marca ? ` · ${l.lido.marca}` : ''}
              {l.lido.sugerido && produto
                ? ' — parece ser este produto do cadastro. Confira.'
                : l.produtoId === NOVO
                  ? ' — nenhum produto do cadastro parecido; entra como novo.'
                  : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover o item ${numero}`}
          title="Remover"
          className="ml-auto sm:ml-0 sm:mt-2 w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-danger hover:bg-danger-bg transition-colors"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:pl-11">
        {l.produtoId === NOVO && (
          <div className="rounded-2xl bg-surface border border-ink/8 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <CampoTinta rotulo="Nome do produto novo" htmlFor={`${id}-nome`} className="sm:col-span-2 lg:col-span-1">
              <input id={`${id}-nome`} value={l.novo.nome} onChange={(e) => onMudarNovo({ nome: e.target.value })} className={INPUT_TINTA} />
            </CampoTinta>
            <CampoTinta rotulo="Marca" htmlFor={`${id}-marca`}>
              <input id={`${id}-marca`} value={l.novo.marca} onChange={(e) => onMudarNovo({ marca: e.target.value })} className={INPUT_TINTA} />
            </CampoTinta>
            <CampoTinta rotulo="Tipo de produto" htmlFor={`${id}-tipo`}>
              <input
                id={`${id}-tipo`}
                list={`${id}-tipos`}
                value={l.novo.tipo}
                onChange={(e) => onMudarNovo({ tipo: e.target.value })}
                placeholder="Ex: Ácido hialurônico"
                className={INPUT_TINTA}
              />
              <datalist id={`${id}-tipos`}>
                {tiposSugeridos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </CampoTinta>
            <CampoTinta rotulo="Unidade de uso" htmlFor={`${id}-unidade`}>
              <input
                id={`${id}-unidade`}
                list={`${id}-unidades`}
                value={l.novo.unidade}
                onChange={(e) => onMudarNovo({ unidade: e.target.value })}
                className={INPUT_TINTA}
              />
              <datalist id={`${id}-unidades`}>
                {UNIDADES_SUGERIDAS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </CampoTinta>
            <CampoTinta rotulo="Unidades por embalagem (opcional)" htmlFor={`${id}-por-embalagem`}>
              <input
                id={`${id}-por-embalagem`}
                type="number"
                min="0"
                inputMode="decimal"
                value={l.novo.unidadesPorEmbalagem}
                onChange={(e) => onMudarNovo({ unidadesPorEmbalagem: e.target.value })}
                placeholder="Ex: 100 U na caixa"
                className={`${INPUT_TINTA} tabular-nums`}
              />
            </CampoTinta>
          </div>
        )}

        {embalagem > 0 && (
          <div role="group" aria-label="Comprado por" className="flex flex-wrap gap-2">
            {[
              { porEmbalagem: false, rotulo: `Por ${unidade}` },
              { porEmbalagem: true, rotulo: `Por embalagem (${quantidadeDoProduto(embalagem, unidade)})` },
            ].map((o) => (
              <button
                key={String(o.porEmbalagem)}
                type="button"
                aria-pressed={porEmbalagem === o.porEmbalagem}
                onClick={() => onMudar({ porEmbalagem: o.porEmbalagem })}
                className={`h-10 px-4 rounded-full text-[14px] font-semibold transition-colors ${
                  porEmbalagem === o.porEmbalagem ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
                }`}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <CampoTinta rotulo={porEmbalagem ? 'Embalagens' : `Quantidade (${unidade})`} htmlFor={`${id}-qtd`}>
            <input
              id={`${id}-qtd`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={l.quantidade}
              onChange={(e) => onMudar({ quantidade: e.target.value })}
              className={`${INPUT_TINTA} tabular-nums`}
            />
          </CampoTinta>
          <CampoTinta
            rotulo={porEmbalagem ? 'Valor da embalagem' : `Valor por ${unidade}`}
            htmlFor={`${id}-valor`}
            prefixo={<span className="text-[16px] font-semibold text-ink-soft shrink-0">R$</span>}
          >
            <input
              id={`${id}-valor`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={l.valorUnitario}
              onChange={(e) => onMudar({ valorUnitario: e.target.value })}
              placeholder="0,00"
              className={`${INPUT_TINTA} tabular-nums`}
            />
          </CampoTinta>
          <CampoTinta rotulo="Lote" htmlFor={`${id}-lote`}>
            <input id={`${id}-lote`} value={l.lote} onChange={(e) => onMudar({ lote: e.target.value })} className={INPUT_TINTA} />
          </CampoTinta>
          <CampoTinta rotulo="Validade" htmlFor={`${id}-validade`}>
            <input
              id={`${id}-validade`}
              type="date"
              value={l.validade}
              onChange={(e) => onMudar({ validade: e.target.value })}
              className={`${INPUT_TINTA} min-h-[24px]`}
            />
          </CampoTinta>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-3 border-t border-ink/8 tabular-nums">
          <span className="text-[14px] text-ink-soft">
            {entra > 0 ? (
              <>
                Entra no estoque: <strong className="text-ink">{quantidadeDoProduto(entra, unidade)}</strong>
                {custo > 0 && <> · {formatarPrecoUnitario(custo)} por {unidade}</>}
              </>
            ) : (
              'Informe a quantidade'
            )}
          </span>
          <span className="text-[18px] font-bold text-ink">{formatBRL(totalDaLinha)}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Colar da planilha, ou abrir o .csv — e, embaixo, como a planilha precisa estar: as colunas do
 * modelo, o modelo para baixar e o texto pronto para pedir a outra IA que converta o pedido.
 */
const ImportarPlanilha: React.FC<{
  texto: string;
  onTexto: (t: string) => void;
  onLer: (t: string) => void;
  avisos: string[];
  copiado: boolean;
  onCopiarParaIa: () => void;
}> = ({ texto, onTexto, onLer, avisos, copiado, onCopiarParaIa }) => {
  const botao =
    'inline-flex items-center gap-2 h-10 px-4 rounded-full border border-ink/15 text-[14px] font-semibold text-ink hover:border-ink/40 transition-colors';
  return (
    <div className="rounded-[20px] bg-card border border-ink/10 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6">
      <div className="flex flex-col gap-3">
        <CampoTinta rotulo="Cole aqui as linhas copiadas da planilha" htmlFor="pedido-planilha">
          <textarea
            id="pedido-planilha"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            rows={7}
            placeholder={'Produto\tMarca\tTipo\tQuantidade\t…'}
            className={`${INPUT_TINTA} resize-y leading-snug font-medium font-mono text-[14px]`}
          />
        </CampoTinta>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onLer(texto)}
            disabled={!texto.trim()}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-ink text-white text-[14px] font-semibold disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            Ler as linhas
          </button>
          <label className={`${botao} cursor-pointer`}>
            <FileUp className="w-4 h-4" />
            Abrir um .csv
            <input
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onLer(await f.text());
              }}
            />
          </label>
        </div>
        {avisos.length > 0 && (
          <AvisoTinta tom="alerta" icone={AlertCircle}>
            {avisos.join(' ')}
          </AvisoTinta>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[16px] font-bold text-ink">Como a planilha precisa estar</p>
          <p className="text-[13px] text-ink-soft leading-snug mt-0.5">
            Uma linha por produto, com estas colunas. Com a linha de títulos, a ordem tanto faz; sem ela, use esta ordem.
          </p>
        </div>
        <ol className="rounded-2xl border border-ink/10 divide-y divide-ink/8 overflow-hidden text-[14px]">
          {COLUNAS_DA_PLANILHA.map((c, i) => (
            <li key={c.id} className="flex items-baseline gap-3 px-3 py-2">
              <span className="w-5 shrink-0 text-ink-soft tabular-nums">{i + 1}</span>
              <span className="w-[110px] shrink-0 font-semibold text-ink">
                {c.titulo}
                {c.obrigatoria && <span className="text-danger"> *</span>}
              </span>
              <span className="min-w-0 text-ink-soft truncate">{c.exemplo}</span>
            </li>
          ))}
        </ol>
        <p className="text-[13px] text-ink-soft">
          <span className="text-danger">*</span> obrigatória. Números com vírgula nos centavos; validade em dd/mm/aaaa (ou mm/aaaa).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => baixarArquivo(new Blob([`﻿${modeloDaPlanilha()}\n`], { type: 'text/csv;charset=utf-8' }), 'modelo-pedido-de-compra.csv')}
            className={botao}
          >
            <Download className="w-4 h-4" />
            Baixar o modelo
          </button>
          <button type="button" onClick={onCopiarParaIa} className={botao}>
            {copiado ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
            {copiado ? 'Copiado' : 'Copiar o pedido para outra IA'}
          </button>
        </div>
        <p className="text-[13px] text-ink-soft leading-snug">
          Tem só a foto ou o PDF? Mande para uma IA (ChatGPT, Gemini…) com o texto copiado acima, copie a tabela que ela
          devolver e cole aqui.
        </p>
      </div>
    </div>
  );
};
