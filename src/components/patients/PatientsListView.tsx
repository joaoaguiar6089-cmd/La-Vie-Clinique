import React, { useMemo, useState } from 'react';
import { ArrowDownAZ, Clock, MessageCircle, Trash2, UserPlus, Users } from 'lucide-react';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { formatDateShortYear } from '../../utils/formatters';
import {
  LinhaDePaciente,
  OrdemDaLista,
  ordenarLinhas,
  ROTULO_DA_INTERACAO,
} from '../../utils/patientsPanel';
import { SkeletonLista } from '../common/Skeleton';
import { AcaoDoMenu, Avatar, BotaoPilula, CampoDeBusca, MenuDeAcoes, TituloDaTela } from '../common/Tinta';

interface PatientsListViewProps {
  /** Já montadas em `PatientsModule` — inclui quem só existe em orçamento ou ficha avulsa. */
  linhas: LinhaDePaciente[];
  carregando: boolean;
  /** Só os cadastros por completar — o quadro âmbar, ou a pendência da tela Hoje. */
  soPendentes: boolean;
  onSoPendentes: (so: boolean) => void;
  onAbrirPaciente: (patientId: string) => void;
  /** `nomeInicial` pré-preenche o nome no cadastro — usado quando a busca não achou ninguém. */
  onNovoPaciente: (nomeInicial?: string) => void;
  onExcluirPaciente: (linha: LinhaDePaciente) => void;
}

/**
 * Lista de pacientes — deliberadamente enxuta: a inicial, o nome, quando foi a última vez que a
 * clínica mexeu no assunto. Tudo o mais (fichas, orçamentos, dados pessoais) mora na página da
 * paciente; o WhatsApp e a exclusão do cadastro ficam no "…" da linha.
 *
 * O ponto âmbar marca quem falta completar: ou a pessoa nunca foi cadastrada (só existe como nome
 * num orçamento), ou o cadastro não tem telefone nem e-mail. É um lembrete, não um bloqueio — a
 * página abre igual para todo mundo, e completar os dados continua sendo opcional.
 */
export const PatientsListView: React.FC<PatientsListViewProps> = ({
  linhas,
  carregando,
  soPendentes,
  onSoPendentes,
  onAbrirPaciente,
  onNovoPaciente,
  onExcluirPaciente,
}) => {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemDaLista>('alfabetica');

  const totalPendentes = linhas.filter((l) => l.pendencia).length;

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    const base = soPendentes ? linhas.filter((l) => l.pendencia) : linhas;
    const filtradas = !termo
      ? base
      : base.filter(
          (l) =>
            l.nome.toLowerCase().includes(termo) ||
            (l.patient?.email || '').toLowerCase().includes(termo) ||
            (!!digitos && (l.contato || '').replace(/\D/g, '').includes(digitos))
        );
    return ordenarLinhas(filtradas, ordem);
  }, [linhas, busca, ordem, soPendentes]);

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-6 lg:pt-8 pb-6 flex flex-col gap-4">
      <TituloDaTela
        titulo="Pacientes"
        acao={
          <BotaoPilula icone={UserPlus} onClick={() => onNovoPaciente()}>
            <span className="sm:hidden">Nova</span>
            <span className="hidden sm:inline">Nova paciente</span>
          </BotaoPilula>
        }
      />

      <CampoDeBusca
        variante="pilula"
        valor={busca}
        onMudar={setBusca}
        placeholder="Nome, telefone ou e-mail"
        rotulo="Buscar paciente por nome, telefone ou e-mail"
      />

      {/* Dois números, cada um com o seu bloco: o total em preto, o que falta em âmbar. Tocar no
          âmbar mostra só quem falta — é a porta de entrada para completar os cadastros. */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onSoPendentes(false)}
          aria-pressed={!soPendentes}
          className="rounded-[18px] bg-ink text-white px-4 py-3.5 text-left"
        >
          <span className="block text-[26px] font-bold tabular-nums leading-tight">{linhas.length}</span>
          <span className="block text-[13px] font-medium text-cream/75">
            {linhas.length === 1 ? 'paciente' : 'pacientes'}
          </span>
        </button>
        {totalPendentes > 0 ? (
          <button
            type="button"
            onClick={() => onSoPendentes(!soPendentes)}
            aria-pressed={soPendentes}
            className={`rounded-[18px] px-4 py-3.5 text-left border transition-colors ${
              soPendentes ? 'bg-warn text-white border-warn' : 'bg-warn-bg border-warn-line text-warn'
            }`}
          >
            <span className="block text-[26px] font-bold tabular-nums leading-tight">{totalPendentes}</span>
            <span className="block text-[13px] font-medium">
              {soPendentes ? 'por completar · ver todas' : 'por completar →'}
            </span>
          </button>
        ) : (
          <div className="rounded-[18px] bg-card border border-ink/8 px-4 py-3.5">
            <span className="block text-[26px] font-bold tabular-nums leading-tight text-ink">0</span>
            <span className="block text-[13px] font-medium text-ink-soft">cadastros por completar</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-[16px] font-bold text-ink">
          {soPendentes ? 'Por completar' : 'Todas'}
          {listaFiltrada.length !== (soPendentes ? totalPendentes : linhas.length) && (
            <span className="font-medium text-ink-soft"> · {listaFiltrada.length} na busca</span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setOrdem(ordem === 'alfabetica' ? 'interacao' : 'alfabetica')}
          title={
            ordem === 'alfabetica'
              ? 'Ordenado por nome — toque para ordenar pela anamnese, orçamento ou atendimento mais recente'
              : 'Ordenado pela interação mais recente — toque para ordenar por nome'
          }
          className="inline-flex items-center gap-1.5 min-h-[40px] px-2 -mr-2 rounded-lg text-[14px] font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          {ordem === 'alfabetica' ? (
            <>
              <ArrowDownAZ className="w-4 h-4" />
              A–Z
            </>
          ) : (
            <>
              <Clock className="w-4 h-4" />
              Recentes
            </>
          )}
        </button>
      </div>

      {/* Lista */}
      {carregando ? (
        <SkeletonLista linhas={7} />
      ) : listaFiltrada.length === 0 ? (
        <div className="rounded-[20px] bg-card border border-ink/8 py-12 px-5 text-center">
          <Users className="w-8 h-8 text-ink-soft mx-auto mb-3" />
          <p className="text-[14px] text-ink-soft">
            {linhas.length === 0
              ? 'Nenhum paciente cadastrado ainda. Use "Nova paciente" acima — ou eles entram aqui sozinhos ao preencher a primeira anamnese.'
              : soPendentes && !busca.trim()
              ? 'Nenhum cadastro por completar.'
              : 'Nenhum paciente encontrado com essa busca.'}
          </p>

          {/* Buscar e não achar é justamente quando se descobre que o paciente ainda não existe —
              o nome procurado já vai preenchido no cadastro. */}
          {linhas.length > 0 && !!busca.trim() && (
            <button
              type="button"
              onClick={() => onNovoPaciente(busca.trim())}
              className="mt-3 text-[14px] font-semibold text-ink underline underline-offset-2"
            >
              Cadastrar "{busca.trim()}" como paciente novo
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col">
          {listaFiltrada.map((linha) => {
            const whatsAppUrl = buildWhatsAppUrl(linha.contato);
            const semCadastro = linha.pendencia === 'sem_cadastro';

            const acoes: AcaoDoMenu[] = [];
            if (whatsAppUrl) {
              acoes.push({
                rotulo: 'Conversar no WhatsApp',
                icone: MessageCircle,
                onClick: () => window.open(whatsAppUrl, '_blank', 'noopener,noreferrer'),
              });
            }
            // Só quem tem cadastro pode ser excluído: sem documento em `patients`, não há o que
            // apagar — o que existe é o orçamento, e ele se exclui no painel dele.
            if (!semCadastro) {
              acoes.push({
                rotulo: 'Excluir cadastro',
                icone: Trash2,
                tom: 'perigo',
                onClick: () => onExcluirPaciente(linha),
              });
            }

            const sub = linha.ultimaInteracao
              ? `${formatDateShortYear(linha.ultimaInteracao.data)} · ${
                  ROTULO_DA_INTERACAO[linha.ultimaInteracao.tipo]
                }${linha.contato ? ` · ${linha.contato}` : ''}`
              : linha.contato || 'Sem telefone nem e-mail';

            return (
              <li key={linha.id} className="flex items-center gap-2 border-b border-ink/8">
                {/* A página abre igual para todos. Quem não tem cadastro abre com um provisório,
                    montado do nome — o histórico dele é real, só o documento é que não existe. */}
                <button
                  type="button"
                  onClick={() => onAbrirPaciente(linha.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left group"
                  title={`Abrir a página de ${linha.nome}`}
                >
                  <Avatar nome={linha.nome} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-ink truncate group-hover:underline underline-offset-2">
                      {linha.nome}
                    </span>
                    <span className="block text-[13px] text-ink-soft truncate">
                      {linha.pendencia && (
                        <span className="font-semibold text-warn">
                          {semCadastro ? 'sem cadastro · ' : 'sem contato · '}
                        </span>
                      )}
                      {sub}
                    </span>
                  </span>
                  {linha.pendencia && (
                    <span
                      className="w-2 h-2 rounded-full bg-[#D97706] shrink-0"
                      aria-label="Cadastro por completar"
                    />
                  )}
                </button>

                <MenuDeAcoes
                  tom="discreto"
                  acoes={acoes}
                  rotulo={`Mais ações para ${linha.nome}`}
                  titulo={linha.nome}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
