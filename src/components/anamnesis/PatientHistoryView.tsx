import React, { useState } from 'react';
import { Patient, AnamnesisRecord, AnamnesisTemplate, ClinicProfile } from '../../types';
import {
  Search,
  Plus,
  FileText,
  User,
  Calendar,
  Eye,
  Printer,
  Trash2,
  Camera,
  Phone,
  Clock,
  Sparkles,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface PatientHistoryViewProps {
  patients: Patient[];
  records: AnamnesisRecord[];
  templates: AnamnesisTemplate[];
  clinicProfile: ClinicProfile;
  onOpenFillModal: (patientId?: string, templateId?: string) => void;
  onOpenRecordDetail: (record: AnamnesisRecord) => void;
  onDeleteRecord: (recordId: string) => Promise<void>;
  onDeletePatient: (patientId: string) => Promise<void>;
}

export const PatientHistoryView: React.FC<PatientHistoryViewProps> = ({
  patients,
  records,
  templates,
  clinicProfile,
  onOpenFillModal,
  onOpenRecordDetail,
  onDeleteRecord,
  onDeletePatient,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientFilter, setSelectedPatientFilter] = useState<string>('all');
  const [viewTab, setViewTab] = useState<'records' | 'patients'>('records');

  // Filtered records
  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      rec.pacienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.procedimentoNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rec.pacienteContato && rec.pacienteContato.includes(searchTerm)) ||
      (rec.profissionalNome && rec.profissionalNome.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesPatient =
      selectedPatientFilter === 'all' || rec.pacienteId === selectedPatientFilter;

    return matchesSearch && matchesPatient;
  });

  // Filtered patients
  const filteredPatients = patients.filter((pat) => {
    return (
      pat.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (pat.contato && pat.contato.includes(searchTerm)) ||
      (pat.email && pat.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const getPatientRecordsCount = (patientId: string) => {
    return records.filter((r) => r.pacienteId === patientId).length;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="bg-white/60 backdrop-blur-md rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#A67C52]" />
            <h3 className="font-serif-luxury text-xl font-medium text-[#1A1A1A]">
              Atendimentos & Histórico de Pacientes
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-[#A67C52]/15 text-[#A67C52] text-[10px] font-mono font-bold">
              {records.length} Fichas Registradas
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Consulte prontuários anteriores, acesse fotos clínicas salvas e inicie novos atendimentos
            com preenchimento automatizado das informações da paciente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenFillModal()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-sm bg-[#1A1A1A] text-[#C49B74] text-xs font-semibold uppercase tracking-wider hover:bg-black shadow-xs active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Preencher Nova Ficha
        </button>
      </div>

      {/* Filter and Switch bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por paciente, procedimento ou telefone..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-sm bg-white/80 border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] focus:bg-white"
          />
        </div>

        {/* View switcher and patient filter */}
        <div className="flex items-center gap-2">
          {/* Patient dropdown filter */}
          <select
            value={selectedPatientFilter}
            onChange={(e) => setSelectedPatientFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-gray-700 focus:outline-hidden focus:border-[#A67C52]"
          >
            <option value="all">Todos os Pacientes ({patients.length})</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({getPatientRecordsCount(p.id)} fichas)
              </option>
            ))}
          </select>

          {/* Sub tabs */}
          <div className="flex items-center bg-white/80 p-0.5 rounded-xs border border-gray-200">
            <button
              type="button"
              onClick={() => setViewTab('records')}
              className={`px-3 py-1.5 rounded-2xs text-xs font-medium transition-all ${
                viewTab === 'records'
                  ? 'bg-[#1A1A1A] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Fichas ({filteredRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('patients')}
              className={`px-3 py-1.5 rounded-2xs text-xs font-medium transition-all ${
                viewTab === 'patients'
                  ? 'bg-[#1A1A1A] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Pacientes ({filteredPatients.length})
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: RECORDS TIMELINE / CARDS */}
      {viewTab === 'records' && (
        <div className="space-y-3">
          {filteredRecords.map((rec) => (
            <div
              key={rec.id}
              className="bg-white/80 backdrop-blur-md rounded-sm border border-white/90 p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-[#A67C52]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              {/* Left Column: Patient & Procedure info */}
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                {/* Photo or Icon badge */}
                {(rec.fotoPacienteUrl || rec.fotoUrl || rec.fotoModeloUrl) ? (
                  <div className="relative w-12 h-12 rounded-sm overflow-hidden border border-gray-200 shadow-2xs shrink-0 group-hover:border-[#A67C52] transition-colors">
                    <img
                      src={rec.fotoPacienteUrl || rec.fotoUrl || rec.fotoModeloUrl}
                      alt={rec.pacienteNome}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] text-center font-mono py-0.5">
                      {rec.fotoPacienteUrl || rec.fotoUrl ? 'PACIENTE' : 'DOUTOR'}
                    </span>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#A67C52] flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 stroke-1" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-serif-luxury text-base font-bold text-[#1A1A1A] group-hover:text-[#A67C52] transition-colors">
                      {rec.pacienteNome}
                    </h4>
                    {rec.origemPreenchimento === 'online_paciente' && (
                      <span className="px-1.5 py-0.5 rounded-xs bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold uppercase tracking-wider">
                        Online Paciente
                      </span>
                    )}
                    {rec.fotoModeloUrl && (rec.fotoPacienteUrl || rec.fotoUrl) ? (
                      <span className="px-1.5 py-0.5 rounded-xs bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-semibold">
                        Foto Doutor + Paciente
                      </span>
                    ) : rec.fotoModeloUrl ? (
                      <span className="px-1.5 py-0.5 rounded-xs bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-semibold">
                        Foto Doutor
                      </span>
                    ) : (rec.fotoPacienteUrl || rec.fotoUrl) ? (
                      <span className="px-1.5 py-0.5 rounded-xs bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-semibold">
                        Foto Paciente
                      </span>
                    ) : null}
                    {rec.pacienteContato && (
                      <span className="text-[11px] text-gray-400 font-mono">
                        {rec.pacienteContato}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                    <span className="font-semibold text-[#A67C52]">
                      {rec.procedimentoNome}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="flex items-center gap-1 text-gray-500">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(rec.dataAtendimento + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                    </span>
                    {rec.profissionalNome && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="text-gray-500 text-[11px]">
                          Resp: {rec.profissionalNome}
                        </span>
                      </>
                    )}
                  </div>

                  {rec.observacoesFinais && (
                    <p className="text-[11px] text-gray-500 mt-1 line-clamp-1 italic">
                      "{rec.observacoesFinais}"
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenRecordDetail(rec)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:text-[#1A1A1A] hover:border-[#A67C52] transition-colors shadow-2xs"
                >
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                  Ver Ficha
                </button>

                <button
                  type="button"
                  onClick={() => onOpenRecordDetail(rec)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#1A1A1A] text-[#C49B74] text-xs font-semibold uppercase tracking-wider hover:bg-black transition-colors shadow-2xs"
                  title="Imprimir ou salvar PDF oficial"
                >
                  <Printer className="w-3.5 h-3.5" />
                  PDF
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Deseja realmente excluir esta ficha de ${rec.pacienteNome} (${rec.procedimentoNome})?`
                      )
                    ) {
                      onDeleteRecord(rec.id);
                    }
                  }}
                  className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Excluir ficha"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {filteredRecords.length === 0 && (
            <div className="text-center py-12 bg-white/40 rounded-sm border border-dashed border-gray-300">
              <FileText className="w-8 h-8 mx-auto text-gray-400 stroke-1" />
              <p className="text-sm font-medium text-gray-600 mt-2">
                Nenhuma ficha de anamnese encontrada
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Clique no botão acima para preencher a primeira ficha de atendimento
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: PATIENTS DIRECTORY */}
      {viewTab === 'patients' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredPatients.map((pat) => {
            const count = getPatientRecordsCount(pat.id);
            return (
              <div
                key={pat.id}
                className="bg-white/80 backdrop-blur-md rounded-sm border border-white/90 p-5 shadow-xs flex flex-col justify-between hover:border-[#A67C52]/40 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#A67C52]/10 text-[#A67C52] flex items-center justify-center font-bold text-xs">
                      {pat.nome.charAt(0)}
                    </div>
                    <span className="px-2 py-0.5 rounded-xs bg-gray-100 text-gray-600 text-[10px] font-mono font-bold">
                      {count} {count === 1 ? 'ficha' : 'fichas'}
                    </span>
                  </div>

                  <h4 className="font-serif-luxury text-base font-bold text-[#1A1A1A] mt-3">
                    {pat.nome}
                  </h4>

                  <div className="mt-2 space-y-1 text-xs text-gray-500">
                    {pat.contato && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {pat.contato}
                      </p>
                    )}
                    {pat.dataNascimento && (
                      <p className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        Nasc: {new Date(pat.dataNascimento + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatientFilter(pat.id);
                      setViewTab('records');
                    }}
                    className="text-xs font-semibold text-[#A67C52] hover:underline"
                  >
                    Ver Histórico ({count})
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenFillModal(pat.id)}
                    className="px-2.5 py-1 rounded-xs bg-[#1A1A1A] text-white text-[11px] font-semibold hover:bg-black transition-colors"
                  >
                    + Nova Ficha
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
