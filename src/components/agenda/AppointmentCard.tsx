import React, { useState } from 'react';
import {
  Ban,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  User,
} from 'lucide-react';
import { AppointmentLink, AppointmentLinkResposta } from '../../types';
import { ClinicLogo, clinicMonogram } from '../ClinicLogo';
import { hhmmDeMinutos, minutosDoHHMM } from '../../utils/agenda';
import {
  erroDoPedidoDeRemarcacao,
  linkAceitaResposta,
  MENSAGEM_MAX_CARACTERES,
  partesDaData,
} from '../../utils/agendamentoLink';
import { agoraHHMM, DataISO, hojeISO } from '../../utils/attendances';
import { buildWhatsAppUrl } from '../../utils/whatsapp';

/**
 * O card que a cliente vê ao abrir o link do agendamento: a foto e o nome do procedimento, o
 * horário, os detalhes — e as três respostas possíveis.
 *
 * É só apresentação. Quem lê o link e grava a resposta é `PublicAppointmentEntry`; este componente
 * recebe o documento pronto e uma função `onResponder`, o que também deixa o card renderizável com
 * dados de exemplo, sem Firestore.
 */

interface AppointmentCardProps {
  link: AppointmentLink;
  onResponder: (resposta: AppointmentLinkResposta) => Promise<void>;
  /** Só para teste e captura de tela — em uso normal são o dia e a hora de agora. */
  hoje?: DataISO;
  agora?: string;
}

type Painel = 'nenhum' | 'opcoes' | 'alterar' | 'naoVai';

const MENSAGEM_DE_ERRO_DE_ENVIO =
  'Não conseguimos registrar sua resposta agora. Tente de novo em instantes ou fale com a clínica pelo WhatsApp.';

const rotuloDoCampo = 'block text-label uppercase tracking-[.16em] text-brand mb-1.5';
const campo =
  'w-full rounded-[14px] border border-line bg-card px-4 py-3 text-field text-ink focus:outline-hidden focus:border-brand focus:ring-2 focus:ring-brand/25 transition-colors';
const botaoBase =
  'w-full min-h-[52px] rounded-[14px] px-5 text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
const botaoPrimario = `${botaoBase} bg-brand text-white hover:bg-brand-hover`;
const botaoSecundario = `${botaoBase} min-h-[48px] bg-card text-ink border border-line hover:border-brand`;

export const AppointmentCard: React.FC<AppointmentCardProps> = ({
  link,
  onResponder,
  hoje = hojeISO(),
  agora,
}) => {
  const { clinica, procedimento } = link;

  const [painel, setPainel] = useState<Painel>('nenhum');
  const [novaData, setNovaData] = useState('');
  const [novaHora, setNovaHora] = useState('');
  const [recado, setRecado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fotoQuebrou, setFotoQuebrou] = useState(false);
  const [orientacoesAbertas, setOrientacoesAbertas] = useState(false);
  const [descricaoAberta, setDescricaoAberta] = useState(false);

  const aceita = linkAceitaResposta(link.situacao, link.data, hoje);
  const resposta = link.resposta;
  const { semana, diaMes } = partesDaData(link.data);

  const inicioMin = minutosDoHHMM(link.hora);
  const fim =
    inicioMin !== null && link.duracaoMin ? hhmmDeMinutos(inicioMin + link.duracaoMin) : null;
  const duracao = procedimento.duracaoTexto || (link.duracaoMin ? `${link.duracaoMin} min` : '');
  const endereco = [clinica.address, clinica.cityState].filter(Boolean).join(' · ');
  const foto = procedimento.foto && !fotoQuebrou ? procedimento.foto : undefined;
  const descricaoLonga = (procedimento.descricao || '').length > 140;

  const linkDoMapa = endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [clinica.name, endereco].join(' ')
      )}`
    : null;
  const linkWhatsApp = buildWhatsAppUrl(
    clinica.phone,
    `Olá! Sou ${link.clientePrimeiroNome || 'cliente'} e tenho horário de ${procedimento.titulo} ` +
      `em ${diaMes}. Queria falar sobre o agendamento.`
  );

  const enviar = async (r: AppointmentLinkResposta) => {
    setEnviando(true);
    setErro(null);
    try {
      await onResponder(r);
      setPainel('nenhum');
      setNovaData('');
      setNovaHora('');
      setRecado('');
    } catch (e) {
      console.warn('Falha ao registrar a resposta do agendamento:', e);
      setErro(MENSAGEM_DE_ERRO_DE_ENVIO);
    } finally {
      setEnviando(false);
    }
  };

  const enviarPedidoDeAlteracao = () => {
    const problema = erroDoPedidoDeRemarcacao(novaData, novaHora, recado, hoje, agora ?? agoraHHMM());
    if (problema) {
      setErro(problema);
      return;
    }
    void enviar({ tipo: 'remarcar', novaData, novaHora, mensagem: recado });
  };

  const abrirPainel = (proximo: Painel) => {
    setErro(null);
    setPainel(proximo);
  };

  const mostraAcoes = aceita && (!resposta || painel !== 'nenhum');

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="max-w-md mx-auto px-4 sm:px-5 pt-8 pb-14 animate-fadeIn">
        {/* Saudação */}
        <header className="text-center mb-6">
          <ClinicLogo
            clinic={clinica}
            className="w-12 h-12 rounded-full mx-auto mb-3 border border-line bg-card"
            monogramClassName="bg-ink text-brand-pale font-serif-luxury text-base"
            fit="cover"
          />
          <p className="text-label uppercase tracking-[.18em] text-brand">
            {link.clientePrimeiroNome ? `Olá, ${link.clientePrimeiroNome}` : 'Olá'}
          </p>
          <h1 className="font-serif-luxury text-[30px] leading-[1.1] mt-1.5">
            {aceita ? 'Seu horário está reservado' : 'Seu agendamento'}
          </h1>
        </header>

        {/* O card */}
        <article
          className={`rounded-[24px] bg-card border border-line overflow-hidden shadow-[0_24px_60px_-28px_rgba(26,26,26,0.38)] ${
            aceita ? '' : 'opacity-90'
          }`}
        >
          {/* Capa */}
          <div className="relative aspect-[4/3] bg-ink overflow-hidden">
            {foto ? (
              <img
                src={foto}
                alt={procedimento.titulo}
                referrerPolicy="no-referrer"
                onError={() => setFotoQuebrou(true)}
                className={`absolute inset-0 w-full h-full object-cover ${aceita ? '' : 'grayscale'}`}
              />
            ) : (
              <>
                {/* Sem foto a capa vira tipografia: fundo escuro com um brilho bronze e o
                    monograma da clínica em marca-d'água. */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      'radial-gradient(120% 90% at 88% 0%, rgba(196,155,116,.42), transparent 62%), radial-gradient(90% 70% at 0% 100%, rgba(166,124,82,.22), transparent 60%)',
                  }}
                />
                <span
                  aria-hidden
                  className="absolute -top-4 right-4 font-serif-luxury text-[150px] leading-none text-white/[0.06] select-none"
                >
                  {clinicMonogram(clinica.name)}
                </span>
              </>
            )}
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-t from-ink/90 via-ink/35 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-6">
              {procedimento.subtitulo && (
                <p className="text-label uppercase tracking-[.18em] text-brand-pale mb-1.5">
                  {procedimento.subtitulo}
                </p>
              )}
              <h2 className="font-serif-luxury text-[34px] leading-[1.05] text-white">
                {procedimento.titulo}
              </h2>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Data e hora */}
            <div className="flex items-stretch gap-5">
              <div className="flex-1 min-w-0">
                <p className="text-label uppercase tracking-[.16em] text-brand first-letter:uppercase">
                  {semana}
                </p>
                <p className="font-serif-luxury text-[28px] leading-tight mt-0.5">{diaMes}</p>
              </div>
              {link.hora && (
                <>
                  <div className="w-px bg-line" aria-hidden />
                  <div className="text-right shrink-0">
                    <p className="text-label uppercase tracking-[.16em] text-brand">Horário</p>
                    <p className="font-serif-luxury text-[28px] leading-tight tabular-nums mt-0.5">
                      {link.hora}
                    </p>
                    {fim && <p className="text-label text-muted tabular-nums">até {fim}</p>}
                  </div>
                </>
              )}
            </div>

            {/* Detalhes */}
            <ul className="space-y-3 border-t border-line pt-5">
              {duracao && (
                <Detalhe icone={<Clock className="w-4 h-4" />}>
                  Duração aproximada de {duracao}
                </Detalhe>
              )}
              {link.profissionalNome && (
                <Detalhe icone={<User className="w-4 h-4" />}>com {link.profissionalNome}</Detalhe>
              )}
              {endereco && (
                <Detalhe icone={<MapPin className="w-4 h-4" />}>
                  <span className="block">{clinica.name}</span>
                  {linkDoMapa ? (
                    <a
                      href={linkDoMapa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-ink-soft underline decoration-brand/40 underline-offset-2 hover:text-brand"
                    >
                      {endereco}
                    </a>
                  ) : (
                    <span className="block text-ink-soft">{endereco}</span>
                  )}
                </Detalhe>
              )}
            </ul>

            {procedimento.descricao && (
              <div>
                <p
                  className={`text-body-lg leading-relaxed text-ink-soft ${
                    descricaoAberta ? '' : 'line-clamp-3'
                  }`}
                >
                  {procedimento.descricao}
                </p>
                {descricaoLonga && (
                  <button
                    type="button"
                    onClick={() => setDescricaoAberta((v) => !v)}
                    className="mt-1.5 text-body font-semibold text-brand-hover hover:underline"
                  >
                    {descricaoAberta ? 'Ver menos' : 'Ver mais'}
                  </button>
                )}
              </div>
            )}

            {procedimento.orientacoes && (
              <div className="rounded-[16px] bg-brand-bg border border-brand/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOrientacoesAbertas((v) => !v)}
                  aria-expanded={orientacoesAbertas}
                  className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left"
                >
                  <ClipboardList className="w-4 h-4 text-brand shrink-0" />
                  <span className="flex-1 text-body-lg font-semibold text-ink">
                    Antes de vir
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-brand transition-transform ${
                      orientacoesAbertas ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {orientacoesAbertas && (
                  <p className="px-4 pb-4 text-body-lg leading-relaxed text-ink-soft whitespace-pre-line animate-fadeIn">
                    {procedimento.orientacoes}
                  </p>
                )}
              </div>
            )}

            {/* O que aconteceu com este link */}
            <Aviso link={link} aceita={aceita} hoje={hoje} />

            {/* Respostas */}
            {aceita && resposta && painel === 'nenhum' && (
              <button
                type="button"
                onClick={() => abrirPainel('opcoes')}
                className="w-full text-center text-body font-semibold text-brand-hover hover:underline"
              >
                Mudar minha resposta
              </button>
            )}

            {mostraAcoes && (
              <div className="space-y-3" aria-busy={enviando}>
                {painel !== 'alterar' && painel !== 'naoVai' && (
                  <>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => void enviar({ tipo: 'confirmar' })}
                      className={botaoPrimario}
                    >
                      {enviando ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCheck className="w-4 h-4" />
                      )}
                      Confirmar presença
                    </button>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => abrirPainel('alterar')}
                      className={botaoSecundario}
                    >
                      <CalendarClock className="w-4 h-4 text-brand" />
                      Preciso alterar o horário
                    </button>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => abrirPainel('naoVai')}
                      className="w-full min-h-[44px] rounded-[14px] text-body-lg font-semibold text-danger hover:bg-danger-bg/60 transition-colors disabled:opacity-60"
                    >
                      Não vou poder ir
                    </button>
                  </>
                )}

                {painel === 'alterar' && (
                  <div className="rounded-[18px] border border-line bg-surface p-4 space-y-4 animate-fadeIn">
                    <p className="text-body-lg text-ink-soft leading-relaxed">
                      Diga o dia e o horário que ficam melhores para você. A equipe confere a
                      agenda e responde por aqui.
                    </p>
                    {/* Empilhados no celular: o campo de hora de quem usa relógio AM/PM ("10:00 AM")
                        não cabe na metade da largura e o texto era cortado. */}
                    <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-3">
                      <label className="min-w-0">
                        <span className={rotuloDoCampo}>Nova data</span>
                        <input
                          type="date"
                          min={hoje}
                          value={novaData}
                          onChange={(e) => setNovaData(e.target.value)}
                          className={campo}
                        />
                      </label>
                      <label className="min-w-0">
                        <span className={rotuloDoCampo}>Novo horário</span>
                        <input
                          type="time"
                          step={900}
                          value={novaHora}
                          onChange={(e) => setNovaHora(e.target.value)}
                          className={campo}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className={rotuloDoCampo}>Recado (opcional)</span>
                      <textarea
                        rows={2}
                        maxLength={MENSAGEM_MAX_CARACTERES}
                        value={recado}
                        onChange={(e) => setRecado(e.target.value)}
                        placeholder="Ex.: prefiro no período da tarde"
                        className={`${campo} resize-none`}
                      />
                    </label>
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={enviarPedidoDeAlteracao}
                        className={botaoPrimario}
                      >
                        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                        Enviar pedido
                      </button>
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => abrirPainel(resposta ? 'opcoes' : 'nenhum')}
                        className="w-full min-h-[44px] text-body-lg font-semibold text-muted hover:text-ink"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                )}

                {painel === 'naoVai' && (
                  <div className="rounded-[18px] border border-danger-line bg-danger-bg/50 p-4 space-y-3 animate-fadeIn">
                    <p className="text-body-lg text-ink-soft leading-relaxed">
                      <strong className="text-ink">Tem certeza?</strong> Vamos avisar a equipe para
                      liberar o seu horário. Se quiser, é só pedir outro dia aqui mesmo.
                    </p>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => void enviar({ tipo: 'nao_vai' })}
                      className={`${botaoBase} bg-danger text-white hover:brightness-90`}
                    >
                      {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                      Sim, não vou poder ir
                    </button>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => abrirPainel(resposta ? 'opcoes' : 'nenhum')}
                      className="w-full min-h-[44px] text-body-lg font-semibold text-muted hover:text-ink"
                    >
                      Voltar
                    </button>
                  </div>
                )}

                {erro && (
                  <p
                    role="alert"
                    className="text-body-lg text-danger bg-danger-bg border border-danger-line rounded-[14px] px-4 py-3"
                  >
                    {erro}
                  </p>
                )}
              </div>
            )}
          </div>
        </article>

        {/* Rodapé */}
        <footer className="mt-8 text-center space-y-4">
          {linkWhatsApp && (
            <a
              href={linkWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full border border-line bg-card text-body-lg font-semibold text-ink hover:border-brand transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-whatsapp-strong" />
              Falar com a clínica
            </a>
          )}
          <div>
            <p className="font-serif-luxury text-title">{clinica.name}</p>
            {clinica.tagline && (
              <p className="text-label uppercase tracking-[.16em] text-muted mt-0.5">
                {clinica.tagline}
              </p>
            )}
          </div>
          <p className="text-label text-muted leading-relaxed">
            Este link é só seu. Não precisa de login nem de senha.
          </p>
        </footer>
      </div>
    </div>
  );
};

const Detalhe: React.FC<{ icone: React.ReactNode; children: React.ReactNode }> = ({
  icone,
  children,
}) => (
  <li className="flex items-start gap-3 text-body-lg text-ink">
    <span className="w-8 h-8 rounded-full bg-brand-bg text-brand flex items-center justify-center shrink-0">
      {icone}
    </span>
    <span className="min-w-0 pt-1 leading-snug">{children}</span>
  </li>
);

/**
 * A faixa que diz onde a conversa está. Prioridade: o estado do agendamento (remarcado, concluído,
 * já passou) vence a resposta da cliente, porque de nada adianta dizer "confirmado" num horário
 * que a clínica já mudou.
 */
const Aviso: React.FC<{ link: AppointmentLink; aceita: boolean; hoje: DataISO }> = ({
  link,
  aceita,
  hoje,
}) => {
  const base = 'flex items-start gap-3 rounded-[16px] border px-4 py-3.5 text-body-lg leading-snug';

  if (link.situacao === 'remarcado') {
    return (
      <div role="status" className={`${base} bg-surface-2 border-line text-ink-soft`}>
        <CalendarClock className="w-5 h-5 shrink-0 text-brand" />
        <span>
          <strong className="text-ink">Este horário foi remarcado.</strong> Fale com a clínica para
          combinar o novo horário.
        </span>
      </div>
    );
  }
  if (link.situacao === 'encerrado') {
    return (
      <div role="status" className={`${base} bg-surface-2 border-line text-ink-soft`}>
        <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" />
        <span>
          <strong className="text-ink">Este atendimento já foi concluído.</strong> Obrigada pela
          visita!
        </span>
      </div>
    );
  }
  if (!aceita && link.data < hoje) {
    return (
      <div role="status" className={`${base} bg-surface-2 border-line text-ink-soft`}>
        <Ban className="w-5 h-5 shrink-0 text-muted" />
        <span>
          <strong className="text-ink">Este horário já passou.</strong> Para um novo agendamento,
          fale com a clínica.
        </span>
      </div>
    );
  }

  const r = link.resposta;
  if (r?.tipo === 'confirmar') {
    return (
      <div role="status" className={`${base} bg-ok-bg border-ok-line text-ok`}>
        <CheckCheck className="w-5 h-5 shrink-0" />
        <span>
          <strong>Presença confirmada.</strong> Estamos te esperando!
        </span>
      </div>
    );
  }
  if (r?.tipo === 'nao_vai') {
    return (
      <div role="status" className={`${base} bg-danger-bg border-danger-line text-danger`}>
        <Ban className="w-5 h-5 shrink-0" />
        <span>
          <strong>Você avisou que não vai poder ir.</strong> A equipe foi avisada e pode entrar em
          contato para combinar outra data.
        </span>
      </div>
    );
  }
  if (r?.tipo === 'remarcar') {
    const p = partesDaData(r.novaData || '');
    return (
      <div role="status" className={`${base} bg-warn-bg border-warn-line text-warn`}>
        <CalendarClock className="w-5 h-5 shrink-0" />
        <span>
          <strong>Pedido enviado.</strong> Você pediu <strong>{p.diaMes}</strong>
          {r.novaHora ? ` às ${r.novaHora}` : ''}. A equipe vai conferir a agenda e te responder. Até
          lá, o horário acima continua reservado.
        </span>
      </div>
    );
  }

  if (link.decisaoRemarcacao === 'aprovada') {
    return (
      <div role="status" className={`${base} bg-ok-bg border-ok-line text-ok`}>
        <CheckCheck className="w-5 h-5 shrink-0" />
        <span>
          <strong>Alteração aprovada.</strong> O novo horário é o que aparece acima — já está
          confirmado.
        </span>
      </div>
    );
  }
  if (link.decisaoRemarcacao === 'recusada') {
    return (
      <div role="status" className={`${base} bg-warn-bg border-warn-line text-warn`}>
        <CalendarClock className="w-5 h-5 shrink-0" />
        <span>
          <strong>Não conseguimos o horário que você pediu.</strong> O agendamento segue como
          está acima — se quiser, sugira outro dia ou fale com a gente.
        </span>
      </div>
    );
  }
  return null;
};
