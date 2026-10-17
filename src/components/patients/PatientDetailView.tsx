import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Images,
  LayoutList,
  Eye,
  FileText,
  Lock,
  MessageCircle,
  Plus,
  Receipt,
  ReceiptText,
  RefreshCw,
  Share2,
  Unlock,
  Trash2,
} from 'lucide-react';
import {
  AnamnesisQuestion,
  AnamnesisRecord,
  AnamnesisTemplate,
  Attendance,
  ClinicProfile,
  EvaluationRecord,
  Patient,
  Procedure,
  Quote,
  Recibo,
  SessionPlan,
} from '../../types';
import { formatBRL, formatDate, formatDateOnly } from '../../utils/formatters';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { AnamnesisFormFillModal } from '../anamnesis/AnamnesisFormFillModal';
import { montarEspelhoPublico } from '../../utils/laserAreas';
import { PrintableAnamnesisSheet } from '../anamnesis/PrintableAnamnesisSheet';
import { useAcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { podeSubstituir } from '../../utils/quoteCalc';
import { QuoteDesfecho } from '../quotes/QuoteDesfecho';
import { PatientPersonalDataCard } from './PatientPersonalDataCard';
import { AttendancesTab, contarAtendimentosRealizados } from './AttendancesTab';
import { anamneseFechada } from '../../utils/evaluations';
import { encerrarAnamnese, reabrirAnamnese } from '../../services/databaseService';
import {
  ROTULO_DA_ORIGEM,
  fotosDaPaciente,
  idadeDe,
  iniciaisDe,
  pacienteDesde,
} from '../../utils/pacienteResumo';
import { PatientResumoTab } from './PatientResumoTab';
import { AntesEDepois } from './AntesEDepois';
import { EmissaoDeAvaliacao } from '../evaluations/EmissaoDeAvaliacao';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { alvoDoRegistro } from '../../utils/fichasClinicas';
import { useRecibos } from '../recibos/RecibosContext';
import { CartaoDeRecibo } from '../recibos/CartaoDeRecibo';
import { Chip } from '../common/Tinta';

interface PatientDetailViewProps {
  patient: Patient;
  /** Fichas deste paciente, das mais recentes para as mais antigas. */
  records: AnamnesisRecord[];
  /** Orçamentos deste paciente, dos mais recentes para os mais antigos. */
  quotes: Quote[];
  /** Notas de recibo dela — com e sem orçamento —, dos pagamentos mais recentes para os antigos. */
  recibos: Recibo[];
  /** Atendimentos e agendamentos dele. */
  atendimentos: Attendance[];
  /** Planos de sessão dele — quem agrupa os atendimentos na aba. */
  planos: SessionPlan[];
  /** Avaliações emitidas para ela, das mais recentes para as mais antigas. */
  avaliacoes: EvaluationRecord[];
  /** Acompanhamentos dela — entram só pelas fotos da sessão, no antes e depois e na aba Fotos. */
  acompanhamentos: EvaluationRecord[];
  /** Cadastro completo — o formulário de ficha precisa dele para a busca de paciente. */
  todosPacientes: Patient[];
  templates: AnamnesisTemplate[];
  generalQuestions: AnamnesisQuestion[];
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Profissional logada — já vem escolhida ao emitir uma avaliação. */
  currentProfessionalId?: string;
  onVoltar: () => void;
  onSalvarPaciente: (patient: Patient) => Promise<void>;
  onSalvarFicha: (record: AnamnesisRecord) => Promise<void>;
  onExcluirFicha: (recordId: string) => Promise<void>;
  /** Tudo o que a aba de atendimentos faz mora no módulo — aqui só a tela. */
  onNovoAtendimento: () => void;
  onEditarAtendimento: (a: Attendance) => void;
  onExcluirAtendimento: (a: Attendance) => void;
  onConfirmarAtendimento: (a: Attendance) => void;
  /**
   * Abre o acompanhamento (o registro pós-atendimento, com os materiais usados) de uma visita já
   * realizada.
   */
  onAcompanhamentoAtendimento: (a: Attendance) => void;
  onFaltouAtendimento: (a: Attendance) => void;
  onRemarcarAtendimento: (a: Attendance) => void;
  onAdicionarSessao: (planoId: string) => void;
  onEncerrarPlano: (plano: SessionPlan) => void;
  onReabrirPlano: (plano: SessionPlan) => void;
  onExcluirPlano: (plano: SessionPlan) => void;
}

/**
 * As abas da ficha.
 *
 * `resumo` é a primeira e a padrão: é ela que responde "o que eu preciso saber antes de atender
 * esta pessoa". As outras juntam documentos parentes numa aba só, separados por filtro:
 *
 * - **Fichas**: anamneses e acompanhamentos. O acompanhamento é aberto pela linha do atendimento,
 *   então o filtro "Acompanhamentos" é a lista de atendimentos — com os pacotes e os agendados.
 * - **Financeiro**: orçamentos e recibos.
 */
type Aba = 'resumo' | 'fichas' | 'fotos' | 'financeiro';
type FiltroDeFichas = 'todas' | 'anamneses' | 'acompanhamentos';
type FiltroDoFinanceiro = 'orcamentos' | 'recibos';

/** O que o menu "Novo" cria — na ordem da jornada da paciente. */
type TipoNovo = 'orcamento' | 'recibo' | 'anamnese' | 'avaliacao' | 'atendimento';

/** A data de atendimento pode estar em "YYYY-MM-DD" ou em ISO completo, conforme a origem da ficha. */
const formatarDataAtendimento = (valor: string): string =>
  valor?.length === 10 ? formatDateOnly(valor) : formatDate(valor);

/**
 * Página de um paciente: o cabeçalho, os dados pessoais editáveis numa linha recolhida, as ações
 * rápidas e, abaixo, as abas — Resumo, Fichas, Fotos e Financeiro. O "Novo" já abre cada
 * formulário com o paciente escolhido.
 */
export const PatientDetailView: React.FC<PatientDetailViewProps> = ({
  patient,
  records,
  quotes,
  recibos,
  atendimentos,
  planos,
  avaliacoes,
  acompanhamentos,
  todosPacientes,
  templates,
  generalQuestions,
  clinic,
  catalogProcedures,
  currentProfessionalId,
  onVoltar,
  onSalvarPaciente,
  onSalvarFicha,
  onExcluirFicha,
  onNovoAtendimento,
  onEditarAtendimento,
  onExcluirAtendimento,
  onConfirmarAtendimento,
  onAcompanhamentoAtendimento,
  onFaltouAtendimento,
  onRemarcarAtendimento,
  onAdicionarSessao,
  onEncerrarPlano,
  onReabrirPlano,
  onExcluirPlano,
}) => {
  /**
   * Mapa corporal do laser, montado do catálogo — a ficha impressa desta tela precisa desenhar as
   * áreas, e o registro guarda só os IDs e nomes delas.
   */
  const mapaDoLaser = React.useMemo(
    () => montarEspelhoPublico(catalogProcedures, clinic),
    [catalogProcedures, clinic]
  );

  const [aba, setAba] = useState<Aba>('resumo');
  const [filtroFichas, setFiltroFichas] = useState<FiltroDeFichas>('todas');
  const [filtroFinanceiro, setFiltroFinanceiro] = useState<FiltroDoFinanceiro>('orcamentos');
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [menuNovoAberto, setMenuNovoAberto] = useState(false);
  const menuNovoRef = useRef<HTMLDivElement>(null);

  const [fichaModalAberto, setFichaModalAberto] = useState(false);
  const [fichaAberta, setFichaAberta] = useState<AnamnesisRecord | null>(null);
  /** Novo, visualizar, compartilhar, duplicar, substituir — as mesmas ações da tela de Orçamentos. */
  const acoesDeOrcamento = useAcoesDeOrcamento({
    clinic,
    procedures: catalogProcedures,
    patients: todosPacientes,
    onErro: (mensagem) => setConfirmacao(aviso('Nem tudo foi salvo', mensagem, 'perigo')),
  });
  const recibosCtx = useRecibos();
  const [emitindoAvaliacao, setEmitindoAvaliacao] = useState(false);
  const [avaliacaoAberta, setAvaliacaoAberta] = useState<EvaluationRecord | null>(null);

  useEffect(() => {
    if (!menuNovoAberto) return;
    const clicouFora = (e: MouseEvent) => {
      if (menuNovoRef.current && !menuNovoRef.current.contains(e.target as Node)) {
        setMenuNovoAberto(false);
      }
    };
    document.addEventListener('mousedown', clicouFora);
    return () => document.removeEventListener('mousedown', clicouFora);
  }, [menuNovoAberto]);

  const irParaFichas = (filtro: FiltroDeFichas) => {
    setAba('fichas');
    setFiltroFichas(filtro);
  };
  const irParaFinanceiro = (filtro: FiltroDoFinanceiro) => {
    setAba('financeiro');
    setFiltroFinanceiro(filtro);
  };

  /** O menu leva para a aba (e o filtro) do que foi criado — o resultado aparece onde a pessoa olhou. */
  const criarNovo = (tipo: TipoNovo) => {
    setMenuNovoAberto(false);
    if (tipo === 'atendimento') {
      irParaFichas('acompanhamentos');
      onNovoAtendimento();
    } else if (tipo === 'anamnese') {
      irParaFichas('anamneses');
      setFichaModalAberto(true);
    } else if (tipo === 'recibo') {
      irParaFinanceiro('recibos');
      recibosCtx?.abrirNovo(patient);
    } else if (tipo === 'avaliacao') {
      // A avaliação aparece na linha do tempo do Resumo, que é onde ela mora nesta página.
      setAba('resumo');
      setEmitindoAvaliacao(true);
    } else {
      irParaFinanceiro('orcamentos');
      acoesDeOrcamento.abrirNovo(patient);
    }
  };

  /** Agendamento futuro não é atendimento feito — o contador da aba conta só o que aconteceu. */
  const totalAtendimentos = contarAtendimentosRealizados(atendimentos);

  const whatsAppUrl = buildWhatsAppUrl(patient.contato);
  const iniciais = iniciaisDe(patient.nome);
  const idade = idadeDe(patient.dataNascimento);
  const desde = pacienteDesde(patient, atendimentos);
  const fotos = React.useMemo(
    () => fotosDaPaciente(records, avaliacoes, acompanhamentos),
    [records, avaliacoes, acompanhamentos]
  );
  /** Um elemento só, para o Resumo e a aba Fotos mostrarem o mesmo antes e depois. */
  const antesEDepois = (
    <AntesEDepois patient={patient} fotos={fotos} onSalvarPaciente={onSalvarPaciente} />
  );

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-4 sm:pt-8 pb-8 sm:pb-10">
      {/* Volta para a lista */}
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 min-h-[44px] -ml-1 pr-2 text-[14px] font-semibold text-ink-soft hover:text-ink transition-colors mb-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Pacientes
      </button>

      {/* Cabeçalho */}
      <div className="flex items-start gap-3.5 mb-4">
        {/* Avatar de iniciais. Sem foto de perfil no sistema, ele existe para dar à página um
            ponto de ancoragem visual — e para a lista e a ficha se reconhecerem uma na outra. */}
        <span
          aria-hidden
          className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-full bg-ink text-brand-pale flex items-center justify-center font-serif-luxury text-title-lg font-semibold"
        >
          {iniciais}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="font-serif-luxury text-[30px] sm:text-[38px] font-semibold text-ink break-words leading-[1.1]">
            {patient.nome}
          </h1>
          <p className="text-body text-ink-soft mt-0.5">
            {[
              idade !== undefined ? `${idade} anos` : null,
              desde ? `paciente desde ${formatDateOnly(desde)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-label text-muted mt-0.5">
            {quotes.length} orçamento{quotes.length === 1 ? '' : 's'} · {records.length} anamnese
            {records.length === 1 ? '' : 's'} · {avaliacoes.length} avaliaç
            {avaliacoes.length === 1 ? 'ão' : 'ões'} · {totalAtendimentos} atendimento
            {totalAtendimentos === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Dados pessoais, numa linha recolhida logo abaixo do cabeçalho — fora das abas, ficam à
          mão em qualquer uma delas, e trocar de aba no meio de uma edição não perde o que foi
          digitado. */}
      <div className="mb-4">
        <PatientPersonalDataCard patient={patient} onSalvar={onSalvarPaciente} />
      </div>

      {/* As duas ações que valem um toque a partir daqui. Larguras iguais no celular: com a
          paciente na frente, o dedo mira pela posição, não pelo rótulo. */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <a
          href={whatsAppUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!whatsAppUrl}
          title={whatsAppUrl ? 'Abrir conversa no WhatsApp' : 'Sem telefone no cadastro'}
          onClick={(e) => {
            if (!whatsAppUrl) e.preventDefault();
          }}
          className={`flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-xl border transition-colors ${
            whatsAppUrl
              ? 'border-line bg-card text-ink hover:border-brand'
              : 'border-line bg-surface-2 text-muted cursor-not-allowed'
          }`}
        >
          <MessageCircle className={`w-5 h-5 ${whatsAppUrl ? 'text-whatsapp' : ''}`} />
          <span className="text-body font-semibold">WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={() => criarNovo('atendimento')}
          className="flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-xl border border-line bg-card text-ink hover:border-brand transition-colors"
        >
          <CalendarPlus className="w-5 h-5 text-brand" />
          <span className="text-body font-semibold">Agendar</span>
        </button>
      </div>

      {/* "Novo" continua existindo para o que não cabe nas duas ações rápidas — o orçamento
          inclusive. */}
      <div ref={menuNovoRef} className="relative mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setMenuNovoAberto((a) => !a)}
          aria-haspopup="menu"
          aria-expanded={menuNovoAberto}
          className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg border border-line bg-card text-body font-semibold text-ink hover:border-brand transition-colors"
        >
          <Plus className="w-4 h-4 text-brand" />
          Novo
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {menuNovoAberto && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-52 bg-card rounded-xl border border-line shadow-xl overflow-hidden"
          >
            {(
              [
                { tipo: 'orcamento' as const, icone: Receipt, rotulo: 'Orçamento' },
                ...(recibosCtx ? [{ tipo: 'recibo' as const, icone: ReceiptText, rotulo: 'Recibo' }] : []),
                { tipo: 'anamnese' as const, icone: ClipboardList, rotulo: 'Anamnese' },
                { tipo: 'avaliacao' as const, icone: ClipboardCheck, rotulo: 'Avaliação' },
                { tipo: 'atendimento' as const, icone: CalendarClock, rotulo: 'Atendimento' },
              ]
            ).map(({ tipo, icone: Icone, rotulo }) => (
              <button
                key={tipo}
                type="button"
                role="menuitem"
                onClick={() => criarNovo(tipo)}
                className="w-full flex items-center gap-2.5 min-h-[48px] px-3.5 text-left text-body-lg text-ink hover:bg-surface-2 transition-colors"
              >
                <Icone className="w-4 h-4 text-brand" />
                {rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* As quatro abas. Deslizam no celular em vez de quebrar em duas linhas: com o contador em
          cada uma, elas não cabem lado a lado em 375px, e empilhar empurraria o conteúdo para
          fora da primeira dobra. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto mb-4">
        <div className="flex items-center gap-2 w-max">
          {(
            [
              { id: 'resumo' as const, icone: LayoutList, rotulo: 'Resumo', total: undefined },
              {
                id: 'fichas' as const,
                icone: ClipboardList,
                rotulo: 'Fichas',
                total: records.length + totalAtendimentos,
              },
              { id: 'fotos' as const, icone: Images, rotulo: 'Fotos', total: fotos.length },
              {
                id: 'financeiro' as const,
                icone: Banknote,
                rotulo: 'Financeiro',
                total: quotes.length + recibos.length,
              },
            ]
          ).map((filtro) => {
            const Icone = filtro.icone;
            const ativo = aba === filtro.id;
            return (
              <button
                key={filtro.id}
                type="button"
                onClick={() => setAba(filtro.id)}
                aria-pressed={ativo}
                className={`flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl border text-body font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
                  ativo
                    ? 'bg-ink text-white border-ink'
                    : 'bg-card text-ink-soft border-line hover:border-brand'
                }`}
              >
                <Icone className="w-4 h-4" />
                {filtro.rotulo}
                {filtro.total !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-label tabular-nums ${
                      ativo ? 'bg-white/15 text-brand-light' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {filtro.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Resumo: alerta da anamnese, pacotes em curso, antes/depois e linha do tempo. */}
      {aba === 'resumo' && (
        <PatientResumoTab
          records={records}
          atendimentos={atendimentos}
          planos={planos}
          quotes={quotes}
          avaliacoes={avaliacoes}
          catalogProcedures={catalogProcedures}
          acoes={{
            orcamento: acoesDeOrcamento,
            onVerAnamnese: setFichaAberta,
            onVerAvaliacao: setAvaliacaoAberta,
            onAcompanhamento: onAcompanhamentoAtendimento,
          }}
          onIrParaFichas={irParaFichas}
          onAgendarSessao={(plano) => {
            irParaFichas('acompanhamentos');
            onAdicionarSessao(plano.id);
          }}
          antesEDepois={antesEDepois}
        />
      )}

      {/* Fotos: o mesmo antes e depois do Resumo e, abaixo, todas as fotos das fichas dela. */}
      {aba === 'fotos' && (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="font-serif-luxury text-title text-ink">Antes e depois</h3>
            {antesEDepois}
          </section>
          {fotos.length > 0 && (
            <div>
              <h3 className="font-serif-luxury text-title text-ink mb-2">
                Todas as fotos ({fotos.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {fotos.map((f, i) => (
                  <figure key={`${f.fichaId}-${i}`} className="glass-card overflow-hidden">
                    <img
                      src={f.url}
                      alt={`${f.procedimentoNome} em ${formatDateOnly(f.data.slice(0, 10))}`}
                      loading="lazy"
                      className="w-full aspect-[4/5] object-cover"
                    />
                    <figcaption className="px-2.5 py-2">
                      <span className="block text-body font-semibold text-brand tabular-nums">
                        {formatDateOnly(f.data.slice(0, 10))}
                      </span>
                      <span className="block text-body text-muted truncate">
                        {[ROTULO_DA_ORIGEM[f.tipo], f.procedimentoNome].filter(Boolean).join(' · ')}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fichas: anamneses e acompanhamentos, com o filtro em cima. "Todas" mostra as duas listas,
          uma abaixo da outra. */}
      {aba === 'fichas' && (
        <div className="space-y-5">
          <FiltrosDaAba
            rotulo="Tipo de ficha"
            ativo={filtroFichas}
            onSelecionar={setFiltroFichas}
            opcoes={[
              { id: 'todas', rotulo: 'Todas', total: records.length + totalAtendimentos },
              { id: 'anamneses', rotulo: 'Anamneses', total: records.length },
              { id: 'acompanhamentos', rotulo: 'Acompanhamentos', total: totalAtendimentos },
            ]}
          />

          {filtroFichas !== 'acompanhamentos' && (
            <section className="space-y-2">
              {filtroFichas === 'todas' && (
                <h3 className="font-serif-luxury text-title text-ink">Anamneses</h3>
              )}
              {records.length === 0 ? (
                <div className="glass-card rounded-sm py-14 text-center">
                  <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">
                    Nenhuma anamnese para {patient.nome.split(' ')[0]} ainda.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map((ficha) => (
                    <div
                      key={ficha.id}
                      className="glass-card glass-card-hover rounded-sm p-4 flex flex-wrap items-center gap-4"
                    >
                      <div className="flex-1 min-w-[160px]">
                        <p className="text-sm text-ink truncate">{ficha.procedimentoNome}</p>
                        <p className="flex items-center gap-1.5 text-body text-gray-400 truncate">
                          <Calendar className="w-3 h-3 shrink-0" />
                          {formatarDataAtendimento(ficha.dataAtendimento)}
                          {ficha.profissionalNome && ` · ${ficha.profissionalNome}`}
                        </p>
                      </div>

                      {ficha.origemPreenchimento === 'online_paciente' && !anamneseFechada(ficha) && (
                        <span className="px-2 py-0.5 text-label font-semibold uppercase tracking-wider rounded-xs border bg-amber-50 text-amber-700 border-amber-200">
                          Aguardando atendimento
                        </span>
                      )}

                      <div className="flex items-center gap-0.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => setFichaAberta(ficha)}
                          aria-label={`Abrir a ficha de ${ficha.procedimentoNome}`}
                          title="Ver ficha e imprimir"
                          className="p-2 text-gray-400 hover:text-brand transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/*
                          Saída manual da trava automática, que depende de haver atendimento realizado
                          lançado no sistema. A clínica que não usa o módulo de atendimentos com
                          disciplina deixaria o link da paciente aberto indefinidamente — este botão
                          fecha sem depender de inferência nenhuma. Reabrir é possível, mas não
                          destrava o que o atendimento fechou: ali o que vale é o fato da visita.
                        */}
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmacao(
                              ficha.encerradaEm
                                ? {
                                    titulo: 'Reabrir esta ficha?',
                                    mensagem:
                                      'A paciente volta a poder editar as respostas pelo link que ' +
                                      'recebeu. Se já houver atendimento realizado deste procedimento, ' +
                                      'a ficha fecha de novo sozinha.',
                                    textoConfirmar: 'Reabrir',
                                    tom: 'neutro',
                                    onConfirmar: () => {
                                      reabrirAnamnese(ficha.id).catch((e) =>
                                        console.warn('Não foi possível reabrir a ficha:', e)
                                      );
                                    },
                                  }
                                : {
                                    titulo: 'Encerrar esta ficha?',
                                    mensagem:
                                      'O link da paciente fecha e as respostas param de poder ser ' +
                                      'editadas por ela. O PDF continua disponível para as duas partes.',
                                    textoConfirmar: 'Encerrar',
                                    tom: 'neutro',
                                    onConfirmar: () => {
                                      encerrarAnamnese(ficha.id).catch((e) =>
                                        console.warn('Não foi possível encerrar a ficha:', e)
                                      );
                                    },
                                  }
                            )
                          }
                          aria-label={
                            ficha.encerradaEm
                              ? `Reabrir a ficha de ${ficha.procedimentoNome}`
                              : `Encerrar a ficha de ${ficha.procedimentoNome}`
                          }
                          title={
                            ficha.profissionalPreenchidoEm && !ficha.encerradaEm
                              ? 'Ficha antiga, já complementada — permanece fechada'
                              : ficha.encerradaEm
                                ? 'Reabrir para a paciente editar'
                                : 'Encerrar: fecha o link da paciente'
                          }
                          disabled={!!ficha.profissionalPreenchidoEm && !ficha.encerradaEm}
                          className="p-2 text-gray-400 hover:text-brand transition-colors disabled:opacity-40 disabled:hover:text-gray-400"
                        >
                          {anamneseFechada(ficha) ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <Unlock className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmacao({
                              titulo: 'Excluir esta ficha?',
                              mensagem: `Ficha de ${ficha.pacienteNome} — ${ficha.procedimentoNome}.\n\nTodas as respostas e anotações registradas nela são apagadas para sempre.`,
                              textoConfirmar: 'Excluir ficha',
                              onConfirmar: () => onExcluirFicha(ficha.id),
                            })
                          }
                          aria-label={`Excluir a ficha de ${ficha.procedimentoNome}`}
                          title="Excluir ficha"
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {filtroFichas !== 'anamneses' && (
            <section className="space-y-2">
              {filtroFichas === 'todas' && (
                <h3 className="font-serif-luxury text-title text-ink">Acompanhamentos</h3>
              )}
              <AttendancesTab
                atendimentos={atendimentos}
                planos={planos}
                primeiroNome={patient.nome.split(' ')[0]}
                onNovo={onNovoAtendimento}
                onEditar={onEditarAtendimento}
                onExcluir={onExcluirAtendimento}
                onConfirmar={onConfirmarAtendimento}
                onAcompanhamento={onAcompanhamentoAtendimento}
                onFaltou={onFaltouAtendimento}
                onRemarcar={onRemarcarAtendimento}
                onAdicionarSessao={onAdicionarSessao}
                onEncerrarPlano={onEncerrarPlano}
                onReabrirPlano={onReabrirPlano}
                onExcluirPlano={onExcluirPlano}
              />
            </section>
          )}
        </div>
      )}

      {/* Financeiro: orçamentos e recibos (as notas de recibo dela, vinculadas ou não a um
          orçamento), separados pelo filtro. */}
      {aba === 'financeiro' && (
        <div className="space-y-4">
          <FiltrosDaAba
            rotulo="Tipo de documento"
            ativo={filtroFinanceiro}
            onSelecionar={setFiltroFinanceiro}
            opcoes={[
              { id: 'orcamentos', rotulo: 'Orçamentos', total: quotes.length },
              { id: 'recibos', rotulo: 'Recibos', total: recibos.length },
            ]}
          />

          {filtroFinanceiro === 'recibos' ? (
            <ListaDeRecibos
              primeiroNome={patient.nome.split(' ')[0]}
              recibos={recibos}
              orcamentosPagosSemRecibo={quotes.filter(
                (q) => q.status === 'pago' && !recibos.some((r) => r.quoteId === q.id)
              )}
              onNovo={() => recibosCtx?.abrirNovo(patient)}
              onCriarDoOrcamento={(q) => recibosCtx?.abrirDoOrcamento(q)}
              onAbrirOrcamento={(quoteId) => {
                const q = quotes.find((o) => o.id === quoteId);
                if (q) acoesDeOrcamento.abrirPrevia(q);
              }}
              erro={recibosCtx?.erro || null}
            />
          ) : quotes.length === 0 ? (
            <div className="glass-card rounded-sm py-14 text-center">
              <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Nenhum orçamento para {patient.nome.split(' ')[0]} ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {quotes.map((orcamento) => (
                <div
                  key={orcamento.id}
                  className="glass-card glass-card-hover rounded-sm p-4 flex flex-wrap items-center gap-4"
                >
                  <div className="min-w-[110px]">
                    <p className="font-serif-luxury text-lg text-ink tabular-nums">
                      {orcamento.numero}
                    </p>
                    <p className="text-body text-gray-400">{formatDate(orcamento.dataEmissao)}</p>
                  </div>

                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm font-semibold text-ink tabular-nums">
                      {formatBRL(orcamento.total)}
                    </p>
                    <p className="text-body text-gray-400 truncate">
                      {orcamento.itens.length} procedimento
                      {orcamento.itens.length === 1 ? '' : 's'} · válido até{' '}
                      {formatDate(orcamento.dataValidade)}
                    </p>
                  </div>

                  <QuoteDesfecho quote={orcamento} />

                  <div className="flex items-center gap-0.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => acoesDeOrcamento.abrirCompartilhamento(orcamento)}
                      aria-label={`Compartilhar ${orcamento.numero}`}
                      title="Compartilhar link com a cliente"
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => acoesDeOrcamento.abrirPrevia(orcamento)}
                      aria-label={`Visualizar ${orcamento.numero}`}
                      title="Visualizar — o botão de salvar PDF fica dentro da prévia"
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {podeSubstituir(orcamento) && (
                      <button
                        type="button"
                        onClick={() => acoesDeOrcamento.abrirSubstituicao(orcamento)}
                        aria-label={`Substituir ${orcamento.numero}`}
                        title="Substituir — cria um novo com número próprio"
                        className="p-2 text-gray-400 hover:text-brand transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => acoesDeOrcamento.abrirDuplicacao(orcamento)}
                      aria-label={`Duplicar ${orcamento.numero}`}
                      title="Duplicar"
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nova anamnese — já com este paciente escolhido */}
      <AnamnesisFormFillModal
        isOpen={fichaModalAberto}
        onClose={() => setFichaModalAberto(false)}
        patients={todosPacientes}
        templates={templates}
        generalQuestions={generalQuestions}
        clinicProfile={clinic}
        catalogProcedures={catalogProcedures}
        initialPatientId={patient.id}
        onSavePatient={onSalvarPaciente}
        onSaveRecord={onSalvarFicha}
        onOpenRecordDetail={(rec) => setFichaAberta(rec)}
      />

      {/* Ficha aberta para leitura / impressão. A imagem orientativa e o termo vivem na
          ficha-modelo, não no registro — por isso a busca pelo template aqui. */}
      {fichaAberta &&
        (() => {
          const template = templates.find(
            (t) => t.id === (fichaAberta.templateId || fichaAberta.procedimentoId)
          );
          return (
            <PrintableAnamnesisSheet
              mapaCorporal={mapaDoLaser}
              record={records.find((r) => r.id === fichaAberta.id) || fichaAberta}
              clinicProfile={clinic}
              onClose={() => setFichaAberta(null)}
              viewerRole="staff"
              onSaveRecord={onSalvarFicha}
              orientationImage={resolveOrientationImage(template)}
              consentSections={resolveConsentTerm(template)}
            />
          );
        })()}

      {/* Formulário, prévia e compartilhamento de orçamento. */}
      {acoesDeOrcamento.modais}

      {/* Nova avaliação — já com esta paciente escolhida. Sempre montado: é ele que guarda a
          ficha em preenchimento depois de o painel de emissão fechar. */}
      <EmissaoDeAvaliacao
        aberto={emitindoAvaliacao}
        onFechar={() => setEmitindoAvaliacao(false)}
        pacientes={todosPacientes}
        catalogo={catalogProcedures}
        professionals={clinic.professionals || []}
        clinic={clinic}
        professionalIdPadrao={currentProfessionalId}
        pacienteInicial={patient}
        onMontarOrcamento={(avaliacao) => acoesDeOrcamento.abrirDaAvaliacao(avaliacao, patient)}
      />

      {avaliacaoAberta && (
        <FichaFillModal
          tipo="avaliacao"
          isOpen
          onClose={() => setAvaliacaoAberta(null)}
          alvo={alvoDoRegistro(avaliacaoAberta)}
          paciente={patient}
          catalogo={catalogProcedures}
          professionals={clinic.professionals || []}
          clinicProfile={clinic}
          onMontarOrcamento={(avaliacao) => acoesDeOrcamento.abrirDaAvaliacao(avaliacao, patient)}
        />
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

/**
 * Os filtros de dentro de uma aba — os mesmos chips das outras listas do sistema, cada um com o
 * seu contador. Quebram linha em vez de deslizar: em 375px "Acompanhamentos" ficaria cortado no
 * meio, e são poucos chips — a segunda linha custa menos que um filtro escondido.
 */
function FiltrosDaAba<T extends string>({
  rotulo,
  opcoes,
  ativo,
  onSelecionar,
}: {
  rotulo: string;
  opcoes: { id: T; rotulo: string; total: number }[];
  ativo: T;
  onSelecionar: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap items-center gap-1.5">
      {opcoes.map((o) => (
        <Chip key={o.id} ativo={ativo === o.id} onClick={() => onSelecionar(o.id)}>
          {o.rotulo}
          <span className="tabular-nums opacity-60">{o.total}</span>
        </Chip>
      ))}
    </div>
  );
}

/**
 * O filtro "Recibos" do Financeiro: o total recebido, as notas de recibo (cada uma abre a prévia,
 * de onde sai o PDF para ela) e o "Novo recibo" já com ela escolhida.
 *
 * Orçamento dela pago sem nota de recibo aparece em cima, com o atalho — é o pagamento que ficou
 * sem documento.
 */
const ListaDeRecibos: React.FC<{
  primeiroNome: string;
  recibos: Recibo[];
  orcamentosPagosSemRecibo: Quote[];
  onNovo: () => void;
  onCriarDoOrcamento: (quote: Quote) => void;
  onAbrirOrcamento: (quoteId: string) => void;
  erro: string | null;
}> = ({ primeiroNome, recibos, orcamentosPagosSemRecibo, onNovo, onCriarDoOrcamento, onAbrirOrcamento, erro }) => {
  const total = recibos.reduce((soma, r) => soma + r.valor, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label uppercase tracking-wider font-semibold text-muted">Total recebido</p>
          <p className="font-serif-luxury text-title-lg text-ink tabular-nums">{formatBRL(total)}</p>
        </div>
        <button
          type="button"
          onClick={onNovo}
          className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors shrink-0"
        >
          <Plus className="w-[18px] h-[18px]" />
          Novo recibo
        </button>
      </div>

      {erro && (
        <p className="px-4 py-3 rounded-[14px] bg-danger-bg text-[14px] text-danger">{erro}</p>
      )}

      {orcamentosPagosSemRecibo.length > 0 && (
        <div className="rounded-[16px] bg-info-bg border border-info-line px-4 py-3 space-y-2">
          <p className="text-[14px] text-info font-semibold">
            {orcamentosPagosSemRecibo.length === 1
              ? 'Orçamento pago sem nota de recibo'
              : `${orcamentosPagosSemRecibo.length} orçamentos pagos sem nota de recibo`}
          </p>
          {orcamentosPagosSemRecibo.map((q) => (
            <div key={q.id} className="flex items-center justify-between gap-3">
              <span className="text-[14px] text-ink tabular-nums truncate">
                Nº {q.numero} · {formatBRL(q.total)}
                {q.pagoEm ? ` · pago em ${formatDate(q.pagoEm)}` : ''}
              </span>
              <button
                type="button"
                onClick={() => onCriarDoOrcamento(q)}
                className="shrink-0 inline-flex items-center gap-1.5 min-h-[36px] text-[14px] font-semibold text-info hover:underline underline-offset-4"
              >
                <ReceiptText className="w-4 h-4" />
                Criar nota de recibo
              </button>
            </div>
          ))}
        </div>
      )}

      {recibos.length === 0 ? (
        <div className="glass-card rounded-sm py-14 text-center">
          <Banknote className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma nota de recibo para {primeiroNome} ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recibos.map((r) => (
            <CartaoDeRecibo key={r.id} recibo={r} onAbrirOrcamento={onAbrirOrcamento} />
          ))}
        </div>
      )}
    </div>
  );
};
