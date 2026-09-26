import React, { useState } from 'react';
import { Patient, AnamnesisRecord, AnamnesisTemplate, ClinicProfile } from '../../types';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { ShareAnamnesisLinkModal } from './ShareAnamnesisLinkModal';
import { anamneseFechada } from '../../utils/evaluations';
import { ChevronDown, ClipboardList, Camera, Download, Eye, FileText, Share2, Trash2 } from 'lucide-react';
import { Avatar, CampoDeBusca, MenuDeAcoes } from '../common/Tinta';

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
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [selectedPatientFilter, setSelectedPatientFilter] = useState<string>('all');
  const [viewTab, setViewTab] = useState<'records' | 'patients'>('records');

  // Envio do link de preenchimento online — a mesma ação que existe na aba "Fichas por
  // procedimento", disponível também aqui, ao lado de "Preencher Nova Ficha": é daqui que a
  // equipe parte quando o objetivo é a paciente, não o modelo de ficha.
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharePatientId, setSharePatientId] = useState<string | undefined>(undefined);

  const abrirEnvioDeLink = (patientId?: string) => {
    setSharePatientId(patientId);
    setShareModalOpen(true);
  };

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

  const tagDoProcedimento =
    'inline-flex items-center px-3 py-1.5 rounded-[10px] bg-cream text-[#5B3E25] text-[14px] font-semibold';
  const seloPequeno = 'inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold';

  return (
    <div className="flex flex-col gap-4">
      {/* As duas maneiras de uma ficha nascer: aqui, com a paciente ao lado — ou pelo link, que
          ela preenche em casa. */}
      <div className="grid grid-cols-2 gap-2.5 sm:max-w-xl">
        <button
          type="button"
          onClick={() => onOpenFillModal()}
          className="rounded-[20px] bg-ink text-white p-4 flex flex-col gap-[18px] text-left hover:bg-black transition-colors"
        >
          <ClipboardList className="w-[22px] h-[22px]" />
          <span>
            <span className="block text-[15px] font-bold">Preencher ficha</span>
            <span className="block text-[12px] text-cream/75">aqui, com a paciente</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => abrirEnvioDeLink()}
          disabled={templates.length === 0}
          title={
            templates.length === 0
              ? 'Cadastre um modelo de ficha antes de enviar o link'
              : 'Gerar e enviar o link de preenchimento para a paciente'
          }
          className="rounded-[20px] bg-card border border-ink/10 text-ink p-4 flex flex-col gap-[18px] text-left hover:border-ink/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Share2 className="w-[22px] h-[22px]" />
          <span>
            <span className="block text-[15px] font-bold">Enviar link</span>
            <span className="block text-[12px] text-ink-soft">ela preenche em casa</span>
          </span>
        </button>
      </div>

      <CampoDeBusca
        valor={searchTerm}
        onMudar={setSearchTerm}
        placeholder="Paciente, procedimento ou telefone"
        rotulo="Buscar ficha por paciente, procedimento, telefone ou profissional"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-bold text-ink">
          {viewTab === 'records'
            ? `${filteredRecords.length} ${filteredRecords.length === 1 ? 'ficha' : 'fichas'}`
            : `${filteredPatients.length} ${filteredPatients.length === 1 ? 'paciente' : 'pacientes'}`}
        </p>
        {viewTab === 'records' && (
          <label className="relative min-w-0">
            <span className="sr-only">Filtrar por paciente</span>
            <select
              value={selectedPatientFilter}
              onChange={(e) => setSelectedPatientFilter(e.target.value)}
              className="appearance-none max-w-[220px] truncate bg-transparent border-0 pr-6 py-2 text-[14px] font-semibold text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded-lg text-right"
            >
              <option value="all">Todas as pacientes</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({getPatientRecordsCount(p.id)})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-ink-soft" />
          </label>
        )}
      </div>

      {/* VIEW 1: AS FICHAS */}
      {viewTab === 'records' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredRecords.map((rec) => {
            const foto = rec.fotoPacienteUrl || rec.fotoUrl || rec.fotoModeloUrl;
            const temFotoPaciente = !!(rec.fotoPacienteUrl || rec.fotoUrl);
            return (
              <article
                key={rec.id}
                className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3"
              >
                <div className="flex gap-3 items-center">
                  {foto ? (
                    <img
                      src={foto}
                      alt=""
                      className="w-[46px] h-[46px] rounded-full object-cover shrink-0 border border-ink/10"
                    />
                  ) : (
                    <Avatar nome={rec.pacienteNome} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-bold text-ink truncate">{rec.pacienteNome}</p>
                    <p className="text-[13px] text-ink-soft truncate">
                      {new Date(rec.dataAtendimento + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                      {rec.profissionalNome ? ` · ${rec.profissionalNome}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={tagDoProcedimento}>{rec.procedimentoNome}</span>
                  {rec.origemPreenchimento === 'online_paciente' && (
                    <span className={`${seloPequeno} bg-ok-bg text-ok`}>Online</span>
                  )}
                  {/*
                    "Aguardando atendimento", e não mais "aguardando médico": o que fecha a
                    ficha agora é a visita acontecer, não a profissional completar um bloco
                    dentro dela. Sem esta troca, o selo ficaria aceso para sempre em toda ficha
                    preenchida online.
                  */}
                  {rec.origemPreenchimento === 'online_paciente' && !anamneseFechada(rec) && (
                    <span className={`${seloPequeno} bg-warn-bg text-warn`}>Aguardando atendimento</span>
                  )}
                  {(rec.fotoModeloUrl || temFotoPaciente) && (
                    <span className={`${seloPequeno} bg-line-soft text-ink-soft gap-1`}>
                      <Camera className="w-3.5 h-3.5" />
                      {rec.fotoModeloUrl && temFotoPaciente
                        ? 'Fotos'
                        : temFotoPaciente
                        ? 'Foto da paciente'
                        : 'Foto de referência'}
                    </span>
                  )}
                </div>

                {rec.observacoesFinais && (
                  <p className="text-[13px] text-ink-soft line-clamp-1 italic">"{rec.observacoesFinais}"</p>
                )}

                <div className="flex gap-2 mt-auto">
                  <button
                    type="button"
                    onClick={() => onOpenRecordDetail(rec)}
                    className="flex-1 h-11 rounded-xl bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors"
                  >
                    Ver ficha
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenRecordDetail(rec)}
                    title="Imprimir ou salvar o PDF oficial"
                    className="flex-1 h-11 rounded-xl border border-ink/15 text-ink text-[14px] font-semibold flex items-center justify-center gap-2 hover:border-ink/40 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    PDF
                  </button>
                  <MenuDeAcoes
                    rotulo={`Mais ações da ficha de ${rec.pacienteNome}`}
                    titulo={rec.pacienteNome}
                    acoes={[
                      {
                        rotulo: 'Excluir ficha',
                        icone: Trash2,
                        tom: 'perigo',
                        onClick: () =>
                          setConfirmacao({
                            titulo: 'Excluir esta ficha?',
                            mensagem: `Ficha de ${rec.pacienteNome} — ${rec.procedimentoNome}.\n\nTodas as respostas e anotações registradas nela são apagadas para sempre.`,
                            textoConfirmar: 'Excluir ficha',
                            onConfirmar: () => onDeleteRecord(rec.id),
                          }),
                      },
                    ]}
                  />
                </div>
              </article>
            );
          })}

          {filteredRecords.length === 0 && (
            <div className="lg:col-span-2 rounded-[20px] bg-card border border-ink/8 py-12 px-5 text-center">
              <FileText className="w-8 h-8 mx-auto text-ink-soft" />
              <p className="text-[15px] font-bold text-ink mt-2">Nenhuma ficha de anamnese encontrada</p>
              <p className="text-[14px] text-ink-soft mt-0.5">
                Use "Preencher ficha" acima para a primeira — ou envie o link para a paciente.
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: POR PACIENTE */}
      {viewTab === 'patients' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPatients.map((pat) => {
            const count = getPatientRecordsCount(pat.id);
            return (
              <article
                key={pat.id}
                className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar nome={pat.nome} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-bold text-ink truncate">{pat.nome}</p>
                    <p className="text-[13px] text-ink-soft truncate">
                      {count} {count === 1 ? 'ficha' : 'fichas'}
                      {pat.contato ? ` · ${pat.contato}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-auto">
                  <button
                    type="button"
                    onClick={() => onOpenFillModal(pat.id)}
                    className="flex-1 h-11 rounded-xl bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors"
                  >
                    Nova ficha
                  </button>
                  <MenuDeAcoes
                    rotulo={`Mais ações para ${pat.nome}`}
                    titulo={pat.nome}
                    acoes={[
                      {
                        rotulo: `Ver as fichas (${count})`,
                        icone: Eye,
                        onClick: () => {
                          setSelectedPatientFilter(pat.id);
                          setViewTab('records');
                        },
                      },
                      ...(templates.length > 0
                        ? [
                            {
                              rotulo: 'Enviar o link da ficha',
                              icone: Share2,
                              onClick: () => abrirEnvioDeLink(pat.id),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* A lista por paciente é a exceção — quem procura uma pessoa usa Pacientes —, então fica
          no pé, e não disputando o topo com as fichas. */}
      <button
        type="button"
        onClick={() => setViewTab(viewTab === 'records' ? 'patients' : 'records')}
        className="self-start min-h-[44px] text-[14px] font-semibold text-ink underline underline-offset-2"
      >
        {viewTab === 'records' ? 'Ver a lista por paciente' : 'Voltar para as fichas'}
      </button>

      {shareModalOpen && (
        <ShareAnamnesisLinkModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setSharePatientId(undefined);
          }}
          templates={templates}
          patients={patients}
          clinicProfile={clinicProfile}
          initialPatientId={sharePatientId}
        />
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
