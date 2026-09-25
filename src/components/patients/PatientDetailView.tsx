import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  Images,
  LayoutList,
  Eye,
  FileText,
  Lock,
  MessageCircle,
  Plus,
  Receipt,
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
  Patient,
  Procedure,
  Quote,
  QuoteDraft,
  SessionPlan,
} from '../../types';
import { formatBRL, formatDate, formatDateOnly } from '../../utils/formatters';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { AnamnesisFormFillModal } from '../anamnesis/AnamnesisFormFillModal';
import { montarEspelhoPublico } from '../../utils/laserAreas';
import { PrintableAnamnesisSheet } from '../anamnesis/PrintableAnamnesisSheet';
import { QuoteFormModal } from '../quotes/QuoteFormModal';
import { QuotePreviewModal } from '../quotes/QuotePreviewModal';
import { QuoteShareModal } from '../quotes/QuoteShareModal';
import { QuoteDesfecho } from '../quotes/QuoteDesfecho';
import { PatientPersonalDataCard } from './PatientPersonalDataCard';
import { AttendancesTab, contarAtendimentosRealizados } from './AttendancesTab';
import { anamneseFechada } from '../../utils/evaluations';
import { encerrarAnamnese, reabrirAnamnese } from '../../services/databaseService';
import {
  fotosDaPaciente,
  idadeDe,
  iniciaisDe,
  pacienteDesde,
} from '../../utils/pacienteResumo';
import { PatientResumoTab } from './PatientResumoTab';
import { BeforeAfterCompare } from './BeforeAfterCompare';

interface PatientDetailViewProps {
  patient: Patient;
  /** Fichas deste paciente, das mais recentes para as mais antigas. */
  records: AnamnesisRecord[];
  /** Orçamentos deste paciente, dos mais recentes para os mais antigos. */
  quotes: Quote[];
  /** Atendimentos e agendamentos dele. */
  atendimentos: Attendance[];
  /** Planos de sessão dele — quem agrupa os atendimentos na aba. */
  planos: SessionPlan[];
  /** Cadastro completo — o formulário de ficha precisa dele para a busca de paciente. */
  todosPacientes: Patient[];
  templates: AnamnesisTemplate[];
  generalQuestions: AnamnesisQuestion[];
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  onVoltar: () => void;
  onSalvarPaciente: (patient: Patient) => Promise<void>;
  onSalvarFicha: (record: AnamnesisRecord) => Promise<void>;
  onExcluirFicha: (recordId: string) => Promise<void>;
  onSalvarOrcamento: (draft: QuoteDraft, existing?: Quote) => Promise<void>;
  onOrcamentoCompartilhado: (quote: Quote) => void;
  /** Tudo o que a aba de atendimentos faz mora no módulo — aqui só a tela. */
  onNovoAtendimento: () => void;
  onEditarAtendimento: (a: Attendance) => void;
  onExcluirAtendimento: (a: Attendance) => void;
  onConfirmarAtendimento: (a: Attendance) => void;
  /** Abre a ficha de avaliação de uma visita já realizada. */
  onAvaliarAtendimento: (a: Attendance) => void;
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
 * esta pessoa". As outras três são consulta de um tipo de documento.
 *
 * "Atendimentos" virou "Fichas" no rótulo — o conteúdo é o mesmo — porque com a aba Resumo ao
 * lado a palavra "atendimento" passou a significar duas coisas na mesma linha de botões.
 */
type Aba = 'resumo' | 'atendimentos' | 'fotos' | 'orcamentos' | 'anamneses';

/** As três coisas que o menu "Novo" cria. */
type TipoNovo = 'atendimento' | 'anamnese' | 'orcamento';

/** A data de atendimento pode estar em "YYYY-MM-DD" ou em ISO completo, conforme a origem da ficha. */
const formatarDataAtendimento = (valor: string): string =>
  valor?.length === 10 ? formatDateOnly(valor) : formatDate(valor);

/**
 * Página de um paciente: os dados pessoais dele no topo (editáveis) e, abaixo, o histórico
 * dividido em anamneses e orçamentos — cada lado com o seu "novo", que já abre o formulário
 * correspondente com o paciente escolhido.
 */
export const PatientDetailView: React.FC<PatientDetailViewProps> = ({
  patient,
  records,
  quotes,
  atendimentos,
  planos,
  todosPacientes,
  templates,
  generalQuestions,
  clinic,
  catalogProcedures,
  onVoltar,
  onSalvarPaciente,
  onSalvarFicha,
  onExcluirFicha,
  onSalvarOrcamento,
  onOrcamentoCompartilhado,
  onNovoAtendimento,
  onEditarAtendimento,
  onExcluirAtendimento,
  onConfirmarAtendimento,
  onAvaliarAtendimento,
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
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [menuNovoAberto, setMenuNovoAberto] = useState(false);
  const menuNovoRef = useRef<HTMLDivElement>(null);

  const [fichaModalAberto, setFichaModalAberto] = useState(false);
  const [fichaAberta, setFichaAberta] = useState<AnamnesisRecord | null>(null);
  const [orcamentoModalAberto, setOrcamentoModalAberto] = useState(false);
  const [orcamentoNaPrevia, setOrcamentoNaPrevia] = useState<Quote | null>(null);
  const [orcamentoParaCompartilhar, setOrcamentoParaCompartilhar] = useState<Quote | null>(null);

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

  /** O menu leva para a aba do que foi criado — o resultado aparece onde a pessoa olhou. */
  const criarNovo = (tipo: TipoNovo) => {
    setMenuNovoAberto(false);
    if (tipo === 'atendimento') {
      setAba('atendimentos');
      onNovoAtendimento();
    } else if (tipo === 'anamnese') {
      setAba('anamneses');
      setFichaModalAberto(true);
    } else {
      setAba('orcamentos');
      setOrcamentoModalAberto(true);
    }
  };

  /** Agendamento futuro não é atendimento feito — o contador da aba conta só o que aconteceu. */
  const totalAtendimentos = contarAtendimentosRealizados(atendimentos);

  const whatsAppUrl = buildWhatsAppUrl(patient.contato);
  const iniciais = iniciaisDe(patient.nome);
  const idade = idadeDe(patient.dataNascimento);
  const desde = pacienteDesde(patient, atendimentos);
  const fotos = React.useMemo(() => fotosDaPaciente(records), [records]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Volta para a lista */}
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-brand transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Todos os pacientes
      </button>

      {/* Cabeçalho */}
      <div className="flex items-start gap-3.5 mb-4">
        {/* Avatar de iniciais. Sem foto de perfil no sistema, ele existe para dar à página um
            ponto de ancoragem visual — e para a lista e a ficha se reconhecerem uma na outra. */}
        <span
          aria-hidden
          className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-full bg-brand-bg text-brand flex items-center justify-center font-serif-luxury text-title-lg"
        >
          {iniciais}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="font-serif-luxury text-title-lg sm:text-display text-ink break-words leading-tight">
            {patient.nome}
          </h1>
          <p className="text-body text-muted mt-0.5">
            {[
              idade !== undefined ? `${idade} anos` : null,
              desde ? `paciente desde ${formatDateOnly(desde)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-label text-muted mt-0.5">
            {totalAtendimentos} atendimento{totalAtendimentos === 1 ? '' : 's'} ·{' '}
            {records.length} anamnese{records.length === 1 ? '' : 's'} · {quotes.length} orçamento
            {quotes.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* As três ações que valem um toque a partir daqui. Larguras iguais no celular: com a
          paciente na frente, o dedo mira pela posição, não pelo rótulo. */}
      <div className="grid grid-cols-3 gap-2 mb-5">
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

        <button
          type="button"
          onClick={() => criarNovo('orcamento')}
          className="flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-xl border border-line bg-card text-ink hover:border-brand transition-colors"
        >
          <Receipt className="w-5 h-5 text-brand" />
          <span className="text-body font-semibold">Orçamento</span>
        </button>
      </div>

      {/* "Novo" continua existindo para o que não cabe nas três ações rápidas. */}
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
                { tipo: 'atendimento' as const, icone: CalendarClock, rotulo: 'Atendimento' },
                { tipo: 'anamnese' as const, icone: ClipboardList, rotulo: 'Anamnese' },
                { tipo: 'orcamento' as const, icone: Receipt, rotulo: 'Orçamento' },
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

      {/* As cinco abas. Deslizam no celular em vez de quebrar em três linhas: com o contador em
          cada uma, elas não cabem lado a lado em 375px, e empilhar empurraria o conteúdo para
          fora da primeira dobra. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto mb-4">
        <div className="flex items-center gap-2 w-max">
          {(
            [
              { id: 'resumo' as const, icone: LayoutList, rotulo: 'Resumo', total: undefined },
              {
                id: 'atendimentos' as const,
                icone: CalendarClock,
                rotulo: 'Fichas',
                total: totalAtendimentos,
              },
              { id: 'fotos' as const, icone: Images, rotulo: 'Fotos', total: fotos.length },
              {
                id: 'orcamentos' as const,
                icone: Receipt,
                rotulo: 'Orçamentos',
                total: quotes.length,
              },
              {
                id: 'anamneses' as const,
                icone: ClipboardList,
                rotulo: 'Anamneses',
                total: records.length,
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
          catalogProcedures={catalogProcedures}
          onAbrirFicha={setFichaAberta}
          onAbrirOrcamento={setOrcamentoNaPrevia}
          onIrParaAba={setAba}
          onAgendarSessao={(plano) => {
            setAba('atendimentos');
            onAdicionarSessao(plano.id);
          }}
        />
      )}

      {/* Fotos: a galeria da paciente e o comparador. */}
      {aba === 'fotos' && (
        <div className="space-y-5">
          <BeforeAfterCompare fotos={fotos} />
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
                        {f.procedimentoNome}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de atendimentos, com os dados pessoais acima — é aqui que eles são editados. */}
      {aba === 'atendimentos' && (
        <div className="mb-5">
          <PatientPersonalDataCard patient={patient} onSalvar={onSalvarPaciente} />
        </div>
      )}
      {aba === 'atendimentos' && (
        <AttendancesTab
          atendimentos={atendimentos}
          planos={planos}
          primeiroNome={patient.nome.split(' ')[0]}
          onNovo={onNovoAtendimento}
          onEditar={onEditarAtendimento}
          onExcluir={onExcluirAtendimento}
          onConfirmar={onConfirmarAtendimento}
          onAvaliar={onAvaliarAtendimento}
          onFaltou={onFaltouAtendimento}
          onRemarcar={onRemarcarAtendimento}
          onAdicionarSessao={onAdicionarSessao}
          onEncerrarPlano={onEncerrarPlano}
          onReabrirPlano={onReabrirPlano}
          onExcluirPlano={onExcluirPlano}
        />
      )}

      {/* Lista de anamneses */}
      {aba === 'anamneses' &&
        (records.length === 0 ? (
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
        ))}

      {/* Lista de orçamentos */}
      {aba === 'orcamentos' &&
        (quotes.length === 0 ? (
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
                    onClick={() => setOrcamentoParaCompartilhar(orcamento)}
                    aria-label={`Compartilhar ${orcamento.numero}`}
                    title="Compartilhar link com a cliente"
                    className="p-2 text-gray-400 hover:text-brand transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrcamentoNaPrevia(orcamento)}
                    aria-label={`Visualizar ${orcamento.numero}`}
                    title="Visualizar — o botão de salvar PDF fica dentro da prévia"
                    className="p-2 text-gray-400 hover:text-brand transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

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

      {/* Novo orçamento — já com este paciente escolhido */}
      <QuoteFormModal
        isOpen={orcamentoModalAberto}
        onClose={() => setOrcamentoModalAberto(false)}
        onSave={onSalvarOrcamento}
        quoteToEdit={null}
        seedFrom={null}
        initialPatient={patient}
        procedures={catalogProcedures}
        patients={todosPacientes}
        clinic={clinic}
      />

      <QuotePreviewModal
        mapaCorporal={mapaDoLaser}
        quote={orcamentoNaPrevia}
        clinic={clinic}
        onClose={() => setOrcamentoNaPrevia(null)}
      />

      <QuoteShareModal
        quote={orcamentoParaCompartilhar}
        clinic={clinic}
        onClose={() => setOrcamentoParaCompartilhar(null)}
        onCompartilhado={onOrcamentoCompartilhado}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
