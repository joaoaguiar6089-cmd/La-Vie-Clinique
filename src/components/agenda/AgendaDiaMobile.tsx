import React, { useEffect, useMemo, useRef } from 'react';
import { CheckCheck, MessageCircle, Plus, UtensilsCrossed } from 'lucide-react';
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
  intervaloDaGrade,
  mensagemDeConfirmacao,
  minutosDoHHMM,
  nomeCurtoDaProfissional,
  nomeDaSala,
  ocupaAGrade,
  semHorario,
} from '../../utils/agenda';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import {
  ESTILO_DA_SITUACAO,
  ROTULO_DA_SITUACAO,
  SituacaoDoCartao,
  situacaoDoCartao,
} from './AgendaCard';

/**
 * A visão de dia do celular.
 *
 * A grade proporcional da semana não sobrevive a 375px: um cartão de 30 minutos vira uma faixa
 * de 42px de altura, e nela não cabe hora, nome e procedimento. Aqui o dia é uma **lista** — uma
 * linha por atendimento, com a altura que o conteúdo pede — e os buracos do expediente entram
 * como linhas tracejadas, tocáveis, com a hora já preenchida.
 *
 * O que se perde: a proporção do tempo. O que se ganha: ler o nome da paciente sem apertar os
 * olhos, e encaixar alguém em três toques (dia, horário livre, salvar).
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

/** A legenda das cores. Cor sozinha não informa quem não distingue cores. */
const LEGENDA: { situacao: SituacaoDoCartao; amostra: string }[] = [
  { situacao: 'confirmado', amostra: 'bg-ok-bg border-ok-line' },
  { situacao: 'agendado', amostra: 'bg-card border-brand/45' },
  { situacao: 'faltou', amostra: 'bg-danger-bg/70 border-danger-line' },
];

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
  const listaRef = useRef<HTMLDivElement>(null);
  const agoraRef = useRef<HTMLDivElement>(null);

  const doDia = useMemo(() => atendimentosDoDia(atendimentos, data), [atendimentos, data]);
  const expediente = expedienteDoDia(clinic, data);
  const almoco = almocoDoDia(clinic, data);
  const passo = intervaloDaGrade(clinic);

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

  return (
    <div className="space-y-3" ref={listaRef}>
      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5">
        {LEGENDA.map(({ situacao, amostra }) => (
          <span key={situacao} className="inline-flex items-center gap-1.5 text-label text-muted">
            <span aria-hidden className={`w-3 h-3 rounded-sm border ${amostra}`} />
            {ROTULO_DA_SITUACAO[situacao]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-label text-muted">
          <span aria-hidden className="w-3 h-3 rounded-sm bg-line border border-line" />
          Bloqueado
        </span>
      </div>

      {/* Sem horário */}
      {semHora.length > 0 && (
        <div className="glass-card p-2.5 space-y-1.5">
          <p className="text-label uppercase tracking-wider font-semibold text-muted px-1">
            Sem horário
          </p>
          {semHora.map((a) => (
            <LinhaDeAtendimento
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

      {/* Antes do almoço não há nada a dizer; a faixa entra na posição do relógio, abaixo. */}
      {!expediente && (
        <div className="glass-card p-5 text-center">
          <p className="text-body-lg font-medium text-ink">A clínica não abre neste dia.</p>
          <p className="text-body text-muted mt-1">
            Encaixe continua possível: toque em "Novo agendamento" na barra acima.
          </p>
        </div>
      )}

      {linhas.length === 0 && expediente && (
        <div className="glass-card p-5 text-center">
          <p className="text-body-lg font-medium text-ink">Dia livre.</p>
          <p className="text-body text-muted mt-1">
            Nenhum atendimento marcado e nenhum horário sobrando no expediente.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {linhas.map((linha, i) => (
          <React.Fragment key={linha.tipo === 'livre' ? `livre-${linha.hora}` : linha.atendimento.id}>
            {i === indiceDeAgora && (
              <div ref={agoraRef} className="flex items-center gap-2 py-0.5" aria-label="Agora">
                <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
                <span className="h-px flex-1 bg-danger/60" />
                <span className="text-label font-semibold text-danger tabular-nums">
                  {hhmmDeMinutos(minutosAgora)}
                </span>
              </div>
            )}

            {/* A pausa do almoço entra como bloco cinza na posição dela. */}
            {almoco &&
              linha.minuto >= almoco.fimMin &&
              (i === 0 || linhas[i - 1].minuto < almoco.inicioMin) && (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-line/60 border border-line">
                  <UtensilsCrossed className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-body text-muted">
                    Almoço · {hhmmDeMinutos(almoco.inicioMin)}–{hhmmDeMinutos(almoco.fimMin)}
                  </span>
                </div>
              )}

            {linha.tipo === 'atendimento' ? (
              <LinhaDeAtendimento
                atendimento={linha.atendimento}
                clinic={clinic}
                catalogo={catalogo}
                pacientes={pacientes}
                professionals={professionals}
                rotuloDoPlano={rotulosDePlano.get(linha.atendimento.id)}
                onAbrir={onAbrirAtendimento}
                onConfirmar={onConfirmar}
              />
            ) : (
              <button
                type="button"
                onClick={() => onNovoEm(data, linha.hora)}
                className="w-full flex items-center gap-3 min-h-[48px] px-3 rounded-xl border border-dashed border-line text-left hover:border-brand hover:bg-brand-bg/40 transition-colors"
              >
                <span className="w-[46px] shrink-0 text-body font-semibold text-muted tabular-nums">
                  {linha.hora}
                </span>
                <span className="flex-1 text-body text-muted">
                  Livre · {passo} min
                </span>
                <Plus className="w-4 h-4 text-brand shrink-0" />
              </button>
            )}
          </React.Fragment>
        ))}

        {/* Agora depois de tudo: o expediente acabou e nenhuma linha ficou à frente do relógio. */}
        {ehHoje && indiceDeAgora === -1 && linhas.length > 0 && (
          <div ref={agoraRef} className="flex items-center gap-2 py-0.5" aria-label="Agora">
            <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
            <span className="h-px flex-1 bg-danger/60" />
            <span className="text-label font-semibold text-danger tabular-nums">
              {hhmmDeMinutos(minutosAgora)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/** Uma visita na lista do dia. */
const LinhaDeAtendimento: React.FC<{
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

  const link = buildWhatsAppUrl(
    contatoDoAtendimento(atendimento, pacientes),
    mensagemDeConfirmacao(clinic, atendimento, catalogo)
  );

  return (
    <div
      className={`relative flex items-stretch gap-2 rounded-xl border overflow-hidden ${ESTILO_DA_SITUACAO[situacao]}`}
    >
      {/* A tarja da profissional, como na grade do desktop. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: corDaProfissional(atendimento.professionalId) }}
      />

      <button
        type="button"
        onClick={() => onAbrir(atendimento)}
        className="flex-1 min-w-0 flex items-start gap-3 pl-3.5 pr-1 py-2.5 text-left"
      >
        <span className="w-[46px] shrink-0">
          <span
            className={`block text-body-lg font-semibold tabular-nums ${
              situacao === 'faltou' ? 'line-through' : ''
            }`}
          >
            {atendimento.hora || '—'}
          </span>
          {inicioMin !== null && (
            <span className="block text-label text-muted tabular-nums">
              {hhmmDeMinutos(inicioMin + duracao)}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-body-lg font-medium truncate ${
              situacao === 'faltou' ? 'line-through' : ''
            }`}
          >
            {atendimento.pacienteNome}
          </span>
          <span className="block text-body opacity-80 truncate">
            {atendimento.procedimentoNome}
            {rotuloDoPlano ? ` · ${rotuloDoPlano}` : ''}
          </span>
          {(profissional || sala) && (
            <span className="block text-label opacity-70 truncate">
              {[profissional, sala].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </button>

      {/* Confirmar não passa pelo detalhe: é o gesto mais repetido do dia da recepção. */}
      {pendente && (
        <span className="flex items-center gap-0.5 pr-1 shrink-0">
          {!confirmado && link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Confirmar ${atendimento.pacienteNome} pelo WhatsApp`}
              title="Confirmar pelo WhatsApp"
              className="w-11 h-11 rounded-lg flex items-center justify-center text-whatsapp hover:bg-black/5 transition-colors"
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
            className={`w-11 h-11 rounded-lg flex items-center justify-center transition-colors ${
              confirmado ? 'text-ok' : 'text-muted hover:text-ok hover:bg-black/5'
            }`}
          >
            <CheckCheck className="w-[18px] h-[18px]" />
          </button>
        </span>
      )}
    </div>
  );
};
