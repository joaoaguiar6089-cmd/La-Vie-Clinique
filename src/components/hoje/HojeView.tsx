import React, { useMemo } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  CheckCheck,
  Clock,
  MessageCircle,
  Receipt,
  Search,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
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
  ehConfirmado,
  mensagemDeConfirmacao,
} from '../../utils/agenda';
import {
  atendimentosDeHoje,
  conversaoDeOrcamentos,
  dataPorExtenso,
  faturamentoDoMes,
  mesAtual,
  nomeDoMes,
  orcamentosAbertos,
  proximosDeHoje,
  saudacaoDaHora,
} from '../../utils/indicadores';
import { agendamentosAtrasados } from '../../utils/agenda';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { SkeletonLinhas } from '../common/Skeleton';

/**
 * A tela inicial: "o que eu preciso fazer agora?".
 *
 * Todo número desta tela sai das coleções que o `App` já assina — atendimentos, pacientes,
 * orçamentos e catálogo. **Nenhuma leitura nova no Firestore**, o que é também o motivo de ela
 * poder ser a primeira tela depois do login: se ela custasse um snapshot, todo mundo pagaria
 * por ele todo dia, inclusive quem só entrou para abrir o catálogo.
 *
 * A ordem da tela é a ordem da pergunta: primeiro o dia (quem vem agora), depois o que está
 * represado (agendamentos sem desfecho, confirmações de amanhã), e só então os números do mês.
 * Métrica não é tarefa, e por isso não vem antes das tarefas.
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
  professionalLogada?: Professional | null;
  carregando?: boolean;
  onAbrirBusca: () => void;
  onNovoAgendamento: () => void;
  onIrParaAgenda: () => void;
  onIrParaOrcamentos: () => void;
  onAbrirPaciente: (pacienteId: string) => void;
  onConfirmar: (a: Attendance) => void;
}

/** Card de métrica. O valor grande, o rótulo pequeno e, quando há, uma comparação embaixo. */
const Metrica: React.FC<{
  icone: React.ElementType;
  rotulo: string;
  valor: string;
  detalhe?: string;
  onClick?: () => void;
}> = ({ icone: Icone, rotulo, valor, detalhe, onClick }) => {
  const conteudo = (
    <>
      <span className="flex items-center gap-1.5 text-label uppercase tracking-wider font-semibold text-muted">
        <Icone className="w-3.5 h-3.5 text-brand shrink-0" />
        <span className="truncate">{rotulo}</span>
      </span>
      <span className="block mt-1.5 text-title font-serif-luxury text-ink tabular-nums">
        {valor}
      </span>
      {detalhe && (
        <span className="block text-label text-muted mt-0.5 leading-snug">{detalhe}</span>
      )}
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="glass-card glass-card-hover text-left p-3.5 min-h-[92px]"
    >
      {conteudo}
    </button>
  ) : (
    <div className="glass-card p-3.5 min-h-[92px]">{conteudo}</div>
  );
};

/** Card de pendência: quantos, o que são, e o caminho para resolver. */
const Pendencia: React.FC<{
  icone: React.ElementType;
  quantidade: number;
  titulo: string;
  descricao: string;
  onClick: () => void;
}> = ({ icone: Icone, quantidade, titulo, descricao, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full glass-card glass-card-hover flex items-center gap-3 p-3.5 text-left"
  >
    <span className="w-10 h-10 shrink-0 rounded-lg bg-warn-bg text-warn flex items-center justify-center font-semibold tabular-nums">
      {quantidade}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5 text-body-lg font-medium text-ink">
        <Icone className="w-4 h-4 text-brand shrink-0" />
        {titulo}
      </span>
      <span className="block text-body text-muted">{descricao}</span>
    </span>
    <ArrowRight className="w-4 h-4 text-muted shrink-0" />
  </button>
);

export const HojeView: React.FC<HojeViewProps> = ({
  clinic,
  catalogProcedures,
  atendimentos,
  pacientes,
  quotes,
  professionalLogada,
  carregando,
  onAbrirBusca,
  onNovoAgendamento,
  onIrParaAgenda,
  onIrParaOrcamentos,
  onAbrirPaciente,
  onConfirmar,
}) => {
  const hoje = hojeISO();

  const doDia = useMemo(() => atendimentosDeHoje(atendimentos, hoje), [atendimentos, hoje]);
  const proximos = useMemo(() => proximosDeHoje(atendimentos, hoje), [atendimentos, hoje]);
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5">
      {/* Cabeçalho */}
      <header>
        <p className="text-label uppercase tracking-wider font-semibold text-brand first-letter:uppercase">
          {dataPorExtenso(hoje)}
        </p>
        <h1 className="font-serif-luxury text-title-lg sm:text-display text-ink mt-0.5">
          {saudacaoDaHora()}
          {primeiroNome ? `, ${primeiroNome}` : ''}
        </h1>
      </header>

      {/* A busca global, com cara de campo. Digitar aqui é digitar no palette — duplicar o input
          traria dois lugares guardando o mesmo texto. */}
      <button
        type="button"
        onClick={onAbrirBusca}
        className="w-full flex items-center gap-2.5 min-h-[48px] px-3.5 rounded-xl bg-card border border-line text-left hover:border-brand transition-colors"
      >
        <Search className="w-[18px] h-[18px] text-muted shrink-0" />
        <span className="flex-1 text-body-lg text-muted truncate">
          Buscar paciente, procedimento ou orçamento
        </span>
        <kbd className="hidden sm:inline text-label font-sans font-semibold text-muted px-1.5 py-0.5 rounded-sm bg-surface-2">
          ⌘K
        </kbd>
      </button>

      {/* Quatro métricas em 2x2 no celular, 4x1 a partir do tablet. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Metrica
          icone={CalendarCheck}
          rotulo="Atendimentos"
          valor={String(doDia.length)}
          detalhe={
            doDia.length === 0
              ? 'hoje · nada marcado'
              : `hoje · ${proximos.length} por vir`
          }
          onClick={onIrParaAgenda}
        />
        <Metrica
          icone={Wallet}
          rotulo="Faturamento"
          valor={formatBRL(faturamento)}
          detalhe={`${nomeDoMes(mes).split(' de ')[0]} · pagos`}
          onClick={onIrParaOrcamentos}
        />
        <Metrica
          icone={Receipt}
          rotulo="Em aberto"
          valor={String(abertos.length)}
          detalhe="orçamentos na validade"
          onClick={onIrParaOrcamentos}
        />
        <Metrica
          icone={TrendingUp}
          rotulo="Conversão"
          valor={conversao.percentual === null ? '—' : `${conversao.percentual}%`}
          detalhe={
            conversao.percentual === null
              ? '30 dias · nenhum enviado'
              : `30 dias · ${conversao.pagos} de ${conversao.enviados}`
          }
          onClick={onIrParaOrcamentos}
        />
      </div>

      {/* Próximos do dia */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif-luxury text-title text-ink">Próximos</h2>
          <button
            type="button"
            onClick={onIrParaAgenda}
            className="text-body font-semibold text-brand hover:underline shrink-0"
          >
            Ver a agenda
          </button>
        </div>

        {carregando ? (
          <div className="glass-card p-4">
            <SkeletonLinhas linhas={3} />
          </div>
        ) : proximos.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <Clock className="w-7 h-7 text-brand mx-auto mb-2" />
            <p className="text-body-lg font-medium text-ink">
              {doDia.length === 0
                ? 'Nenhum atendimento marcado para hoje.'
                : 'Os atendimentos de hoje já passaram.'}
            </p>
            <p className="text-body text-muted mt-1">
              {doDia.length === 0
                ? 'Bom momento para confirmar os de amanhã ou colocar uma paciente na agenda.'
                : 'Confira se todos têm desfecho marcado.'}
            </p>
            <button
              type="button"
              onClick={onNovoAgendamento}
              className="mt-3 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-brand text-white text-body font-semibold"
            >
              <CalendarPlus className="w-4 h-4" />
              Novo agendamento
            </button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {proximos.map((a) => {
              const confirmado = ehConfirmado(a);
              const link = buildWhatsAppUrl(
                contatoDoAtendimento(a, pacientes),
                mensagemDeConfirmacao(clinic, a, catalogProcedures)
              );
              return (
                <li
                  key={a.id}
                  className="glass-card flex items-center gap-3 pl-3.5 pr-2 py-2.5"
                >
                  <span className="w-[52px] shrink-0 text-body-lg font-semibold text-ink tabular-nums">
                    {a.hora || '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAbrirPaciente(a.pacienteId)}
                    className="min-w-0 flex-1 text-left group"
                  >
                    <span className="block text-body-lg text-ink font-medium truncate group-hover:text-brand transition-colors">
                      {a.pacienteNome}
                    </span>
                    <span className="block text-body text-muted truncate">
                      {a.procedimentoNome}
                      {a.profissionalNome ? ` · ${a.profissionalNome}` : ''}
                    </span>
                  </button>

                  {confirmado ? (
                    <span
                      className="inline-flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg bg-ok-bg text-ok text-label font-semibold"
                      title="A paciente confirmou"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Confirmado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 shrink-0">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Confirmar ${a.pacienteNome} pelo WhatsApp`}
                          title="Confirmar pelo WhatsApp"
                          className="w-11 h-11 rounded-lg flex items-center justify-center text-whatsapp hover:bg-surface-2 transition-colors"
                        >
                          <MessageCircle className="w-[18px] h-[18px]" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onConfirmar(a)}
                        aria-label={`Marcar ${a.pacienteNome} como confirmada`}
                        title="Marcar como confirmado"
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-muted hover:text-ok hover:bg-surface-2 transition-colors"
                      >
                        <CheckCheck className="w-[18px] h-[18px]" />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Pendências. Cada card só aparece quando tem o que fazer — um contador aceso em zero
          treina a equipe a ignorar todos eles. */}
      {(semDesfecho.length > 0 || aConfirmar.length > 0) && (
        <section className="space-y-2">
          <h2 className="font-serif-luxury text-title text-ink">Pendências</h2>

          {aConfirmar.length > 0 && (
            <Pendencia
              icone={CheckCheck}
              quantidade={aConfirmar.length}
              titulo="A confirmar para amanhã"
              descricao="Agendamentos de amanhã que a paciente ainda não confirmou."
              onClick={onIrParaAgenda}
            />
          )}

          {semDesfecho.length > 0 && (
            <Pendencia
              icone={CalendarCheck}
              quantidade={semDesfecho.length}
              titulo="Agendamentos sem desfecho"
              descricao="A data já passou e ninguém marcou compareceu, faltou ou remarcou."
              onClick={onIrParaAgenda}
            />
          )}

        </section>
      )}
    </div>
  );
};
