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
import { resolveOrientationImage } from '../../utils/orientationImage';
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
  IdCard,
  Calendar,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

const formatCpf = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

/**
 * Confirmação de identidade antes de exibir uma ficha já anotada pela equipe. O elo real de
 * segurança continua sendo o ID (imprevisível) do link — isto é só uma camada de UX para
 * evitar que alguém que receba o link por engano (encaminhamento errado) veja os dados sem
 * saber o CPF e a data de nascimento da paciente.
 */
const IdentityConfirmGate: React.FC<{
  expectedCpf: string;
  expectedBirth?: string;
  onConfirmed: () => void;
}> = ({ expectedCpf, expectedBirth, onConfirmed }) => {
  const [cpf, setCpf] = useState('');
  const [birth, setBirth] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cpfMatches = cpf.replace(/\D/g, '') === expectedCpf.replace(/\D/g, '');
    const birthMatches = !expectedBirth || birth === expectedBirth;
    if (cpfMatches && birthMatches) {
      onConfirmed();
    } else {
      setError('CPF ou data de nascimento não confere. Confira os dados e tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#F9F8F6] border border-[rgba(26,26,26,.1)] flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6 text-[#A67C52]" />
          </div>
          <h2 className="font-serif-luxury text-[21px] font-semibold text-[#1A1A1A]">Confirme sua identidade</h2>
          <p className="text-[13px] text-[#8a8578]">
            Sua ficha já foi complementada pela equipe. Confirme seus dados para visualizá-la.
          </p>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">CPF</label>
          <div className="relative">
            <IdCard className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
            <input
              type="text"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              required
              className="w-full h-[50px] pl-11 pr-4 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
            />
          </div>
        </div>

        {expectedBirth && (
          <div>
            <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">Data de nascimento</label>
            <div className="relative">
              <Calendar className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
              <input
                type="date"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
                required
                className="w-full h-[50px] pl-11 pr-4 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="w-full h-[50px] rounded-xl bg-[#A67C52] text-white text-[15px] font-semibold hover:bg-[#8E653D] active:scale-97 transition-all"
        >
          Ver minha ficha
        </button>
      </form>
    </div>
  );
};

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
  const profissionalParam = params.get('profissional') || '';

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
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  // Incrementado por "Tentar novamente" — reexecuta o carregamento sem recarregar a página inteira.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Rede de segurança: nenhuma leitura do Firestore tem timeout próprio, então uma conexão ruim
    // (ou uma regra de segurança que pendura a resposta) deixava a paciente olhando para
    // "Carregando sua ficha..." para sempre, sem nada a fazer além de fechar a aba.
    let settled = false;
    const watchdog = setTimeout(() => {
      if (cancelled || settled) return;
      setErrorMsg(
        'A ficha está demorando mais do que o esperado para abrir. Verifique sua conexão e toque em "Tentar novamente".'
      );
      setScreen('error');
    }, 20000);

    async function load() {
      try {
        // A marca da clínica é enfeite: buscada em paralelo e sem poder derrubar o carregamento.
        // Quando ela era o primeiro `await` da sequência, uma leitura negada (a paciente não tem
        // login) travava tudo o que vinha depois — inclusive a própria ficha.
        void getClinicProfileOnce()
          .then((clinic) => {
            if (!cancelled && clinic) setClinicProfile(clinic);
          })
          .catch((err) => console.warn('Perfil da clínica indisponível na página pública:', err));

        // MODE A — returning to an already-created ficha via its personal link
        if (fichaParam) {
          const record = await getAnamnesisRecordById(fichaParam);
          if (cancelled) return;
          if (!record) {
            setErrorMsg('Não encontramos essa ficha. O link pode estar incorreto ou ter expirado.');
            setScreen('error');
            return;
          }
          // A imagem orientativa mora na ficha-modelo, não no registro — por isso ela é buscada
          // aqui junto do resto. A leitura é best-effort: uma ficha-modelo apagada (ou um registro
          // antigo sem `templateId`) apenas deixa a ficha sem a imagem, nunca quebra a abertura.
          const [patient, gq, tplDoRegistro] = await Promise.all([
            getPatientById(record.pacienteId),
            getGeneralQuestionsOnce(),
            record.templateId
              ? getAnamnesisTemplateById(record.templateId).catch(() => null)
              : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setGeneralQuestions(gq);
          setInitialPatient(patient);
          setExistingRecord(record);
          setTemplate({
            id: record.templateId || '',
            procedimentoNome: record.procedimentoNome,
            tem_foto: true,
            fotoModeloUrl: record.fotoModeloUrl,
            imagemOrientativaUrl: tplDoRegistro?.imagemOrientativaUrl,
            imagemOrientativaTitulo: tplDoRegistro?.imagemOrientativaTitulo,
            imagemOrientativaDescricao: tplDoRegistro?.imagemOrientativaDescricao,
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
                imagemOrientativaUrl: tpl.imagemOrientativaUrl,
                imagemOrientativaTitulo: tpl.imagemOrientativaTitulo,
                imagemOrientativaDescricao: tpl.imagemOrientativaDescricao,
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

    load().finally(() => {
      settled = true;
      clearTimeout(watchdog);
    });
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

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
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#A67C52] animate-spin mx-auto" />
          <p className="text-[14px] text-[#8a8578]">Carregando sua ficha de anamnese...</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-red-50 text-[#E11D48] border border-red-200 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="font-serif-luxury text-[21px] font-semibold text-[#1A1A1A]">Não foi possível abrir a ficha</h2>
          <p className="text-[14px] text-[#8a8578] leading-relaxed">{errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              setErrorMsg('');
              setScreen('loading');
              setReloadToken((n) => n + 1);
            }}
            className="inline-flex items-center justify-center gap-2 w-full h-[50px] rounded-xl bg-[#A67C52] text-white text-[15px] font-semibold hover:bg-[#8E653D] active:scale-97 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'success' && savedRecord) {
    const firstName = savedRecord.pacienteNome?.split(' ')[0] || '';
    return (
      <div className="min-h-screen bg-[#F9F8F6] py-8 sm:py-16 px-4">
        <div className="max-w-lg mx-auto text-center space-y-5 animate-fadeIn">
          <div className="w-[76px] h-[76px] rounded-full bg-[#A67C52] text-white mx-auto flex items-center justify-center shadow-[0_6px_22px_rgba(166,124,82,.3)]">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h2 className="font-serif-luxury text-[32px] font-medium text-[#1A1A1A]">Ficha enviada</h2>
            <p className="text-[15px] text-[#4a4740] mt-2 max-w-md mx-auto leading-relaxed">
              Obrigado, <strong className="text-[#1A1A1A]">{firstName}</strong>. Suas informações foram registradas
              com segurança no prontuário digital da clínica.
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 text-left space-y-5">
            <div>
              <span className="text-[13px] font-semibold text-[#A67C52]">Seu atendimento</span>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-[14px]">
                  <span className="text-[#8a8578]">Procedimento</span>
                  <span className="font-semibold text-[#1A1A1A]">{savedRecord.procedimentoNome}</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-[#8a8578]">Protocolo digital</span>
                  <span className="font-semibold text-[#1A1A1A]" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    #{savedRecord.id.slice(-8).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {wasGenericLink && (
              <div className="bg-[#F9F8F6] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-[#1A1A1A] font-semibold text-[14px]">
                  <Sparkles className="w-4 h-4 text-[#A67C52]" />
                  Guarde este link — ele é só seu
                </div>
                <p className="text-[13px] text-[#8a8578] leading-relaxed">
                  Use este link pessoal para voltar, revisar ou corrigir suas respostas até a sua consulta.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={personalLink}
                    className="w-full h-11 px-3 text-[13px] rounded-xl bg-white border border-[rgba(26,26,26,.1)] text-[#4a4740] select-all focus:outline-hidden"
                    style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                  />
                  <button
                    type="button"
                    onClick={handleCopyPersonalLink}
                    className="w-11 h-11 rounded-xl bg-[#1A1A1A] text-white flex items-center justify-center shrink-0 hover:bg-black transition-all"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {selfWaUrl && (
                  <a
                    href={selfWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 hover:underline"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Enviar este link para o meu WhatsApp
                  </a>
                )}
              </div>
            )}

            <a
              href={waConfirmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-[52px] rounded-2xl bg-[#25D366] text-white hover:bg-[#20ba59] font-semibold text-[15px] shadow-xs active:scale-97 transition-all"
            >
              <MessageCircle className="w-[18px] h-[18px]" />
              Falar com a clínica no WhatsApp
            </a>

            <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-3 border-t border-[rgba(26,26,26,.07)] pt-4">
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="flex items-center gap-2 text-[13px] text-[#A67C52] hover:text-[#8E653D] font-semibold transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Ver / baixar PDF da ficha
              </button>
              <span className="hidden sm:inline text-[#a8a29a]">•</span>
              <button
                type="button"
                onClick={() => setScreen('form')}
                className="flex items-center gap-2 text-[13px] text-[#8a8578] hover:text-[#1A1A1A] font-semibold transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Continuar editando respostas
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
            orientationImage={resolveOrientationImage(template)}
          />
        )}
      </div>
    );
  }

  // screen === 'form'
  if (!template) return null;

  const isLocked = !!existingRecord?.profissionalPreenchidoEm;

  // Só pedimos a confirmação de identidade quando temos um CPF salvo para conferir contra —
  // fichas antigas (criadas antes deste recurso) não têm CPF e continuam com acesso direto.
  const gateCpf = initialPatient?.cpf;
  const needsIdentityGate = isLocked && !!gateCpf && !identityConfirmed;

  if (needsIdentityGate && existingRecord) {
    return (
      <IdentityConfirmGate
        expectedCpf={gateCpf!}
        expectedBirth={initialPatient?.dataNascimento || existingRecord.pacienteDataNascimento}
        onConfirmed={() => setIdentityConfirmed(true)}
      />
    );
  }

  if (isLocked && existingRecord) {
    return (
      <div className="min-h-screen bg-[#F9F8F6]">
        <div className="max-w-3xl mx-auto pt-6 sm:pt-12 px-3 sm:px-6 pb-3 text-center">
          <p className="text-[13px] text-[#4a4740] bg-white inline-block px-4 py-2 rounded-full border border-[rgba(26,26,26,.1)]">
            Sua ficha já foi complementada pela equipe e não pode mais ser editada. Você ainda pode salvar o PDF
            com as suas respostas.
          </p>
        </div>
        <PrintableAnamnesisSheet
          record={existingRecord}
          clinicProfile={clinicProfile}
          onClose={() => {}}
          viewerRole="paciente"
          orientationImage={resolveOrientationImage(template)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] py-6 sm:py-12 px-5 sm:px-6">
      <OnlinePatientAnamnesisForm
        template={template}
        generalQuestions={generalQuestions}
        clinicProfile={clinicProfile}
        initialPatient={initialPatient}
        existingRecord={existingRecord}
        prefillRespostasGerais={prefillGerais}
        professionalId={profissionalParam || undefined}
        onSavePatient={savePatient}
        onSaveRecord={saveAnamnesisRecord}
        onSaved={handleSaved}
      />
    </div>
  );
};
