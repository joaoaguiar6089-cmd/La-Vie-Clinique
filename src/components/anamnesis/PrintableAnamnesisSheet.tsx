import React from 'react';
import { AnamnesisRecord, ClinicProfile } from '../../types';
import { Printer, X, Download, ShieldCheck, CheckSquare, Calendar, User, Phone } from 'lucide-react';

interface PrintableAnamnesisSheetProps {
  record: AnamnesisRecord;
  clinicProfile: ClinicProfile;
  onClose: () => void;
}

export const PrintableAnamnesisSheet: React.FC<PrintableAnamnesisSheetProps> = ({
  record,
  clinicProfile,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const calculateAge = (birthDateStr?: string) => {
    if (!birthDateStr) return null;
    const birth = new Date(birthDateStr);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const patientAge = calculateAge(record.pacienteDataNascimento);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      {/* Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-sm shadow-2xl overflow-hidden max-h-[96vh] flex flex-col">
        {/* Screen Controls Header (hidden in print) */}
        <div className="px-6 py-3.5 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74]" />
            <span className="font-serif-luxury text-sm tracking-wide">
              Ficha Clínica Oficial de Anamnese — {record.pacienteNome}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#8e6945] transition-all shadow-xs"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-xs text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE DOCUMENT CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 text-[#1A1A1A] font-sans bg-white print:p-0 print:overflow-visible">
          {/* Clinic Header */}
          <div className="border-b-2 border-[#1A1A1A] pb-5 mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif-luxury text-2xl font-bold tracking-tight text-[#1A1A1A]">
                  {clinicProfile.name || 'LA VIE CLINIQUE'}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#A67C52] border-l border-[#A67C52]/40 pl-2">
                  Prontuário & Anamnese
                </span>
              </div>
              <p className="text-xs text-gray-500 italic mt-0.5">
                {clinicProfile.tagline || 'Excelência Médica e Estética Avançada'}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {clinicProfile.address} • {clinicProfile.cityState} • Tel: {clinicProfile.phone}
              </p>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-gray-100 border border-gray-200 text-xs font-mono font-bold text-[#1A1A1A] rounded-xs">
                FICHA Nº {record.id.slice(-6).toUpperCase()}
              </span>
              <p className="text-[11px] text-gray-500 mt-1 font-medium">
                Data do Atendimento:{' '}
                <span className="font-bold text-[#1A1A1A]">
                  {new Date(record.dataAtendimento + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                </span>
              </p>
            </div>
          </div>

          {/* Patient Info Box */}
          <div className="bg-[#FAF9F6] border border-gray-200 rounded-sm p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="sm:col-span-2">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Paciente
              </span>
              <span className="text-sm font-bold text-[#1A1A1A] block mt-0.5">
                {record.pacienteNome}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Nascimento / Idade
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {record.pacienteDataNascimento
                  ? `${new Date(record.pacienteDataNascimento + 'T12:00:00Z').toLocaleDateString('pt-BR')} ${
                      patientAge !== null ? `(${patientAge} anos)` : ''
                    }`
                  : 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Contato / WhatsApp
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {record.pacienteContato || 'Não informado'}
              </span>
            </div>

            <div className="sm:col-span-2 pt-2 border-t border-gray-200/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Preferência Musical
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {record.respostasGerais?.['gen-musica'] || (record as any).pacienteMusica || 'Não informado'}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-200/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Procedimento Realizado
              </span>
              <span className="font-serif-luxury text-sm font-bold text-[#A67C52] block mt-0.5">
                {record.procedimentoNome}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-200/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Profissional Responsável
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {record.profissionalNome || clinicProfile.professionalName || 'Equipe La Vie'}
              </span>
            </div>
          </div>

          {/* Outras Informações / Perguntas Adicionais (Sem o título "Perguntas Gerais") */}
          {(() => {
            const nonDuplicateQuestions = (record.perguntasSnapshot?.gerais || []).filter((q) => {
              const idLower = q.id.toLowerCase();
              const textLower = q.texto.toLowerCase();
              return !(
                idLower === 'gen-nome' ||
                idLower === 'gen-nascimento' ||
                idLower === 'gen-whatsapp' ||
                idLower === 'gen-contato' ||
                idLower === 'gen-telefone' ||
                idLower === 'gen-musica' ||
                textLower.includes('nome completo') ||
                textLower.includes('qual seu nome') ||
                textLower === 'data de nascimento' ||
                textLower.includes('música') ||
                textLower.includes('musica')
              );
            });

            if (nonDuplicateQuestions.length === 0) return null;

            return (
              <div className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                  {nonDuplicateQuestions.map((q) => {
                    const val = record.respostasGerais[q.id];
                    let display = 'Não informado';
                    if (val !== undefined && val !== null && val !== '') {
                      if (Array.isArray(val)) display = val.join(', ');
                      else if (typeof val === 'boolean') display = val ? 'Sim' : 'Não';
                      else display = String(val);
                    }

                    return (
                      <div key={q.id} className="py-1 border-b border-gray-100">
                        <span className="text-[11px] text-gray-500 block leading-tight">{q.texto}</span>
                        <span className="text-xs font-bold text-[#1A1A1A] block mt-0.5">{display}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Section: Avaliação Específica do Procedimento */}
          <div className="mb-6">
            <div className="flex items-center gap-2 border-b border-[#A67C52]/40 pb-1.5 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
              <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
                Avaliação Específica — {record.procedimentoNome}
              </h4>
            </div>

            <div className="space-y-2.5">
              {record.perguntasSnapshot.especificas.map((q, idx) => {
                const val = record.respostasEspecificas[q.id];
                let display = 'Não informado';
                if (val !== undefined && val !== null && val !== '') {
                  if (Array.isArray(val)) display = val.join(', ');
                  else if (typeof val === 'boolean') display = val ? 'Sim' : 'Não';
                  else if (q.tipo_campo === 'escala') display = `${val} / ${q.escalaMax || 10}`;
                  else display = String(val);
                }

                const isWarning =
                  (q.tipo_campo === 'sim_nao' && (val === 'Sim' || val === true)) ||
                  (q.tipo_campo === 'escala' && Number(val) >= 7);

                return (
                  <div
                    key={q.id}
                    className={`p-2.5 rounded-xs border ${
                      isWarning
                        ? 'bg-amber-50/40 border-amber-200/80'
                        : 'bg-white border-gray-200/80'
                    } text-xs`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-gray-700 leading-snug">
                        {idx + 1}. {q.texto}
                      </span>
                      {q.obrigatoria && <span className="text-[10px] text-[#A67C52] font-bold">*</span>}
                    </div>
                    <div className="mt-1 font-bold text-[#1A1A1A]">
                      Resposta: <span className={isWarning ? 'text-amber-900' : 'text-[#1A1A1A]'}>{display}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Fotos de Mapeamento & Área de Anotação Manual (Tablet / Impressão) */}
          {(record.fotoModeloUrl || record.fotoPacienteUrl || record.fotoUrl) && (
            <div className="mb-6 page-break-inside-avoid">
              <div className="flex items-center gap-2 border-b border-[#A67C52]/40 pb-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
                  3. Mapeamento Clínico & Fotos para Anotações Manuais (Tablet / Impressão)
                </h4>
              </div>

              {/* Photos Grid */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Doctor's Reference Photo */}
                  {record.fotoModeloUrl && (
                    <div className="border border-gray-200 rounded-sm p-3.5 bg-[#FAF9F6] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A]">
                            Referência / Mapeamento do Doutor
                          </span>
                          <span className="text-[9px] text-[#A67C52] bg-[#A67C52]/10 px-1.5 py-0.5 rounded-xs font-semibold">
                            Guia Clínico
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mb-2">
                          Mapa anatômico de referência para marcação de unidades, doses e vetores.
                        </p>
                      </div>

                      <div className="w-full h-64 sm:h-72 border border-gray-300 rounded-xs overflow-hidden bg-white flex items-center justify-center">
                        <img
                          src={record.fotoModeloUrl}
                          alt="Foto de referência do doutor"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <span className="text-[9px] text-gray-400 text-center mt-1.5 italic">
                        Espaço para anotações manuscritas com caneta ou stylus no tablet
                      </span>
                    </div>
                  )}

                  {/* Patient's Uploaded Photo */}
                  {(record.fotoPacienteUrl || record.fotoUrl) && (
                    <div className="border border-gray-200 rounded-sm p-3.5 bg-[#FAF9F6] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
                            Foto Real da Paciente ({record.pacienteNome})
                          </span>
                          <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-xs font-semibold">
                            {record.origemPreenchimento === 'online_paciente'
                              ? 'Enviada pelo Paciente'
                              : 'Registro Clínico'}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mb-2">
                          Imagem da área a ser tratada para anotações personalizadas na própria foto.
                        </p>
                      </div>

                      <div className="w-full h-64 sm:h-72 border border-emerald-300 rounded-xs overflow-hidden bg-white flex items-center justify-center">
                        <img
                          src={record.fotoPacienteUrl || record.fotoUrl}
                          alt="Foto da paciente"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <span className="text-[9px] text-gray-400 text-center mt-1.5 italic">
                        Plano personalizado: anote pontos e unidades diretamente sobre a imagem
                      </span>
                    </div>
                  )}
                </div>

                {/* Manual Annotation Box with lines */}
                <div className="border border-dashed border-gray-300 rounded-sm p-4 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                      Anotações Manuais da Profissional (Doses, Vetores, Unidades e Intercorrências)
                    </span>
                    <span className="text-[9px] text-gray-400 italic">
                      Preencher no papel ou com Apple Pencil / S-Pen no tablet
                    </span>
                  </div>

                  <div className="space-y-3.5 my-2">
                    <div className="border-b border-gray-200 border-dashed" />
                    <div className="border-b border-gray-200 border-dashed" />
                    <div className="border-b border-gray-200 border-dashed" />
                    <div className="border-b border-gray-200 border-dashed" />
                  </div>

                  <div className="pt-3 border-t border-gray-200 text-[10px] text-gray-500 flex flex-wrap justify-between gap-2">
                    <span>Lote do Produto: _____________________________</span>
                    <span>Validade: _____/_____/_________</span>
                    <span>Volume / Unidades Totais: ___________________</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Observações Finais */}
          {record.observacoesFinais && (
            <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-sm text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                Observações Finais & Orientações
              </span>
              <p className="text-gray-800 leading-relaxed font-medium">
                {record.observacoesFinais}
              </p>
            </div>
          )}

          {/* Section 5: Termo de Consentimento & Assinaturas */}
          <div className="mt-8 pt-4 border-t-2 border-gray-300 page-break-inside-avoid">
            <p className="text-[10px] text-gray-500 leading-relaxed text-justify mb-8">
              Declaro que todas as informações prestadas nesta ficha de anamnese são verdadeiras, não tendo omitido qualquer
              fato relevante sobre meu estado de saúde, uso de medicações ou procedimentos prévios. Fui devidamente orientado(a)
              acerca dos cuidados pré e pós-procedimento e autorizo a realização do protocolo estético indicado.
            </p>

            <div className="grid grid-cols-2 gap-8 text-center pt-2">
              <div>
                <div className="border-t border-[#1A1A1A] mx-auto w-48 mb-1.5" />
                <span className="text-xs font-bold text-[#1A1A1A] block">{record.pacienteNome}</span>
                <span className="text-[10px] text-gray-400 block">Assinatura do(a) Paciente</span>
              </div>

              <div>
                <div className="border-t border-[#1A1A1A] mx-auto w-48 mb-1.5" />
                <span className="text-xs font-bold text-[#1A1A1A] block">
                  {record.profissionalNome || clinicProfile.professionalName || 'Profissional Responsável'}
                </span>
                <span className="text-[10px] text-gray-400 block">
                  {clinicProfile.professionalTitle || 'Biomédica Esteta'} • La Vie Clinique
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
