import React, { useEffect, useMemo, useRef } from 'react';
import { CheckCheck, MessageCircle, Plus } from 'lucide-react';
import { Attendance, ClinicProfile, Patient, Procedure, Professional } from '../../types';
import { DataISO } from '../../utils/attendances';
import {
  almocoDoDia,
  atendimentosDoDia,
  contatoDoAtendimento,
  corDaProfissional,
  duracaoDoAtendimento,
  ehConfirmado,
  expedienteDoDia,
  hhmmDeMinutos,
  horariosLivresDoDia,
  mensagemDeConfirmacao,
  minutosDoHHMM,
  nomeCurtoDaProfissional,
  nomeDaSala,
  ocupaAGrade,
  semHorario,
} from '../../utils/agenda';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { ROTULO_DA_SITUACAO, SituacaoDoCartao, situacaoDoCartao } from './AgendaCard';

/**
 * A visão de dia do celular.
 *
 * A grade proporcional da semana não sobrevive a 375px: um cartão de 30 minutos vira uma faixa
 * de 42px de altura, e nela não cabe hora, nome e procedimento. Aqui o dia é uma **lista** — uma
 * linha por horário, com a hora na coluna da esquerda, como uma agenda de papel.
 *
 * O que vem pela frente é bloco preto (é o que a recepção precisa achar de longe); o que já
 * aconteceu — compareceu, faltou, realizado — volta para o cartão claro, e o status fica escrito
 * em cada um, em vez de depender de uma legenda de cores.
 */

interface AgendaDiaMobileProps {
  data: DataISO;
  hoje: DataISO;
  atendimentos: Attendance[];
  clinic: ClinicProfile;
  catalogo: Procedure[];
  pacientes: Patient[];
  professionals: Professional[];
  rotulosDePlano: Map<string, string>;
  onAbrirAtendimento: (a: Attendance) => void;
  onNovoEm: (data: DataISO, hora: string) => void;
  onConfirmar: (a: Attendance) => void;
}

/** A cor do status escrito no bloco preto — todas acima de 7:1 sobre o #1A1A1A. */
const COR_NO_ESCURO: Partial<Record<SituacaoDoCartao, string>> = {
  confirmado: 'text-ok-claro',
  agendado: 'text-brand-pale',
  atrasado: 'text-[#FDE68A]',
};

/** A cor do status escrito no cartão claro. */
const COR_NO_CLARO: Partial<Record<SituacaoDoCartao, string>> = {
  compareceu: 'text-ok',
  realizado: 'text-ink-soft',
  faltou: 'text-danger',
};

/** A coluna da hora, à esquerda de cada linha. */
const Hora: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`w-12 shrink-0 text-[14px] font-semibold text-ink-soft tabular-nums ${className}`}>
    {children}
  </span>
);

export const AgendaDiaMobile: React.FC<AgendaDiaMobileProps> = ({
  data,
  hoje,
  atendimentos,
  clinic,
  catalogo,
  pacientes,
  professionals,
  rotulosDePlano,
  onAbrirAtendimento,
  onNovoEm,
  onConfirmar,
}) => {
  const agoraRef = useRef<HTMLDivElement>(null);

  const doDia = useMemo(() => atendimentosDoDia(atendimentos, data), [atendimentos, data]);
  const expediente = expedienteDoDia(clinic, data);
  const almoco = almocoDoDia(clinic, data);

  const livres = useMemo(
    () => horariosLivresDoDia(data, atendimentos, clinic, catalogo),
    [data, atendimentos, clinic, catalogo]
  );

  /**
   * As linhas do dia, em ordem de relógio: atendimento e horário livre misturados.
   *
   * Sem hora fica numa faixa à parte, acima de tudo — lançamento retroativo não tem hora e
   * inventar uma para ordená-lo seria criar dado que ninguém informou.
   */
  const linhas = useMemo(() => {
    const comHora = doDia
      .filter(ocupaAGrade)
      .map((a) => ({
        tipo: 'atendimento' as const,
        minuto: minutosDoHHMM(a.hora) ?? 0,
        atendimento: a,
      }));

    const vagos = livres.map((hora) => ({
      tipo: 'livre' as const,
      minuto: minutosDoHHMM(hora) ?? 0,
      hora,
    }));

    return [...comHora, ...vagos].sort((a, b) => a.minuto - b.minuto);
  }, [doDia, livres]);

  const semHora = doDia.filter(semHorario);

  const minutosAgora = new Date().getHours() * 60 + new Date().getMinutes();
  const ehHoje = data === hoje;

  /** Ao abrir o dia de hoje, rola até a linha de agora. */
  useEffect(() => {
    if (!ehHoje) return;
    const t = setTimeout(() => {
      agoraRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, [ehHoje, data]);

  /** Onde a linha vermelha de "agora" cabe: antes da primeira linha cujo horário já passou. */
  const indiceDeAgora = ehHoje ? linhas.findIndex((l) => l.minuto >= minutosAgora) : -1;

  const linhaDeAgora = (
    <div ref={agoraRef} className="flex items-center gap-2 h-7" aria-label="Agora">
      <span className="w-12 shrink-0 text-[13px] font-bold text-danger tabular-nums">
        {hhmmDeMinutos(minutosAgora)}
      </span>
      <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
      <span className="flex-1 h-0.5 bg-danger" />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Sem horário */}
      {semHora.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-ink-soft">Sem horário</p>
          {semHora.map((a) => (
            <CartaoDeAtendimento
              key={a.id}
              atendimento={a}
              clinic={clinic}
              catalogo={catalogo}
              pacientes={pacientes}
              professionals={professionals}
              rotuloDoPlano={rotulosDePlano.get(a.id)}
              onAbrir={onAbrirAtendimento}
              onConfirmar={onConfirmar}
            />
          ))}
        </div>
      )}

      {!expediente && (
        <div className="rounded-[18px] bg-card border border-ink/8 p-5 text-center">
          <p className="text-[15px] font-bold text-ink">A clínica não abre neste dia.</p>
          <p className="text-[14px] text-ink-soft mt-1">
            Encaixe continua possível: toque no + da barra de baixo.
          </p>
        </div>
      )}

      {linhas.length === 0 && expediente && (
        <div className="rounded-[18px] bg-card border border-ink/8 p-5 text-center">
          <p className="text-[15px] font-bold text-ink">Dia livre.</p>
          <p className="text-[14px] text-ink-soft mt-1">
            Nenhum atendimento marcado e nenhum horário sobrando no expediente.
          </p>
        </div>
      )}

      <div className="flex flex-col">
        {linhas.map((linha, i) => (
          <React.Fragment key={linha.tipo === 'livre' ? `livre-${linha.hora}` : linha.atendimento.id}>
            {i === indiceDeAgora && linhaDeAgora}

            {/* A pausa do almoço entra como faixa listrada na posição dela. */}
            {almoco &&
              linha.minuto >= almoco.fimMin &&
              (i === 0 || linhas[i - 1].minuto < almoco.inicioMin) && (
                <div className="flex items-center gap-3 min-h-[56px] border-t border-ink/8">
                  <Hora>{hhmmDeMinutos(almoco.inicioMin)}</Hora>
                  <span
                    className="flex-1 h-10 rounded-xl flex items-center px-3 text-[14px] font-medium text-ink-soft"
                    style={{
                      background:
                        'repeating-linear-gradient(135deg,#EFEDE7 0 6px,#F9F8F6 6px 12px)',
                    }}
                  >
                    Bloqueado · almoço até {hhmmDeMinutos(almoco.fimMin)}
                  </span>
                </div>
              )}

            {linha.tipo === 'atendimento' ? (
              <div className="flex gap-3 border-t border-ink/8 py-2.5">
                <Hora className="pt-3">{linha.atendimento.hora}</Hora>
                <div className="flex-1 min-w-0">
                  <CartaoDeAtendimento
                    atendimento={linha.atendimento}
                    clinic={clinic}
                    catalogo={catalogo}
                    pacientes={pacientes}
                    professionals={professionals}
                    rotuloDoPlano={rotulosDePlano.get(linha.atendimento.id)}
                    onAbrir={onAbrirAtendimento}
                    onConfirmar={onConfirmar}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNovoEm(data, linha.hora)}
                className="w-full flex items-center gap-3 min-h-[56px] border-t border-ink/8 text-left group"
                aria-label={`Agendar às ${linha.hora}`}
              >
                <Hora>{linha.hora}</Hora>
                <span className="flex-1 text-[14px] font-medium text-muted group-hover:text-ink transition-colors">
                  Livre
                </span>
                <span className="w-9 h-9 shrink-0 rounded-full border border-ink/15 flex items-center justify-center text-ink group-hover:bg-ink group-hover:text-white group-hover:border-ink transition-colors">
                  <Plus className="w-4 h-4" />
                </span>
              </button>
            )}
          </React.Fragment>
        ))}

        {/* Agora depois de tudo: o expediente acabou e nenhuma linha ficou à frente do relógio. */}
        {ehHoje && indiceDeAgora === -1 && linhas.length > 0 && linhaDeAgora}
      </div>
    </div>
  );
};

/** Uma visita na lista do dia. */
const CartaoDeAtendimento: React.FC<{
  atendimento: Attendance;
  clinic: ClinicProfile;
  catalogo: Procedure[];
  pacientes: Patient[];
  professionals: Professional[];
  rotuloDoPlano?: string;
  onAbrir: (a: Attendance) => void;
  onConfirmar: (a: Attendance) => void;
}> = ({
  atendimento,
  clinic,
  catalogo,
  pacientes,
  professionals,
  rotuloDoPlano,
  onAbrir,
  onConfirmar,
}) => {
  const situacao = situacaoDoCartao(atendimento);
  const inicioMin = minutosDoHHMM(atendimento.hora);
  const duracao = duracaoDoAtendimento(atendimento, catalogo);
  const profissional = nomeCurtoDaProfissional(atendimento.professionalId, professionals);
  const sala = nomeDaSala(atendimento.salaId, clinic);
  const confirmado = ehConfirmado(atendimento);
  const pendente = atendimento.status === 'agendado';
  /** O que ainda vai acontecer é bloco preto; o que já aconteceu, cartão claro. */
  const escuro = situacao === 'agendado' || situacao === 'confirmado' || situacao === 'atrasado';
  const faltou = situacao === 'faltou';

  const faixa =
    inicioMin === null ? 'Sem horário' : `${atendimento.hora}–${hhmmDeMinutos(inicioMin + duracao)}`;

  const link = buildWhatsAppUrl(
    contatoDoAtendimento(atendimento, pacientes),
    mensagemDeConfirmacao(clinic, atendimento, catalogo)
  );

  return (
    <div
      className={`relative flex items-stretch rounded-2xl overflow-hidden ${
        escuro ? 'bg-ink text-cream' : 'bg-card border border-ink/8 text-ink'
      }`}
    >
      {/* A tarja da profissional, como na grade do desktop. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: corDaProfissional(atendimento.professionalId) }}
      />

      <button
        type="button"
        onClick={() => onAbrir(atendimento)}
        className="flex-1 min-w-0 pl-4 pr-2 py-3 text-left flex flex-col gap-1"
      >
        <span className="flex items-center justify-between gap-2">
          <span
            className={`text-[15px] font-bold truncate ${escuro ? 'text-white' : 'text-ink'} ${
              faltou ? 'line-through' : ''
            }`}
          >
            {atendimento.pacienteNome}
          </span>
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold ${
              escuro ? COR_NO_ESCURO[situacao] || 'text-cream' : COR_NO_CLARO[situacao] || 'text-ink-soft'
            }`}
          >
            {situacao === 'confirmado' && <span className="w-1.5 h-1.5 rounded-full bg-ok-claro" />}
            {ROTULO_DA_SITUACAO[situacao]}
          </span>
        </span>
        <span className={`text-[13px] truncate ${escuro ? 'text-cream/75' : 'text-ink-soft'}`}>
          {atendimento.procedimentoNome} · {faixa}
          {rotuloDoPlano ? ` · ${rotuloDoPlano}` : ''}
        </span>
        {(profissional || sala) && (
          <span className={`text-[12px] truncate ${escuro ? 'text-cream/65' : 'text-muted'}`}>
            {[profissional, sala].filter(Boolean).join(' · ')}
          </span>
        )}
      </button>

      {/* Confirmar não passa pelo detalhe: é o gesto mais repetido do dia da recepção. */}
      {pendente && (
        <span className="flex items-center gap-0.5 pr-1.5 shrink-0">
          {!confirmado && link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Confirmar ${atendimento.pacienteNome} pelo WhatsApp`}
              title="Confirmar pelo WhatsApp"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-cream hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="w-[18px] h-[18px]" />
            </a>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfirmar(atendimento);
            }}
            aria-pressed={confirmado}
            aria-label={
              confirmado
                ? `Desmarcar a confirmação de ${atendimento.pacienteNome}`
                : `Marcar ${atendimento.pacienteNome} como confirmada`
            }
            title={confirmado ? 'Confirmado — toque para desmarcar' : 'Marcar como confirmado'}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10 ${
              confirmado ? 'text-ok-claro' : 'text-cream'
            }`}
          >
            <CheckCheck className="w-[18px] h-[18px]" />
          </button>
        </span>
      )}
    </div>
  );
};
