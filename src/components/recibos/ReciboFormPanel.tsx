import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import {
  ClinicProfile,
  FormaDoRecibo,
  Patient,
  Procedure,
  Quote,
  QuoteComprovante,
  Recibo,
  ReciboDraft,
  ReciboItem,
} from '../../types';
import { formatBRL, formatCpf } from '../../utils/formatters';
import { hojeISO } from '../../utils/attendances';
import {
  MAXIMO_DE_ITENS,
  PARCELAS_MAXIMAS,
  isoParaDia,
  itensDoOrcamento,
  itensDoRecibo,
  montarClinicaDoRecibo,
  pagamentosSugeridos,
  parcelasDoRecibo,
} from '../../utils/recibos';
import { sessoesDoProcedimento } from '../../utils/quoteFactory';
import {
  apagarComprovante,
  enviarComprovanteDoRecibo,
  problemaNoArquivoDeComprovante,
} from '../../services/comprovantes';
import {
  atualizarRecibo,
  criarRecibo,
  marcarQuoteComoPago,
  savePatient,
} from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';
import {
  AvisoTinta,
  BotaoPrincipal,
  CampoTinta,
  INPUT_TINTA,
  PilulasDeEscolha,
  RotuloTinta,
  Segmentado,
  SetaDoSelect,
} from '../common/Tinta';
import { PatientSearchSelect } from '../quotes/PatientSearchSelect';
import { ComprovanteAnexado, EscolhaDeComprovante } from '../quotes/CampoDeComprovante';
import { ProcedureSearchAdd } from '../quotes/ProcedureSearchAdd';

const FORMAS: { id: FormaDoRecibo; rotulo: string }[] = [
  { id: 'pix', rotulo: 'Pix' },
  { id: 'debito', rotulo: 'Cartão de débito' },
  { id: 'credito', rotulo: 'Cartão de crédito' },
  { id: 'dinheiro', rotulo: 'Dinheiro' },
];

/** "2026-10-15" → o ISO do meio-dia local desse dia — o formato de `Quote.pagoEm`. */
const diaParaISO = (dia: string): string => new Date(`${dia}T12:00:00`).toISOString();

/** "1500" → "1500.00"; o campo numérico precisa do ponto. */
const valorDoCampo = (valor?: number): string =>
  typeof valor === 'number' && valor > 0 ? valor.toFixed(2) : '';

const numeroDoCampo = (texto: string): number => Number(String(texto).replace(',', '.')) || 0;

/** Uma linha da lista no formulário — os números como texto, do jeito que os campos devolvem. */
interface ItemEmEdicao {
  id: string;
  titulo: string;
  sessoes: string;
  valor: string;
  procedureId?: string;
}

const paraEdicao = (i: ReciboItem): ItemEmEdicao => ({
  id: i.id,
  titulo: i.titulo,
  sessoes: String(i.sessoes || 1),
  valor: valorDoCampo(i.valor),
  procedureId: i.procedureId,
});

const itemEmBranco = (): ItemEmEdicao => ({ id: crypto.randomUUID(), titulo: '', sessoes: '1', valor: '' });

export interface ReciboFormPanelProps {
  aberto: boolean;
  onFechar: () => void;
  /** Corrigir um recibo já emitido. */
  recibo?: Recibo | null;
  /** O orçamento pago de onde o recibo nasce — ele herda cliente, valor, forma e procedimentos. */
  orcamento?: Quote | null;
  /** Recibo avulso aberto da página da paciente: ela já vem escolhida. */
  pacienteInicial?: Patient | null;
  pacientes: Patient[];
  /** O catálogo, para o "+ Adicionar procedimento" da lista. */
  procedimentos: Procedure[];
  clinic: ClinicProfile;
  /** O recibo gravado — quem abriu decide o que mostrar em seguida (a prévia, para enviar). */
  onSalvo: (recibo: Recibo) => void;
}

/**
 * O formulário da nota de recibo: cliente (nome e CPF), data, valor, forma de pagamento — à
 * vista ou parcelado no crédito —, a lista do que foi pago e o comprovante.
 *
 * A lista segue a do orçamento: procedimento do catálogo ou fora dele, um por linha, numerados.
 * O nome de cada linha é livre — o mesmo procedimento tem protocolos diferentes de uma cliente
 * para outra ("Harmonização Glútea — Fases 1 e 2", "— Fase 3") —, com as sessões e, se quiser,
 * o valor de cada um.
 *
 * Vindo de um orçamento, quase tudo já chega preenchido: a cliente, os procedimentos, a data do
 * pagamento e a forma principal do orçamento com o valor dela. Se a cliente pagou por outra das
 * formas que o orçamento aceitava, um toque na pílula troca forma e valor juntos.
 *
 * O comprovante sobe **antes** do recibo ser gravado: se o Storage recusar, nada foi emitido e o
 * número não foi gasto.
 */
export const ReciboFormPanel: React.FC<ReciboFormPanelProps> = ({
  aberto,
  onFechar,
  recibo,
  orcamento,
  pacienteInicial,
  pacientes,
  procedimentos,
  clinic,
  onSalvo,
}) => {
  const [pacienteId, setPacienteId] = useState<string | undefined>(undefined);
  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteContato, setPacienteContato] = useState<string | undefined>(undefined);
  const [cpf, setCpf] = useState('');
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState<FormaDoRecibo>('pix');
  const [parcelas, setParcelas] = useState(1);
  const [itens, setItens] = useState<ItemEmEdicao[]>([itemEmBranco()]);
  /** O comprovante que continua no recibo — o já gravado, até ser trocado ou removido. */
  const [comprovanteAtual, setComprovanteAtual] = useState<QuoteComprovante | undefined>(undefined);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erros, setErros] = useState<Partial<Record<'nome' | 'cpf' | 'data' | 'valor' | 'itens', string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const editando = !!recibo;
  /** O orçamento do recibo — o que veio para criar, ou o que o recibo em edição já aponta. */
  const quoteId = recibo?.quoteId ?? orcamento?.id;
  const quoteNumero = recibo?.quoteNumero ?? orcamento?.numero;

  const sugestoes = useMemo(() => (orcamento && !editando ? pagamentosSugeridos(orcamento) : []), [
    orcamento,
    editando,
  ]);

  // Cada abertura começa do que foi pedido — nunca do que sobrou da anterior.
  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setErro(null);
    setSalvando(false);
    setArquivo(null);

    if (recibo) {
      setPacienteId(recibo.pacienteId);
      setPacienteNome(recibo.pacienteNome);
      setPacienteContato(recibo.pacienteContato);
      setCpf(formatCpf(recibo.pacienteCpf || ''));
      setData(recibo.dataPagamento || hojeISO());
      setValor(valorDoCampo(recibo.valor));
      setForma(recibo.forma);
      setParcelas(parcelasDoRecibo(recibo));
      const doRecibo = itensDoRecibo(recibo).map(paraEdicao);
      setItens(doRecibo.length > 0 ? doRecibo : [itemEmBranco()]);
      setComprovanteAtual(recibo.comprovante);
      return;
    }

    const paciente = orcamento?.pacienteId
      ? pacientes.find((p) => p.id === orcamento.pacienteId)
      : pacienteInicial || undefined;
    const principal = orcamento ? pagamentosSugeridos(orcamento)[0] : undefined;

    setPacienteId(orcamento ? orcamento.pacienteId : pacienteInicial?.id);
    setPacienteNome(orcamento?.pacienteNome || pacienteInicial?.nome || '');
    setPacienteContato(orcamento?.pacienteContato || paciente?.contato);
    setCpf(formatCpf(paciente?.cpf || ''));
    setData((orcamento?.status === 'pago' && isoParaDia(orcamento.pagoEm)) || hojeISO());
    setValor(valorDoCampo(principal?.valor ?? orcamento?.total));
    setForma(principal?.forma || 'pix');
    setParcelas(principal?.parcelas || 1);
    const doOrcamento = orcamento ? itensDoOrcamento(orcamento).map(paraEdicao) : [];
    setItens(doOrcamento.length > 0 ? doOrcamento : [itemEmBranco()]);
    setComprovanteAtual(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, recibo?.id, orcamento?.id]);

  const valorNumero = numeroDoCampo(valor);
  const parcelado = forma === 'credito' && parcelas > 1;

  const itensPreenchidos = itens.filter((i) => i.titulo.trim());
  /** Todos os itens com valor e a soma longe do recebido: aviso, sem impedir — pode ser de propósito. */
  const somaDosItens = itensPreenchidos.reduce((soma, i) => soma + numeroDoCampo(i.valor), 0);
  const somaDiferente =
    itensPreenchidos.length > 0 &&
    itensPreenchidos.every((i) => numeroDoCampo(i.valor) > 0) &&
    valorNumero > 0 &&
    Math.abs(somaDosItens - valorNumero) >= 0.01;

  const mudarItem = (id: string, patch: Partial<ItemEmEdicao>) => {
    setItens((atual) => atual.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setErros((e) => ({ ...e, itens: undefined }));
  };

  const removerItem = (id: string) =>
    setItens((atual) => {
      const resto = atual.filter((i) => i.id !== id);
      return resto.length > 0 ? resto : [itemEmBranco()];
    });

  /** Do catálogo: ocupa a linha em branco que estiver sobrando, ou entra no fim. */
  const adicionarDoCatalogo = (proc: Procedure) => {
    const novo: ItemEmEdicao = {
      id: crypto.randomUUID(),
      titulo: proc.title,
      sessoes: String(sessoesDoProcedimento(proc)),
      valor: '',
      procedureId: proc.id,
    };
    setItens((atual) => {
      const emBranco = atual.findIndex((i) => !i.titulo.trim());
      if (emBranco >= 0) return atual.map((i, n) => (n === emBranco ? novo : i));
      return atual.length >= MAXIMO_DE_ITENS ? atual : [...atual, novo];
    });
    setErros((e) => ({ ...e, itens: undefined }));
  };

  const escolherPaciente = (escolha: { id?: string; nome: string; contato?: string }) => {
    setPacienteId(escolha.id);
    setPacienteNome(escolha.nome);
    setPacienteContato(escolha.contato);
    setErros((e) => ({ ...e, nome: undefined }));
    // Escolheu do cadastro: o CPF vem junto, se ela tiver
    if (escolha.id) {
      const doCadastro = pacientes.find((p) => p.id === escolha.id);
      if (doCadastro?.cpf) setCpf(formatCpf(doCadastro.cpf));
    }
  };

  const escolherArquivo = (novo: File | null) => {
    const problema = novo ? problemaNoArquivoDeComprovante(novo) : null;
    setErro(problema);
    setArquivo(novo && !problema ? novo : null);
  };

  const validar = (): boolean => {
    const novos: typeof erros = {};
    if (!pacienteNome.trim()) novos.nome = 'Informe o nome de quem pagou.';
    const digitosCpf = cpf.replace(/\D/g, '');
    if (digitosCpf && digitosCpf.length !== 11) novos.cpf = 'O CPF tem 11 dígitos.';
    if (!data) novos.data = 'Informe a data do pagamento.';
    else if (data > hojeISO()) novos.data = 'O recibo é de um pagamento que já aconteceu.';
    if (!(valorNumero > 0)) novos.valor = 'Informe o valor recebido.';
    if (itensPreenchidos.length === 0) novos.itens = 'Informe ao menos um procedimento.';
    setErros(novos);
    return Object.keys(novos).length === 0;
  };

  const salvar = async () => {
    if (!validar()) return;
    setSalvando(true);
    setErro(null);

    const id = recibo?.id ?? crypto.randomUUID();
    let novoComprovante: QuoteComprovante | undefined;
    try {
      if (arquivo) novoComprovante = await enviarComprovanteDoRecibo(id, arquivo);

      const digitosCpf = cpf.replace(/\D/g, '');
      const draft: ReciboDraft = {
        dataPagamento: data,
        valor: Math.round(valorNumero * 100) / 100,
        forma,
        parcelas: forma === 'credito' ? parcelas : undefined,
        pacienteId,
        pacienteNome: pacienteNome.trim(),
        pacienteCpf: digitosCpf || undefined,
        pacienteContato: pacienteContato || undefined,
        itens: itensPreenchidos.map((i) => {
          const valorDoItem = numeroDoCampo(i.valor);
          return {
            id: i.id,
            titulo: i.titulo.trim(),
            sessoes: Math.max(1, Math.round(numeroDoCampo(i.sessoes) || 1)),
            valor: valorDoItem > 0 ? Math.round(valorDoItem * 100) / 100 : undefined,
            procedureId: i.procedureId,
          };
        }),
        // O "Referente a" de texto virou a lista; a observação dos recibos antigos fica como estava.
        referente: undefined,
        observacoes: recibo?.observacoes,
        quoteId,
        quoteNumero,
        comprovante: novoComprovante ?? comprovanteAtual,
        clinica: montarClinicaDoRecibo(clinic),
      };

      const salvo = recibo ? await atualizarRecibo(recibo, draft) : await criarRecibo(id, draft);

      // O arquivo que saiu do recibo (trocado ou removido) não fica órfão no Storage.
      if (recibo?.comprovante && recibo.comprovante.url !== salvo.comprovante?.url) {
        void apagarComprovante(recibo.comprovante);
      }

      // Recibo de orçamento ainda aberto: a cliente pagou, então o orçamento passa a pago.
      if (orcamento && !editando && orcamento.status !== 'pago') {
        await marcarQuoteComoPago(orcamento.id, diaParaISO(data)).catch((e) =>
          console.warn('Recibo emitido, mas o orçamento não foi marcado como pago:', e)
        );
      }

      // O CPF digitado aqui completa o cadastro de quem ainda não o tinha.
      const doCadastro = pacienteId ? pacientes.find((p) => p.id === pacienteId) : undefined;
      if (doCadastro && !doCadastro.cpf && digitosCpf.length === 11) {
        void savePatient({ ...doCadastro, cpf: digitosCpf }).catch((e) =>
          console.warn('O CPF não foi copiado para o cadastro:', e)
        );
      }

      onFechar();
      onSalvo(salvo);
    } catch (e) {
      // O arquivo subiu mas o recibo não foi gravado: não deixa o comprovante órfão.
      if (novoComprovante) void apagarComprovante(novoComprovante);
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  const prefixoReais = <span className="text-[14px] font-semibold text-ink-soft shrink-0">R$</span>;

  const cabecalho = quoteNumero ? (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream/8 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-brand-light">Orçamento vinculado</p>
        <p className="text-[15px] font-semibold text-white tabular-nums truncate">
          Nº {quoteNumero}
          {orcamento ? ` · ${orcamento.pacienteNome}` : ''}
        </p>
      </div>
      {orcamento && (
        <p className="shrink-0 text-[18px] font-bold text-white tabular-nums">{formatBRL(orcamento.total)}</p>
      )}
    </div>
  ) : undefined;

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo={editando ? `Recibo Nº ${recibo!.numero}` : 'Nova nota de recibo'}
      sobretitulo={quoteNumero ? 'Pagamento do orçamento' : 'Recibo de pagamento'}
      subtitulo={
        editando
          ? 'O número continua o mesmo. Depois de salvar, envie o PDF novo à cliente.'
          : 'Sai em PDF, com a identidade da clínica, para enviar à cliente.'
      }
      cabecalho={cabecalho}
      bloqueado={salvando}
      alterado={!!arquivo || comprovanteAtual !== (recibo?.comprovante ?? undefined)}
      rodape={
        <BotaoPrincipal onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
          {salvando
            ? 'Salvando…'
            : editando
            ? 'Salvar alterações'
            : `Emitir recibo${valorNumero > 0 ? ` · ${formatBRL(valorNumero)}` : ''}`}
        </BotaoPrincipal>
      }
    >
      <form
        className="px-5 sm:px-6 py-5 flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {erro && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {erro}
          </AvisoTinta>
        )}

        {/* Quem pagou */}
        <section className="flex flex-col gap-3">
          <h3 className="font-serif-luxury text-[22px] font-semibold text-ink">Cliente</h3>
          <div>
            <PatientSearchSelect
              patients={pacientes}
              pacienteId={pacienteId}
              pacienteNome={pacienteNome}
              onSelect={escolherPaciente}
            />
            {erros.nome && <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erros.nome}</p>}
          </div>
          <CampoTinta
            rotulo="CPF"
            htmlFor="recibo-cpf"
            erro={erros.cpf}
            ajuda="Sai no recibo — é com ele que a cliente comprova a despesa, no Imposto de Renda inclusive."
          >
            <input
              id="recibo-cpf"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cpf}
              onChange={(e) => {
                setCpf(formatCpf(e.target.value));
                setErros((x) => ({ ...x, cpf: undefined }));
              }}
              placeholder="000.000.000-00"
              className={`${INPUT_TINTA} tabular-nums`}
            />
          </CampoTinta>
        </section>

        {/* O pagamento */}
        <section className="flex flex-col gap-3">
          <h3 className="font-serif-luxury text-[22px] font-semibold text-ink">Pagamento</h3>

          {sugestoes.length > 1 && (
            <div>
              <RotuloTinta>Como a cliente pagou?</RotuloTinta>
              <div className="flex flex-wrap gap-2">
                {sugestoes.map((s) => {
                  const ativa =
                    s.forma === forma && s.parcelas === parcelas && Math.abs(s.valor - valorNumero) < 0.005;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={ativa}
                      onClick={() => {
                        setForma(s.forma);
                        setParcelas(s.parcelas);
                        setValor(valorDoCampo(s.valor));
                        setErros((x) => ({ ...x, valor: undefined }));
                      }}
                      className={`h-10 px-4 rounded-full text-[14px] font-semibold tabular-nums transition-colors ${
                        ativa ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
                      }`}
                    >
                      {s.rotulo}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 px-1 text-[13px] text-ink-soft">
                As formas que o orçamento aceitava — um toque preenche a forma e o valor.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <CampoTinta rotulo="Data do pagamento" htmlFor="recibo-data" erro={erros.data}>
              <input
                id="recibo-data"
                type="date"
                value={data}
                max={hojeISO()}
                onChange={(e) => {
                  setData(e.target.value);
                  setErros((x) => ({ ...x, data: undefined }));
                }}
                className={`${INPUT_TINTA} tabular-nums`}
              />
            </CampoTinta>
            <CampoTinta rotulo="Valor recebido" htmlFor="recibo-valor" erro={erros.valor} prefixo={prefixoReais}>
              <input
                id="recibo-valor"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value);
                  setErros((x) => ({ ...x, valor: undefined }));
                }}
                placeholder="0,00"
                className={`${INPUT_TINTA} text-[18px] font-bold tabular-nums`}
              />
            </CampoTinta>
          </div>

          <div>
            <RotuloTinta>Forma de pagamento</RotuloTinta>
            <PilulasDeEscolha
              opcoes={FORMAS}
              valor={forma}
              onMudar={(f) => {
                if (!f) return;
                setForma(f);
                if (f !== 'credito') setParcelas(1);
              }}
              rotulo="Forma de pagamento"
            />
          </div>

          {forma === 'credito' && (
            <div className="flex flex-col gap-2.5">
              <Segmentado
                opcoes={[
                  { id: 'vista', rotulo: 'À vista' },
                  { id: 'parcelado', rotulo: 'Parcelado' },
                ]}
                valor={parcelado ? 'parcelado' : 'vista'}
                onMudar={(v) => setParcelas(v === 'parcelado' ? Math.max(2, parcelas) : 1)}
                cheio
                rotulo="À vista ou parcelado"
              />
              {parcelado && (
                <CampoTinta
                  rotulo="Parcelas"
                  htmlFor="recibo-parcelas"
                  ajuda={valorNumero > 0 ? `${parcelas}× de ${formatBRL(valorNumero / parcelas)}` : undefined}
                  sufixo={<SetaDoSelect />}
                >
                  <select
                    id="recibo-parcelas"
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    className={`${INPUT_TINTA} appearance-none cursor-pointer`}
                  >
                    {Array.from({ length: PARCELAS_MAXIMAS - 1 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n} vezes
                      </option>
                    ))}
                  </select>
                </CampoTinta>
              )}
            </div>
          )}
        </section>

        {/* O que foi pago — a tabela do recibo */}
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="font-serif-luxury text-[22px] font-semibold text-ink">Procedimentos</h3>
            <p className="text-[13px] text-ink-soft leading-snug">
              Cada linha vira uma linha da tabela do recibo. O nome pode ser mudado — por exemplo,
              o protocolo de cada fase.
            </p>
          </div>

          {erros.itens && (
            <AvisoTinta tom="erro" icone={AlertCircle}>
              {erros.itens}
            </AvisoTinta>
          )}

          {itens.map((item, n) => (
            <div key={item.id} className="rounded-2xl bg-card border border-ink/10 p-3 flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="w-8 h-8 mt-3 shrink-0 rounded-full bg-ink text-brand-pale text-[14px] font-bold flex items-center justify-center tabular-nums"
                >
                  {n + 1}
                </span>
                <CampoTinta rotulo="Procedimento" htmlFor={`recibo-item-${item.id}`} className="flex-1 min-w-0">
                  <input
                    id={`recibo-item-${item.id}`}
                    type="text"
                    value={item.titulo}
                    maxLength={120}
                    onChange={(e) => mudarItem(item.id, { titulo: e.target.value })}
                    placeholder="Harmonização Glútea — Fases 1 e 2"
                    className={INPUT_TINTA}
                  />
                </CampoTinta>
                <button
                  type="button"
                  onClick={() => removerItem(item.id)}
                  aria-label={`Remover o procedimento ${n + 1}`}
                  title="Remover"
                  className="w-10 h-10 mt-2 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-danger hover:bg-danger-bg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:pl-[42px] sm:pr-[50px]">
                <CampoTinta rotulo="Sessões" htmlFor={`recibo-item-sessoes-${item.id}`}>
                  <input
                    id={`recibo-item-sessoes-${item.id}`}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={item.sessoes}
                    onChange={(e) => mudarItem(item.id, { sessoes: e.target.value })}
                    className={`${INPUT_TINTA} tabular-nums`}
                  />
                </CampoTinta>
                <CampoTinta rotulo="Valor (opcional)" htmlFor={`recibo-item-valor-${item.id}`} prefixo={prefixoReais}>
                  <input
                    id={`recibo-item-valor-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={item.valor}
                    onChange={(e) => mudarItem(item.id, { valor: e.target.value })}
                    placeholder="—"
                    className={`${INPUT_TINTA} tabular-nums`}
                  />
                </CampoTinta>
              </div>
            </div>
          ))}

          {itens.length < MAXIMO_DE_ITENS ? (
            <div className="flex flex-wrap items-center gap-2">
              <ProcedureSearchAdd procedures={procedimentos} onAdd={adicionarDoCatalogo} />
              <button
                type="button"
                onClick={() => setItens((atual) => [...atual, itemEmBranco()])}
                className="h-10 px-4 rounded-full border border-ink/15 text-ink text-[14px] font-semibold hover:border-ink/40 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Item fora do catálogo
              </button>
            </div>
          ) : (
            <p className="px-1 text-[13px] text-ink-soft">
              Até {MAXIMO_DE_ITENS} linhas — é o que cabe na folha do recibo.
            </p>
          )}

          {somaDiferente && (
            <AvisoTinta tom="alerta" icone={AlertCircle}>
              A soma dos itens ({formatBRL(somaDosItens)}) é diferente do valor recebido (
              {formatBRL(valorNumero)}). No recibo, o total é o valor recebido.
            </AvisoTinta>
          )}
        </section>

        {/* O comprovante */}
        <section className="flex flex-col gap-2">
          <h3 className="font-serif-luxury text-[22px] font-semibold text-ink">Comprovante</h3>
          {comprovanteAtual && !arquivo ? (
            <>
              <ComprovanteAnexado comprovante={comprovanteAtual} />
              <div className="flex gap-2">
                <EscolhaDeComprovante arquivo={null} onEscolher={escolherArquivo} rotulo="Trocar arquivo" />
                <button
                  type="button"
                  onClick={() => setComprovanteAtual(undefined)}
                  className="shrink-0 min-h-[52px] px-4 rounded-xl text-body font-semibold text-muted hover:text-danger hover:bg-danger-bg transition-colors"
                >
                  Remover
                </button>
              </div>
            </>
          ) : (
            <EscolhaDeComprovante arquivo={arquivo} onEscolher={escolherArquivo} rotulo="Anexar foto ou PDF" />
          )}
          <p className="px-1 text-[13px] text-ink-soft leading-snug">
            Opcional. A captura do Pix ou o papel da maquininha — entra como página anexa no PDF do
            recibo{quoteNumero ? ' e no do orçamento' : ''}.
          </p>
        </section>

      </form>
    </SidePanel>
  );
};
