import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  CheckCheck,
  ClipboardList,
  FilePlus2,
  MessageCircle,
  Plus,
  Search,
  UserPlus,
} from 'lucide-react';
import {
  AnamnesisTemplate,
  Attendance,
  ClinicProfile,
  Patient,
  Procedure,
  Professional,
  Quote,
} from '../../types';
import { formatBRL } from '../../utils/formatters';
import { hojeISO } from '../../utils/attendances';
import {
  aConfirmarAmanha,
  contatoDoAtendimento,
  deslocarDias,
  duracaoDoAtendimento,
  ehConfirmado,
  expedienteDoDia,
  hhmmDeMinutos,
  horariosLivresDoDia,
  mensagemDeConfirmacao,
  minutosDoHHMM,
} from '../../utils/agenda';
import {
  atendimentosDeHoje,
  conversaoDeOrcamentos,
  dataPorExtenso,
  diasAntesDeHoje,
  faturamentoDoMes,
  mesAtual,
  nomeDoMes,
  orcamentosAbertos,
  proximosDeHoje,
  saudacaoDaHora,
} from '../../utils/indicadores';
import { agendamentosAtrasados } from '../../utils/agenda';
import { montarLinhasDePacientes } from '../../utils/patientsPanel';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { SkeletonLinhas } from '../common/Skeleton';
import {
  BotaoRedondo,
  GatilhoDeBusca,
  MenuDeAcoes,
  TituloDaTela,
  ValorEmReais,
} from '../common/Tinta';
import { AcaoDeCriacao } from '../BottomNav';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { useAcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { FolhaDePagamento } from '../quotes/QuoteDesfecho';
import { LinhaDoTempoDaClinica } from './LinhaDoTempoDaClinica';

/**
 * A tela inicial: "o que eu preciso fazer agora?".
 *
 * Todo número desta tela sai das coleções que o `App` já assina — atendimentos, pacientes,
 * orçamentos e catálogo. **Nenhuma leitura da coleção inteira**, o que é também o motivo de ela
 * poder ser a primeira tela depois do login. A única leitura própria é a da linha do tempo.
 *
 * O redesign ("Tinta") reorganiza a tela em três blocos, cada um com um só número ou uma só
 * pergunta:
 * - o **bloco preto** do mês — o faturamento grande, e em volta dele os três números do dia;
 * - **Precisa de você** — o que está parado esperando alguém da clínica: orçamento por enviar,
 *   comprovante por anexar, cadastro por completar, confirmação de amanhã, agendamento sem
 *   desfecho. Cada linha com **uma** ação, escrita com o verbo;
 * - a **agenda de hoje** — quem vem agora, e os horários livres já tocáveis para encaixe.
 *
 * Avaliação e acompanhamento não entram nas pendências: as duas fichas são opcionais, e cobrar
 * todo atendimento por elas treinava a equipe a ignorar o contador.
 */

interface HojeViewProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  atendimentos: Attendance[];
  pacientes: Patient[];
  quotes: Quote[];
  /** Fichas-modelo de anamnese — a ficha aberta pela linha do tempo resolve o termo por elas. */
  templatesAnamnese: AnamnesisTemplate[];
  professionalLogada?: Professional | null;
  carregando?: boolean;
  onAbrirBusca: () => void;
  onCriar: (acao: AcaoDeCriacao) => void;
  /** Novo agendamento já com a hora — o horário livre tocado na agenda do dia. */
  onAgendarEm: (hora: string) => void;
  /** Sem data, o dia de hoje; com data, aquele dia. */
  onIrParaAgenda: (data?: string) => void;
  /** Com filtro, a lista abre naquele status (`rascunho`, `pago`). */
  onIrParaOrcamentos: (filtro?: string) => void;
  /** Só para administradoras — ausente, o faturamento leva aos orçamentos. */
  onIrParaFinanceiro?: () => void;
  /** Pacientes, já no recorte dos cadastros por completar. */
  onCompletarCadastros: () => void;
  onAbrirPaciente: (pacienteId: string) => void;
  onConfirmar: (a: Attendance) => void;
}

/** "Bruna, Camila Albuquerque e mais 5" — quem está na fila, sem virar parágrafo. */
const resumirNomes = (nomes: string[]): string => {
  const unicos = Array.from(new Set(nomes.map((n) => n.trim()).filter(Boolean)));
  if (unicos.length <= 2) return unicos.join(' e ');
  return `${unicos.slice(0, 2).join(', ')} e mais ${unicos.length - 2}`;
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Quantos dias para trás um pagamento sem comprovante ainda é cobrado aqui. */
const JANELA_DO_COMPROVANTE = 45;

interface Tarefa {
  id: string;
  titulo: string;
  sub: string;
  /** O verbo do botão no desktop — "Enviar", "Anexar", "Completar". */
  acao: string;
  onClick: () => void;
}

// ==========================================
// BLOCO PRETO DO MÊS
// ==========================================

const NumeroDoDia: React.FC<{
  valor: string;
  rotulo: string;
  onClick: () => void;
}> = ({ valor, rotulo, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left rounded-[14px] bg-cream/8 px-3 py-2.5 hover:bg-cream/12 transition-colors lg:bg-transparent lg:hover:bg-transparent lg:rounded-none lg:px-0 lg:py-0 lg:pl-5 lg:border-l lg:border-cream/15 group"
  >
    <span className="block text-[20px] lg:text-[28px] font-bold text-white tabular-nums leading-tight">
      {valor}
    </span>
    <span className="block text-[12px] lg:text-[13px] font-medium text-cream/75 group-hover:text-cream leading-snug">
      {rotulo}
    </span>
  </button>
);

// ==========================================
// PRECISA DE VOCÊ
// ==========================================

const LinhaDeTarefa: React.FC<{ tarefa: Tarefa }> = ({ tarefa }) => (
  <>
    {/* Celular: um cartão por tarefa, a seta preta como botão. */}
    <button
      type="button"
      onClick={tarefa.onClick}
      className="lg:hidden w-full flex items-center gap-3 rounded-[18px] bg-card border border-ink/8 px-4 py-3.5 text-left hover:border-ink/25 transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{tarefa.titulo}</span>
        <span className="block text-[13px] text-ink-soft truncate">{tarefa.sub}</span>
      </span>
      <span className="w-10 h-10 shrink-0 rounded-full bg-ink text-white flex items-center justify-center">
        <ArrowRight className="w-[18px] h-[18px]" />
      </span>
    </button>

    {/* Desktop: linhas dentro de um cartão só, com o verbo escrito no botão. */}
    <div className="hidden lg:flex items-center gap-3.5 py-3.5 border-b border-ink/7 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold text-ink">{tarefa.titulo}</p>
        <p className="text-[14px] text-ink-soft truncate">{tarefa.sub}</p>
      </div>
      <button
        type="button"
        onClick={tarefa.onClick}
        className="shrink-0 h-10 px-[18px] rounded-full bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors"
      >
        {tarefa.acao}
      </button>
    </div>
  </>
);

// ==========================================
// AGENDA DE HOJE
// ==========================================

const AgendaDeHoje: React.FC<{
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  atendimentos: Attendance[];
  pacientes: Patient[];
  hoje: string;
  carregando?: boolean;
  totalDoDia: number;
  onAbrir: () => void;
  onAgendarEm: (hora: string) => void;
  onAbrirPaciente: (pacienteId: string) => void;
  onConfirmar: (a: Attendance) => void;
}> = ({
  clinic,
  catalogProcedures,
  atendimentos,
  pacientes,
  hoje,
  carregando,
  totalDoDia,
  onAbrir,
  onAgendarEm,
  onAbrirPaciente,
  onConfirmar,
}) => {
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const abreHoje = !!expedienteDoDia(clinic, hoje);

  /**
   * O que ainda vem hoje e os buracos do expediente, em ordem de relógio. Quatro horários livres
   * bastam para encaixar alguém; a lista inteira está na Agenda.
   */
  const linhas = useMemo(() => {
    const vindo = proximosDeHoje(atendimentos, hoje).map((a) => ({
      tipo: 'atendimento' as const,
      minuto: minutosDoHHMM(a.hora) ?? 12 * 60,
      atendimento: a,
    }));
    const livres = horariosLivresDoDia(hoje, atendimentos, clinic, catalogProcedures)
      .slice(0, 4)
      .map((hora) => ({ tipo: 'livre' as const, minuto: minutosDoHHMM(hora) ?? 0, hora }));
    return [...vindo, ...livres].sort((a, b) => a.minuto - b.minuto).slice(0, 8);
  }, [atendimentos, hoje, clinic, catalogProcedures]);

  const temAtendimento = linhas.some((l) => l.tipo === 'atendimento');

  return (
    <section className="rounded-[24px] bg-card border border-ink/8 p-5 lg:p-6 flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-[18px] font-bold text-ink">Agenda de hoje</h2>
        <button
          type="button"
          onClick={onAbrir}
          className="text-[14px] font-semibold text-brand-hover hover:text-ink transition-colors"
        >
          Abrir →
        </button>
      </div>

      {abreHoje && (
        <div className="flex items-center gap-2" aria-label="Agora">
          <span className="text-[13px] font-bold text-danger tabular-nums">{hhmmDeMinutos(minutosAgora)}</span>
          <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
          <span className="flex-1 h-0.5 bg-danger/80" />
        </div>
      )}

      {carregando ? (
        <SkeletonLinhas linhas={3} />
      ) : (
        <>
          {linhas.length > 0 && (
            <ul className="flex flex-col gap-2">
              {linhas.map((linha) =>
                linha.tipo === 'livre' ? (
                  <li key={`livre-${linha.hora}`}>
                    <button
                      type="button"
                      onClick={() => onAgendarEm(linha.hora)}
                      className="w-full h-[52px] rounded-[14px] border border-dashed border-ink/20 px-4 flex items-center justify-between gap-3 text-[14px] text-ink-soft hover:border-ink hover:bg-surface transition-colors"
                    >
                      <span>
                        <b className="text-ink tabular-nums">{linha.hora}</b> · Livre
                      </span>
                      <span className="font-bold text-ink inline-flex items-center gap-1">
                        <Plus className="w-4 h-4" />
                        Agendar
                      </span>
                    </button>
                  </li>
                ) : (
                  <CartaoDoDia
                    key={linha.atendimento.id}
                    atendimento={linha.atendimento}
                    clinic={clinic}
                    catalogProcedures={catalogProcedures}
                    pacientes={pacientes}
                    onAbrirPaciente={onAbrirPaciente}
                    onConfirmar={onConfirmar}
                  />
                )
              )}
            </ul>
          )}

          {!temAtendimento && (
            <p className="text-[14px] leading-normal text-ink-soft">
              {!abreHoje && totalDoDia === 0
                ? 'A clínica não abre hoje. Encaixe continua possível pela Agenda.'
                : totalDoDia === 0
                ? 'Nenhum atendimento marcado para hoje. Bom momento para confirmar os de amanhã.'
                : 'Os atendimentos de hoje já passaram. Confira na Agenda se todos têm desfecho marcado.'}
            </p>
          )}
        </>
      )}
    </section>
  );
};

/** Uma visita de hoje: bloco preto, com o selo de confirmação e o atalho de confirmar. */
const CartaoDoDia: React.FC<{
  atendimento: Attendance;
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  pacientes: Patient[];
  onAbrirPaciente: (pacienteId: string) => void;
  onConfirmar: (a: Attendance) => void;
}> = ({ atendimento: a, clinic, catalogProcedures, pacientes, onAbrirPaciente, onConfirmar }) => {
  const confirmado = ehConfirmado(a);
  const inicio = minutosDoHHMM(a.hora);
  const faixa =
    inicio === null
      ? 'Sem horário'
      : `${a.hora}–${hhmmDeMinutos(inicio + duracaoDoAtendimento(a, catalogProcedures))}`;
  const link = buildWhatsAppUrl(
    contatoDoAtendimento(a, pacientes),
    mensagemDeConfirmacao(clinic, a, catalogProcedures)
  );

  return (
    <li className="rounded-2xl bg-ink text-cream flex items-stretch">
      <button
        type="button"
        onClick={() => onAbrirPaciente(a.pacienteId)}
        className="flex-1 min-w-0 px-3.5 py-3 text-left"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-white truncate">{a.pacienteNome}</span>
          {confirmado ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold text-ok-claro">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-claro" />
              Confirmado
            </span>
          ) : (
            <span className="shrink-0 text-[12px] font-bold text-brand-pale">A confirmar</span>
          )}
        </span>
        <span className="block text-[13px] text-cream/75 truncate">
          {a.procedimentoNome} · {faixa}
        </span>
      </button>
      {!confirmado && (
        <span className="flex items-center gap-0.5 pr-1.5 shrink-0">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Confirmar ${a.pacienteNome} pelo WhatsApp`}
              title="Confirmar pelo WhatsApp"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-cream hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="w-[18px] h-[18px]" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onConfirmar(a)}
            aria-label={`Marcar ${a.pacienteNome} como confirmada`}
            title="Marcar como confirmado"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-cream hover:bg-white/10 hover:text-ok-claro transition-colors"
          >
            <CheckCheck className="w-[18px] h-[18px]" />
          </button>
        </span>
      )}
    </li>
  );
};

// ==========================================
// A TELA
// ==========================================

export const HojeView: React.FC<HojeViewProps> = ({
  clinic,
  catalogProcedures,
  atendimentos,
  pacientes,
  quotes,
  templatesAnamnese,
  professionalLogada,
  carregando,
  onAbrirBusca,
  onCriar,
  onAgendarEm,
  onIrParaAgenda,
  onIrParaOrcamentos,
  onIrParaFinanceiro,
  onCompletarCadastros,
  onAbrirPaciente,
  onConfirmar,
}) => {
  const hoje = hojeISO();
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  /** O orçamento pago cuja folha de comprovante está aberta. */
  const [folhaDe, setFolhaDe] = useState<Quote | null>(null);

  const acoesDeOrcamento = useAcoesDeOrcamento({
    clinic,
    procedures: catalogProcedures,
    patients: pacientes,
    onErro: (mensagem) => setConfirmacao(aviso('Nem tudo foi salvo', mensagem, 'perigo')),
  });

  const doDia = useMemo(() => atendimentosDeHoje(atendimentos, hoje), [atendimentos, hoje]);
  const semDesfecho = useMemo(() => agendamentosAtrasados(atendimentos), [atendimentos]);
  const aConfirmar = useMemo(() => aConfirmarAmanha(atendimentos, hoje), [atendimentos, hoje]);

  const mes = mesAtual(hoje);
  const faturamento = useMemo(() => faturamentoDoMes(quotes, mes), [quotes, mes]);
  const abertos = useMemo(() => orcamentosAbertos(quotes), [quotes]);
  const conversao = useMemo(() => conversaoDeOrcamentos(quotes, 30, hoje), [quotes, hoje]);

  const primeiroNome = (professionalLogada?.name || '')
    .replace(/^(Dra?\.?|Dr\.?)\s+/i, '')
    .trim()
    .split(/\s+/)[0];

  const nomeCurtoDoMes = nomeDoMes(mes).split(' de ')[0];

  /**
   * O que está parado esperando alguém da clínica. Cada tipo só entra quando tem o que fazer — um
   * contador aceso em zero treina a equipe a ignorar todos eles. Até duas pendências do mesmo tipo
   * aparecem uma a uma, com o botão que resolve ali mesmo; mais que isso vira uma linha só, que
   * leva à lista já filtrada.
   */
  const tarefas = useMemo(() => {
    const lista: Tarefa[] = [];

    if (aConfirmar.length > 0) {
      lista.push({
        id: 'a-confirmar',
        titulo: `Confirmar ${aConfirmar.length} ${plural(aConfirmar.length, 'agendamento', 'agendamentos')} de amanhã`,
        sub: resumirNomes(aConfirmar.map((a) => a.pacienteNome)),
        acao: 'Confirmar',
        onClick: () => onIrParaAgenda(deslocarDias(hoje, 1)),
      });
    }

    if (semDesfecho.length > 0) {
      lista.push({
        id: 'sem-desfecho',
        titulo: `Dar desfecho a ${semDesfecho.length} ${plural(semDesfecho.length, 'agendamento', 'agendamentos')}`,
        sub: 'A data passou e ninguém marcou compareceu, faltou ou remarcou.',
        acao: 'Resolver',
        onClick: () => onIrParaAgenda(),
      });
    }

    const rascunhos = quotes
      .filter((q) => q.status === 'rascunho')
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
    if (rascunhos.length > 2) {
      lista.push({
        id: 'rascunhos',
        titulo: `Enviar ${rascunhos.length} orçamentos`,
        sub: resumirNomes(rascunhos.map((q) => q.pacienteNome)),
        acao: 'Ver',
        onClick: () => onIrParaOrcamentos('rascunho'),
      });
    } else {
      rascunhos.forEach((q) =>
        lista.push({
          id: `rascunho-${q.id}`,
          titulo: `Enviar orçamento ${q.numero}`,
          sub: `${q.pacienteNome} · ${formatBRL(q.total)} · rascunho`,
          acao: 'Enviar',
          onClick: () => acoesDeOrcamento.abrirCompartilhamento(q),
        })
      );
    }

    // Só os pagamentos recentes: um comprovante de meses atrás dificilmente aparece mais.
    const desde = diasAntesDeHoje(JANELA_DO_COMPROVANTE, hoje);
    const semComprovante = quotes
      .filter((q) => q.status === 'pago' && !q.comprovante && (q.pagoEm || '') >= desde)
      .sort((a, b) => (b.pagoEm || '').localeCompare(a.pagoEm || ''));
    if (semComprovante.length > 2) {
      lista.push({
        id: 'comprovantes',
        titulo: `Anexar ${semComprovante.length} comprovantes`,
        sub: resumirNomes(semComprovante.map((q) => q.pacienteNome)),
        acao: 'Ver',
        onClick: () => onIrParaOrcamentos('pago'),
      });
    } else {
      semComprovante.forEach((q) =>
        lista.push({
          id: `comprovante-${q.id}`,
          titulo: 'Anexar comprovante',
          sub: `${q.pacienteNome} · ${q.numero} · ${formatBRL(q.total)}`,
          acao: 'Anexar',
          onClick: () => setFolhaDe(q),
        })
      );
    }

    // Mesma regra da lista de Pacientes (sem as anamneses, que esta tela não lê inteiras).
    const porCompletar = montarLinhasDePacientes({
      patients: pacientes,
      records: [],
      quotes,
      atendimentos,
    }).filter((l) => l.pendencia);
    if (porCompletar.length > 0) {
      lista.push({
        id: 'cadastros',
        titulo:
          porCompletar.length === 1
            ? 'Completar 1 cadastro'
            : `Completar ${porCompletar.length} cadastros`,
        sub: resumirNomes(porCompletar.map((l) => l.nome)),
        acao: 'Completar',
        onClick: onCompletarCadastros,
      });
    }

    return lista;
    // `acoesDeOrcamento` muda a cada render; o que ela abre não depende das dependências abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aConfirmar, semDesfecho, quotes, pacientes, atendimentos, hoje]);

  const acoesDeCriar = [
    { rotulo: 'Novo agendamento', icone: CalendarPlus, onClick: () => onCriar('agendamento') },
    { rotulo: 'Nova paciente', icone: UserPlus, onClick: () => onCriar('paciente') },
    { rotulo: 'Novo orçamento', icone: FilePlus2, onClick: () => onCriar('orcamento') },
    { rotulo: 'Nova ficha de anamnese', icone: ClipboardList, onClick: () => onCriar('anamnese') },
  ];

  const atalhos: { icone: React.ElementType; rotulo: string; acao: AcaoDeCriacao }[] = [
    { icone: CalendarPlus, rotulo: 'Agendar', acao: 'agendamento' },
    { icone: UserPlus, rotulo: 'Paciente', acao: 'paciente' },
    { icone: FilePlus2, rotulo: 'Orçamento', acao: 'orcamento' },
    { icone: ClipboardList, rotulo: 'Anamnese', acao: 'anamnese' },
  ];

  const irParaFaturamento = () => (onIrParaFinanceiro ? onIrParaFinanceiro() : onIrParaOrcamentos('pago'));

  const blocoDoMes = (
    <section
      aria-label="Números do mês"
      className="rounded-[24px] bg-ink text-cream p-[22px] lg:p-7 flex flex-col gap-[18px] lg:grid lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:gap-5 lg:items-end"
    >
      <button type="button" onClick={irParaFaturamento} className="text-left group min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-brand-light">Faturamento · {nomeCurtoDoMes}</span>
          <span className="lg:hidden text-[12px] font-semibold text-cream/70">pagos</span>
        </span>
        <ValorEmReais
          valor={faturamento}
          className="block mt-[18px] lg:mt-1 text-[42px] lg:text-[44px] font-bold leading-none tracking-[-0.02em] text-white"
          centavosClassName="text-[24px] text-cream/70"
        />
      </button>
      <div className="grid grid-cols-3 gap-2 lg:contents">
        <NumeroDoDia
          valor={String(doDia.length)}
          rotulo={doDia.length === 1 ? 'atendimento hoje' : 'atendimentos hoje'}
          onClick={() => onIrParaAgenda()}
        />
        <NumeroDoDia valor={String(abertos.length)} rotulo="em aberto" onClick={() => onIrParaOrcamentos()} />
        <NumeroDoDia
          valor={conversao.percentual === null ? '—' : `${conversao.percentual}%`}
          rotulo="conversão 30 dias"
          onClick={() => onIrParaOrcamentos()}
        />
      </div>
    </section>
  );

  const precisaDeVoce = (
    <section className="flex flex-col gap-2.5 lg:gap-1 lg:rounded-[24px] lg:bg-card lg:border lg:border-ink/8 lg:p-6">
      <h2 className="font-sans text-[18px] font-bold text-ink lg:mb-2">Precisa de você</h2>
      {carregando ? (
        <SkeletonLinhas linhas={2} />
      ) : tarefas.length === 0 ? (
        <p className="text-[14px] leading-normal text-ink-soft rounded-[18px] bg-card border border-ink/8 px-4 py-3.5 lg:border-0 lg:p-0">
          Nada parado. Nenhum orçamento esperando envio, nenhum comprovante faltando e a agenda em
          dia.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 lg:gap-0">
          {tarefas.map((t) => (
            <LinhaDeTarefa key={t.id} tarefa={t} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-10 pt-6 lg:pt-7 pb-6 flex flex-col gap-[18px] lg:gap-6">
      <TituloDaTela
        sobre={dataPorExtenso(hoje)}
        titulo={`${saudacaoDaHora()}${primeiroNome ? `, ${primeiroNome}` : ''}`}
        acao={
          <>
            <BotaoRedondo icone={Search} rotulo="Buscar paciente, procedimento ou orçamento" onClick={onAbrirBusca} className="sm:hidden" />
            <GatilhoDeBusca
              onClick={onAbrirBusca}
              texto="Buscar paciente, procedimento ou orçamento"
              className="hidden sm:flex w-[260px] lg:w-[380px]"
            />
            <span className="hidden sm:inline-flex">
              <MenuDeAcoes
                acoes={acoesDeCriar}
                rotulo="Criar agendamento, paciente, orçamento ou anamnese"
                titulo="Criar"
                gatilho={{ texto: 'Criar', icone: Plus }}
              />
            </span>
          </>
        }
      />

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-[1.6fr_1fr] lg:gap-5 lg:items-start">
        <div className="flex flex-col gap-[18px] lg:gap-5 min-w-0">
          {blocoDoMes}

          {/* Os quatro atalhos de criar — no celular. No tablet e no desktop o "Criar" do topo
              faz o mesmo. */}
          <div className="grid grid-cols-4 gap-2 sm:hidden">
            {atalhos.map(({ icone: Icone, rotulo, acao }) => (
              <button
                key={acao}
                type="button"
                onClick={() => onCriar(acao)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <span className="w-full h-[60px] rounded-[18px] bg-card border border-ink/8 flex items-center justify-center text-ink group-hover:border-ink/30 transition-colors">
                  <Icone className="w-[22px] h-[22px]" />
                </span>
                <span className="text-label font-semibold text-ink">{rotulo}</span>
              </button>
            ))}
          </div>

          {precisaDeVoce}
        </div>

        <AgendaDeHoje
          clinic={clinic}
          catalogProcedures={catalogProcedures}
          atendimentos={atendimentos}
          pacientes={pacientes}
          hoje={hoje}
          carregando={carregando}
          totalDoDia={doDia.length}
          onAbrir={() => onIrParaAgenda()}
          onAgendarEm={onAgendarEm}
          onAbrirPaciente={onAbrirPaciente}
          onConfirmar={onConfirmar}
        />
      </div>

      <LinhaDoTempoDaClinica
        clinic={clinic}
        catalogProcedures={catalogProcedures}
        atendimentos={atendimentos}
        pacientes={pacientes}
        quotes={quotes}
        templatesAnamnese={templatesAnamnese}
        carregando={carregando}
        onAbrirPaciente={onAbrirPaciente}
      />

      {acoesDeOrcamento.modais}
      {folhaDe && (
        <FolhaDePagamento
          quote={quotes.find((q) => q.id === folhaDe.id) || folhaDe}
          onFechar={() => setFolhaDe(null)}
          onConfirmar={setConfirmacao}
        />
      )}
      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
