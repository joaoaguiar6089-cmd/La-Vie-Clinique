import React, { useEffect, useState } from 'react';
import { AnamnesisTemplate, AnamnesisRecord, Patient, ClinicProfile, AnamnesisQuestion } from '../../types';
import {
  getAnamnesisTemplateById,
  getPatientById,
  getRecordsForPatient,
  getAnamnesisRecordById,
  getGeneralQuestionsOnce,
  getClinicProfileOnce,
  savePatient,
  saveAnamnesisRecord,
} from '../../services/databaseService';
import { OnlinePatientAnamnesisForm } from './OnlinePatientAnamnesisForm';
import { PrintableAnamnesisSheet } from './PrintableAnamnesisSheet';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  Copy,
  Check,
  Edit3,
  FileDown,
  Sparkles,
} from 'lucide-react';

type Screen = 'loading' | 'error' | 'form' | 'success';

const DEFAULT_CLINIC: ClinicProfile = {
  name: 'La Vie Clinique',
  tagline: 'Excelência Médica e Estética Avançada',
  professionals: [],
  phone: '',
  instagram: '',
  address: '',
  cityState: '',
};

export const PublicAnamnesisEntry: React.FC = () => {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const anamneseParam = params.get('anamnese') || '';
  const pacienteParam = params.get('paciente') || '';
  const fichaParam = params.get('ficha') || '';

  const [screen, setScreen] = useState<Screen>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [clinicProfile, setClinicProfile] = useState<ClinicProfile>(DEFAULT_CLINIC);
  const [template, setTemplate] = useState<AnamnesisTemplate | null>(null);
  const [generalQuestions, setGeneralQuestions] = useState<AnamnesisQuestion[]>([]);
  const [initialPatient, setInitialPatient] = useState<Patient | null>(null);
  const [existingRecord, setExistingRecord] = useState<AnamnesisRecord | null>(null);
  const [prefillGerais, setPrefillGerais] = useState<Record<string, any> | undefined>(undefined);
  const [wasGenericLink, setWasGenericLink] = useState(false);
  const [savedRecord, setSavedRecord] = useState<AnamnesisRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const clinic = await getClinicProfileOnce();
        if (cancelled) return;
        if (clinic) setClinicProfile(clinic);

        // MODE A — returning to an already-created ficha via its personal link
        if (fichaParam) {
          const record = await getAnamnesisRecordById(fichaParam);
          if (cancelled) return;
          if (!record) {
            setErrorMsg('Não encontramos essa ficha. O link pode estar incorreto ou ter expirado.');
            setScreen('error');
            return;
          }
          const [patient, gq] = await Promise.all([getPatientById(record.pacienteId), getGeneralQuestionsOnce()]);
          if (cancelled) return;
          setGeneralQuestions(gq);
          setInitialPatient(patient);
          setExistingRecord(record);
          setTemplate({
            id: record.templateId || '',
            procedimentoNome: record.procedimentoNome,
            tem_foto: true,
            fotoModeloUrl: record.fotoModeloUrl,
            perguntasEspecificas: record.perguntasSnapshot?.especificas || [],
          });
          setScreen('form');
          return;
        }

        // MODE B — fresh share link (template, optionally pre-associated to a patient)
        if (anamneseParam) {
          const tpl = await getAnamnesisTemplateById(anamneseParam);
          if (cancelled) return;
          if (!tpl) {
            setErrorMsg('Não encontramos essa ficha de anamnese. Peça um novo link à clínica.');
            setScreen('error');
            return;
          }
          const gq = await getGeneralQuestionsOnce();
          if (cancelled) return;
          setGeneralQuestions(gq);
          setTemplate(tpl);

          if (pacienteParam) {
            const patient = await getPatientById(pacienteParam);
            if (cancelled) return;
            setInitialPatient(patient);

            const priorRecords = await getRecordsForPatient(pacienteParam);
            if (cancelled) return;

            const sameTemplateRecord = priorRecords.find((r) => r.templateId === anamneseParam);
            if (sameTemplateRecord) {
              // Já existe uma ficha desta paciente para este procedimento — reabrir para editar/visualizar
              setExistingRecord(sameTemplateRecord);
              setTemplate({
                id: sameTemplateRecord.templateId || tpl.id,
                procedimentoNome: sameTemplateRecord.procedimentoNome,
                tem_foto: true,
                fotoModeloUrl: sameTemplateRecord.fotoModeloUrl,
                perguntasEspecificas: sameTemplateRecord.perguntasSnapshot?.especificas || tpl.perguntasEspecificas,
              });
            } else if (priorRecords.length > 0) {
              setPrefillGerais({ ...priorRecords[0].respostasGerais });
            }
          } else {
            setWasGenericLink(true);
          }

          setScreen('form');
          return;
        }

        setErrorMsg('Link inválido — faltam informações para abrir a ficha de anamnese.');
        setScreen('error');
      } catch (err) {
        console.error('Erro ao carregar ficha pública:', err);
        if (!cancelled) {
          setErrorMsg('Não foi possível carregar a ficha agora. Verifique sua conexão e tente novamente.');
          setScreen('error');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaved = (record: AnamnesisRecord) => {
    if (!existingRecord) {
      setSavedRecord(record);
      setExistingRecord(record);
      setScreen('success');
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const personalLink = savedRecord ? `${origin}${pathname}?ficha=${savedRecord.id}` : '';

  const handleCopyPersonalLink = () => {
    navigator.clipboard.writeText(personalLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const patientPhoneDigits = savedRecord?.pacienteContato?.replace(/\D/g, '') || '';
  const selfWaText = encodeURIComponent(
    `Guardando o link da minha Ficha de Anamnese (${savedRecord?.procedimentoNome || ''}) na ${
      clinicProfile.name
    } para consultar depois:\n\n${personalLink}`
  );
  const selfWaUrl = patientPhoneDigits
    ? `https://wa.me/${patientPhoneDigits.startsWith('55') ? patientPhoneDigits : `55${patientPhoneDigits}`}?text=${selfWaText}`
    : '';

  const clinicPhoneDigits = clinicProfile.phone?.replace(/\D/g, '') || '';
  const waConfirmText = encodeURIComponent(
    `Olá, ${clinicProfile.name}! Acabei de preencher minha Ficha de Anamnese online para o procedimento *${
      savedRecord?.procedimentoNome || ''
    }*.\n\n👤 Paciente: *${savedRecord?.pacienteNome || ''}*\n📅 Data: ${new Date().toLocaleDateString(
      'pt-BR'
    )}\n\nJá enviei minhas respostas. Até breve!`
  );
  const waConfirmUrl = clinicPhoneDigits
    ? `https://wa.me/${clinicPhoneDigits.startsWith('55') ? clinicPhoneDigits : `55${clinicPhoneDigits}`}?text=${waConfirmText}`
    : `https://wa.me/?text=${waConfirmText}`;

  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#A67C52] animate-spin mx-auto" />
          <p className="text-xs text-gray-500">Carregando sua ficha de anamnese...</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-sm border border-gray-200/80 shadow-xl p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 border border-red-200 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="font-serif-luxury text-lg font-bold text-[#1A1A1A]">Não foi possível abrir a ficha</h2>
          <p className="text-xs text-gray-500 leading-relaxed">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (screen === 'success' && savedRecord) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] py-8 sm:py-16 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-sm border border-gray-200/80 shadow-xl overflow-hidden animate-fadeIn">
          <div className="bg-[#1A1A1A] p-8 text-center text-white relative">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 mx-auto flex items-center justify-center mb-4 shadow-lg">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#C49B74] block font-bold mb-1">
              {clinicProfile.name}
            </span>
            <h2 className="font-serif-luxury text-2xl sm:text-3xl font-bold tracking-tight">
              Ficha de Anamnese Enviada!
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 mt-2 max-w-md mx-auto leading-relaxed">
              Obrigado, <strong className="text-white">{savedRecord.pacienteNome}</strong>. Suas informações foram
              registradas com segurança no prontuário digital da clínica.
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="bg-[#FAF9F6] border border-gray-200 rounded-sm p-4 text-xs space-y-2">
              <div className="flex justify-between border-b border-gray-200/60 pb-2">
                <span className="text-gray-500">Procedimento:</span>
                <span className="font-bold text-[#1A1A1A]">{savedRecord.procedimentoNome}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-gray-500">Protocolo Digital:</span>
                <span className="font-mono text-gray-700 font-bold">#{savedRecord.id.slice(-8).toUpperCase()}</span>
              </div>
            </div>

            {wasGenericLink && (
              <div className="bg-[#A67C52]/10 border border-[#A67C52]/30 rounded-sm p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-[#1A1A1A] font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-[#A67C52]" />
                  Guarde este link — ele é só seu
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Use este link pessoal para voltar, revisar ou corrigir suas respostas até a sua consulta.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={personalLink}
                    className="w-full px-3 py-2 text-[11px] rounded-sm bg-white border border-gray-200 text-gray-700 font-mono select-all focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleCopyPersonalLink}
                    className="flex items-center gap-1 px-3 py-2 rounded-sm bg-[#1A1A1A] text-white text-xs font-semibold shrink-0 hover:bg-black transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {selfWaUrl && (
                  <a
                    href={selfWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Enviar este link para o meu WhatsApp
                  </a>
                )}
              </div>
            )}

            <div className="bg-[#E7F8ED] border border-emerald-300/80 rounded-sm p-5 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-emerald-950 font-bold text-sm">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                Avisar a Clínica pelo WhatsApp
              </div>
              <a
                href={waConfirmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-sm bg-[#25D366] text-white hover:bg-[#20ba59] font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                Enviar Confirmação pelo WhatsApp
              </a>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="flex items-center gap-2 text-xs text-[#A67C52] hover:text-[#8e6945] font-semibold transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Ver / Baixar PDF da Ficha
              </button>
              <span className="hidden sm:inline text-gray-300">•</span>
              <button
                type="button"
                onClick={() => setScreen('form')}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800 font-semibold transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Continuar Editando Respostas
              </button>
            </div>
          </div>
        </div>

        {showPdfModal && (
          <PrintableAnamnesisSheet
            record={savedRecord}
            clinicProfile={clinicProfile}
            onClose={() => setShowPdfModal(false)}
            viewerRole="paciente"
          />
        )}
      </div>
    );
  }

  // screen === 'form'
  if (!template) return null;

  const isLocked = !!existingRecord?.profissionalPreenchidoEm;

  if (isLocked && existingRecord) {
    return (
      <div className="min-h-screen bg-[#FAF9F6]">
        <div className="max-w-3xl mx-auto pt-6 sm:pt-12 px-3 sm:px-6 pb-3 text-center">
          <p className="text-[11px] text-gray-500 bg-white inline-block px-3 py-1.5 rounded-sm border border-gray-200">
            Sua ficha já foi complementada pela equipe e não pode mais ser editada. Você ainda pode salvar o PDF
            com as suas respostas.
          </p>
        </div>
        <PrintableAnamnesisSheet
          record={existingRecord}
          clinicProfile={clinicProfile}
          onClose={() => {}}
          viewerRole="paciente"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] py-6 sm:py-12 px-3 sm:px-6">
      <OnlinePatientAnamnesisForm
        template={template}
        generalQuestions={generalQuestions}
        clinicProfile={clinicProfile}
        initialPatient={initialPatient}
        existingRecord={existingRecord}
        prefillRespostasGerais={prefillGerais}
        onSavePatient={savePatient}
        onSaveRecord={saveAnamnesisRecord}
        onSaved={handleSaved}
      />
    </div>
  );
};
