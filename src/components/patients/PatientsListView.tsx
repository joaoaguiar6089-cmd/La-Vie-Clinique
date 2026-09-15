import React, { useMemo, useState } from 'react';
import { ChevronRight, MessageCircle, Phone, Search, UserPlus, Users } from 'lucide-react';
import { Patient } from '../../types';
import { buildWhatsAppUrl } from '../../utils/whatsapp';

interface PatientsListViewProps {
  patients: Patient[];
  carregando: boolean;
  onAbrirPaciente: (patientId: string) => void;
  /** `nomeInicial` pré-preenche o nome no cadastro — usado quando a busca não achou ninguém. */
  onNovoPaciente: (nomeInicial?: string) => void;
}

/**
 * Lista de pacientes — deliberadamente enxuta: nome, contato e as duas portas de saída que a
 * recepção usa o dia inteiro, abrir a página do paciente e chamar no WhatsApp. Tudo o mais
 * (fichas, orçamentos, dados pessoais) mora na página do paciente.
 */
export const PatientsListView: React.FC<PatientsListViewProps> = ({
  patients,
  carregando,
  onAbrirPaciente,
  onNovoPaciente,
}) => {
  const [busca, setBusca] = useState('');

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return patients;
    const digitos = termo.replace(/\D/g, '');
    return patients.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        (p.email || '').toLowerCase().includes(termo) ||
        (!!digitos && (p.contato || '').replace(/\D/g, '').includes(digitos))
    );
  }, [patients, busca]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif-luxury text-3xl sm:text-4xl text-[#1A1A1A]">Pacientes</h1>
          <p className="text-xs text-gray-500 mt-1">
            {patients.length} paciente{patients.length === 1 ? '' : 's'} cadastrado
            {patients.length === 1 ? '' : 's'}
            {listaFiltrada.length !== patients.length && ` · ${listaFiltrada.length} na busca`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNovoPaciente()}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest hover:bg-[#8E653D] transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Novo paciente
        </button>
      </div>

      {/* Busca */}
      <div className="relative mb-5">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone ou e-mail"
          className="w-full glass-input pl-9 pr-3 py-2.5 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
        />
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
            {patients.length === 0
              ? 'Nenhum paciente cadastrado ainda. Use "Novo paciente" acima — ou eles entram aqui sozinhos ao preencher a primeira anamnese.'
              : 'Nenhum paciente encontrado com essa busca.'}
          </p>

          {/* Buscar e não achar é justamente quando se descobre que o paciente ainda não existe —
              o nome procurado já vai preenchido no cadastro. */}
          {patients.length > 0 && !!busca.trim() && (
            <button
              type="button"
              onClick={() => onNovoPaciente(busca.trim())}
              className="mt-3 text-xs font-semibold text-[#A67C52] hover:underline"
            >
              Cadastrar "{busca.trim()}" como paciente novo
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {listaFiltrada.map((paciente) => {
            const whatsAppUrl = buildWhatsAppUrl(paciente.contato);
            return (
              <li
                key={paciente.id}
                className="glass-card glass-card-hover rounded-sm flex items-center gap-2 pr-2"
              >
                {/* Acesso à página do paciente — o alvo de toque ocupa a linha inteira */}
                <button
                  type="button"
                  onClick={() => onAbrirPaciente(paciente.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 text-left"
                  title={`Abrir a página de ${paciente.nome}`}
                >
                  <span className="w-9 h-9 shrink-0 rounded-full bg-[#A67C52]/10 text-[#A67C52] flex items-center justify-center font-semibold text-sm">
                    {paciente.nome.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[#1A1A1A] truncate">{paciente.nome}</span>
                    {paciente.contato && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400 truncate">
                        <Phone className="w-3 h-3 shrink-0" />
                        {paciente.contato}
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
                    aria-label={`Conversar com ${paciente.nome} no WhatsApp`}
                    title="Conversar no WhatsApp"
                    className="shrink-0 p-2.5 rounded-sm text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
