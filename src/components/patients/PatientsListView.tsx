import React, { useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  ChevronRight,
  Clock,
  MessageCircle,
  Phone,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { formatDateShortYear } from '../../utils/formatters';
import {
  LinhaDePaciente,
  OrdemDaLista,
  ordenarLinhas,
  ROTULO_DA_INTERACAO,
} from '../../utils/patientsPanel';

interface PatientsListViewProps {
  /** Já montadas em `PatientsModule` — inclui quem só existe em orçamento ou ficha avulsa. */
  linhas: LinhaDePaciente[];
  carregando: boolean;
  onAbrirPaciente: (patientId: string) => void;
  /** `nomeInicial` pré-preenche o nome no cadastro — usado quando a busca não achou ninguém. */
  onNovoPaciente: (nomeInicial?: string) => void;
  onExcluirPaciente: (linha: LinhaDePaciente) => void;
}

const ORDENS: { id: OrdemDaLista; rotulo: string; icone: typeof ArrowDownAZ }[] = [
  { id: 'alfabetica', rotulo: 'A–Z', icone: ArrowDownAZ },
  { id: 'interacao', rotulo: 'Última interação', icone: Clock },
];

/**
 * Lista de pacientes — deliberadamente enxuta: nome, contato, quando foi a última vez que a
 * clínica mexeu no assunto, e as portas de saída que a recepção usa o dia inteiro (abrir a página
 * e chamar no WhatsApp). Tudo o mais (fichas, orçamentos, dados pessoais) mora na página do
 * paciente.
 *
 * O creme claro marca as linhas que faltam completar: ou a pessoa nunca foi cadastrada (só existe
 * como nome num orçamento), ou o cadastro não tem telefone nem e-mail. É um lembrete, não um
 * bloqueio — a página abre igual para todo mundo, e completar os dados continua sendo opcional.
 */
export const PatientsListView: React.FC<PatientsListViewProps> = ({
  linhas,
  carregando,
  onAbrirPaciente,
  onNovoPaciente,
  onExcluirPaciente,
}) => {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemDaLista>('alfabetica');

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    const filtradas = !termo
      ? linhas
      : linhas.filter(
          (l) =>
            l.nome.toLowerCase().includes(termo) ||
            (l.patient?.email || '').toLowerCase().includes(termo) ||
            (!!digitos && (l.contato || '').replace(/\D/g, '').includes(digitos))
        );
    return ordenarLinhas(filtradas, ordem);
  }, [linhas, busca, ordem]);

  const totalPendentes = linhas.filter((l) => l.pendencia).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif-luxury text-3xl sm:text-4xl text-ink">Pacientes</h1>
          <p className="text-xs text-gray-500 mt-1">
            {linhas.length} paciente{linhas.length === 1 ? '' : 's'}
            {listaFiltrada.length !== linhas.length && ` · ${listaFiltrada.length} na busca`}
            {totalPendentes > 0 && ` · ${totalPendentes} com dados por completar`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNovoPaciente()}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-widest hover:bg-brand-hover transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Novo paciente
        </button>
      </div>

      {/* Busca e ordenação */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="w-full glass-input pl-9 pr-3 py-2.5 rounded-sm text-sm text-ink focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {ORDENS.map(({ id, rotulo, icone: Icone }) => (
            <button
              key={id}
              type="button"
              onClick={() => setOrdem(id)}
              aria-pressed={ordem === id}
              title={
                id === 'alfabetica'
                  ? 'Ordenar por nome'
                  : 'Ordenar pela anamnese ou orçamento mais recente'
              }
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-sm border transition-colors ${
                ordem === id
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white/60 text-gray-600 border-white/80 hover:bg-white/80'
              }`}
            >
              <Icone className="w-3.5 h-3.5" />
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {carregando ? (
        <div className="glass-card rounded-sm py-16 text-center">
          <p className="text-sm text-gray-500">Carregando pacientes...</p>
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="glass-card rounded-sm py-16 text-center">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {linhas.length === 0
              ? 'Nenhum paciente cadastrado ainda. Use "Novo paciente" acima — ou eles entram aqui sozinhos ao preencher a primeira anamnese.'
              : 'Nenhum paciente encontrado com essa busca.'}
          </p>

          {/* Buscar e não achar é justamente quando se descobre que o paciente ainda não existe —
              o nome procurado já vai preenchido no cadastro. */}
          {linhas.length > 0 && !!busca.trim() && (
            <button
              type="button"
              onClick={() => onNovoPaciente(busca.trim())}
              className="mt-3 text-xs font-semibold text-brand hover:underline"
            >
              Cadastrar "{busca.trim()}" como paciente novo
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {listaFiltrada.map((linha) => {
            const whatsAppUrl = buildWhatsAppUrl(linha.contato);
            const semCadastro = linha.pendencia === 'sem_cadastro';

            return (
              <li
                key={linha.id}
                className={`glass-card glass-card-hover rounded-sm flex items-center gap-2 pr-2 ${
                  linha.pendencia ? 'glass-card-pendente' : ''
                }`}
              >
                {/* A página abre igual para todos. Quem não tem cadastro abre com um provisório,
                    montado do nome — o histórico dele é real, só o documento é que não existe. */}
                <button
                  type="button"
                  onClick={() => onAbrirPaciente(linha.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 text-left"
                  title={`Abrir a página de ${linha.nome}`}
                >
                  <span className="w-9 h-9 shrink-0 rounded-full bg-brand/10 text-brand flex items-center justify-center font-semibold text-sm">
                    {linha.nome.charAt(0).toUpperCase()}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-ink truncate">{linha.nome}</span>
                      {linha.pendencia && (
                        <span className="shrink-0 text-label text-brand">
                          {semCadastro ? 'sem cadastro' : 'sem contato'}
                        </span>
                      )}
                    </span>

                    {linha.ultimaInteracao && (
                      <span className="block text-body text-gray-400 truncate">
                        Última interação {formatDateShortYear(linha.ultimaInteracao.data)} ·{' '}
                        {ROTULO_DA_INTERACAO[linha.ultimaInteracao.tipo]}
                      </span>
                    )}

                    {linha.contato && (
                      <span className="flex items-center gap-1 text-body text-gray-400 truncate">
                        <Phone className="w-3 h-3 shrink-0" />
                        {linha.contato}
                      </span>
                    )}
                  </span>

                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>

                {/* WhatsApp — some quando o cadastro não tem telefone utilizável */}
                {whatsAppUrl && (
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Conversar com ${linha.nome} no WhatsApp`}
                    title="Conversar no WhatsApp"
                    className="shrink-0 p-2.5 rounded-sm text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />
                  </a>
                )}

                {/* Só quem tem cadastro pode ser excluído: sem documento em `patients`, não há o
                    que apagar — o que existe é o orçamento, e ele se exclui no painel dele. */}
                {!semCadastro && (
                  <button
                    type="button"
                    onClick={() => onExcluirPaciente(linha)}
                    aria-label={`Excluir o cadastro de ${linha.nome}`}
                    title="Excluir cadastro"
                    className="shrink-0 p-2.5 rounded-sm text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-[18px] h-[18px]" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
