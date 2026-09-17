import React, { useMemo, useRef, useState } from 'react';
import { AnamnesisQuestion, AnamnesisTemplate, ClinicProfile, LaserBodyMap, LaserVista } from '../../types';
import { exportElementAsPDF } from '../../utils/exportHelpers';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import {
  isDuplicateIdentQuestion,
  isMedicoQuestion,
  isPatientQuestion,
} from '../../utils/anamnesisQuestions';
import { ConsentTermView } from './ConsentTermView';
import { LaserBodyMapView, AreaExibida } from '../laser/LaserBodyMapView';
import { ehTemplateDeLaser } from '../../utils/templateMatching';
import { Printer, Download, X, Loader2, Stethoscope } from 'lucide-react';

interface BlankAnamnesisSheetProps {
  template: AnamnesisTemplate;
  generalQuestions: AnamnesisQuestion[];
  clinicProfile: ClinicProfile;
  /**
   * Mapa corporal do laser, para a folha sair com os manequins de frente e costas a serem
   * assinalados à caneta. Vem por prop, como a imagem orientativa: o mapa mora no catálogo, e
   * quem monta a tela é quem o busca.
   */
  mapaCorporal?: LaserBodyMap | null;
  onClose: () => void;
}

/** Nada vem marcado numa folha em branco — a marcação é feita à caneta, depois de imprimir. */
const VAZIO: Set<string> = new Set();

type VersaoFoto = 'feminino' | 'masculino' | 'unica';

/** Linhas pontilhadas para escrever à caneta. */
const RuledLines: React.FC<{ count?: number }> = ({ count = 1 }) => (
  <div className="pt-1.5 space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="border-b border-dotted border-gray-400" />
    ))}
  </div>
);

/** Caixa de marcar — redonda para escolha única, quadrada para múltipla escolha. */
const TickBox: React.FC<{ round?: boolean }> = ({ round }) => (
  <span
    className={`inline-block w-3.5 h-3.5 border border-gray-500 bg-white shrink-0 ${
      round ? 'rounded-full' : 'rounded-[2px]'
    }`}
  />
);

/** Campo de identificação: rótulo pequeno acima de uma linha para preencher. */
const IdentField: React.FC<{ label: string; className?: string }> = ({ label, className = '' }) => (
  <div className={className}>
    <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">{label}</span>
    <div className="border-b border-dotted border-gray-400 h-6" />
  </div>
);

/**
 * Área de resposta vazia correspondente ao tipo do campo. O objetivo é que quem estiver com a
 * folha na mão reconheça o mesmo formato da versão digital — as mesmas opções, na mesma ordem —
 * só que com espaço para caneta no lugar do controle.
 */
const BlankAnswer: React.FC<{ question: AnamnesisQuestion }> = ({ question }) => {
  const { tipo_campo, opcoes = [], escalaMax = 10 } = question;

  switch (tipo_campo) {
    case 'texto_longo':
      return <RuledLines count={3} />;

    case 'numero':
      return (
        <div className="pt-2">
          <span className="inline-block w-24 border-b border-dotted border-gray-400 h-5" />
        </div>
      );

    case 'data':
      return (
        <div className="pt-2 flex items-end gap-1.5 text-[10px] text-gray-400 font-mono">
          <span className="inline-block w-9 border-b border-dotted border-gray-400 h-5" /> /
          <span className="inline-block w-9 border-b border-dotted border-gray-400 h-5" /> /
          <span className="inline-block w-14 border-b border-dotted border-gray-400 h-5" />
          <span className="pb-0.5">DD / MM / AAAA</span>
        </div>
      );

    case 'sim_nao':
      return (
        <div className="pt-2 flex items-center gap-6 text-[11px] text-gray-700">
          {['Sim', 'Não'].map((opt) => (
            <span key={opt} className="flex items-center gap-1.5">
              <TickBox round />
              {opt}
            </span>
          ))}
        </div>
      );

    case 'unica_escolha':
    case 'multipla_escolha':
      return (
        <div className="pt-2">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-gray-700">
            {opcoes.map((opcao, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                <TickBox round={tipo_campo === 'unica_escolha'} />
                {opcao}
              </span>
            ))}
          </div>
          {tipo_campo === 'multipla_escolha' && (
            <p className="text-[9px] text-gray-400 italic mt-1.5">Pode marcar mais de uma</p>
          )}
        </div>
      );

    case 'escala':
      return (
        <div className="pt-2 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: escalaMax || 10 }, (_, i) => i + 1).map((num) => (
            <span
              key={num}
              className="w-6 h-6 border border-gray-400 rounded-[3px] flex items-center justify-center text-[10px] text-gray-600 font-mono bg-white"
            >
              {num}
            </span>
          ))}
        </div>
      );

    // 'texto_curto' e qualquer tipo novo que ainda não tenha desenho próprio: uma linha para escrever.
    default:
      return <RuledLines count={1} />;
  }
};

const QuestionBlock: React.FC<{ question: AnamnesisQuestion; index: number }> = ({ question, index }) => (
  <div className="py-2.5 border-b border-gray-100 last:border-0 page-break-inside-avoid">
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-bold text-[#A67C52] shrink-0">{index}.</span>
      <span className="text-[11px] font-semibold text-[#1A1A1A] leading-snug">
        {question.texto}
        {question.obrigatoria && <span className="text-[#A67C52] ml-1">*</span>}
      </span>
    </div>
    {question.ajuda && <p className="text-[10px] text-gray-400 italic mt-0.5 ml-4">{question.ajuda}</p>}
    <div className="ml-4">
      <BlankAnswer question={question} />
    </div>
  </div>
);

const SectionHeading: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="mb-2">
    <div className="flex items-center gap-2 border-b border-[#A67C52]/40 pb-1.5">
      <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
      <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">{title}</h4>
    </div>
    {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
  </div>
);

/**
 * Versão imprimível e em branco da ficha-modelo: as mesmas perguntas da ficha digital, com espaço
 * para responder à caneta. Serve para o atendimento no papel — a equipe imprime, o paciente
 * preenche na clínica e depois alguém transcreve (ou apenas arquiva a folha).
 *
 * Não há `AnamnesisRecord` por trás: a folha é gerada direto da ficha-modelo, então abrir, imprimir
 * ou baixar daqui não cria nem altera registro nenhum.
 */
export const BlankAnamnesisSheet: React.FC<BlankAnamnesisSheetProps> = ({
  template,
  generalQuestions,
  clinicProfile,
  mapaCorporal,
  onClose,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const orientationImage = resolveOrientationImage(template);
  const consentSections = resolveConsentTerm(template);

  /**
   * As duas vistas do mapa, prontas para desenhar — só as que têm manequim **e** área.
   *
   * A numeração é contínua entre elas (`numeroInicial`) para a legenda ser uma lista só: com duas
   * sequências começando em 1, um "3" no papel seria ambíguo entre frente e costas.
   */
  const vistasDoMapa = useMemo(() => {
    const manequins: Record<LaserVista, string | undefined> = {
      frente: mapaCorporal?.manequimFrenteUrl,
      costas: mapaCorporal?.manequimCostasUrl,
    };
    const rotulos: Record<LaserVista, string> = { frente: 'Frente', costas: 'Costas' };

    let proximoNumero = 1;
    return (['frente', 'costas'] as LaserVista[])
      .map((vista) => {
        const areas: AreaExibida[] = (mapaCorporal?.areas || [])
          .filter((a) => a.vista === vista)
          .map((a) => ({
            chave: a.procedureId,
            nomeCurto: a.nomeCurto,
            area: { id: a.procedureId, vista: a.vista, formas: a.formas },
          }));
        const numeroInicial = proximoNumero;
        proximoNumero += areas.length;
        return { vista, rotulo: rotulos[vista], imagem: manequins[vista], areas, numeroInicial };
      })
      .filter((v) => v.imagem && v.areas.length > 0);
  }, [mapaCorporal]);

  const mostrarMapaLaser = ehTemplateDeLaser(template) && vistasDoMapa.length > 0;

  const [incluirMapaCorporal, setIncluirMapaCorporal] = useState(true);
  const [incluirPerguntasProfissional, setIncluirPerguntasProfissional] = useState(true);
  const [incluirImagemOrientativa, setIncluirImagemOrientativa] = useState(true);
  const [incluirTermoConsentimento, setIncluirTermoConsentimento] = useState(true);
  const [incluirFotoAnotacao, setIncluirFotoAnotacao] = useState(true);
  const [versaoFotoAnotacao, setVersaoFotoAnotacao] = useState<VersaoFoto>('feminino');

  /**
   * A foto de referência é a mesma tela que o profissional anota no sistema. Aqui ela sai limpa,
   * para ser marcada à caneta na folha impressa.
   *
   * A ficha em branco não tem paciente, então não há gênero para escolher a versão como acontece
   * na ficha preenchida — quando a ficha-modelo traz as duas, quem imprime decide qual vai.
   */
  const fotosAnotacao: { versao: VersaoFoto; rotulo: string; url: string }[] = [];
  if (template.fotoModeloFemininoUrl) {
    fotosAnotacao.push({ versao: 'feminino', rotulo: 'Feminino', url: template.fotoModeloFemininoUrl });
  }
  if (template.fotoModeloMasculinoUrl) {
    fotosAnotacao.push({ versao: 'masculino', rotulo: 'Masculino', url: template.fotoModeloMasculinoUrl });
  }
  // Fichas antigas, anteriores à separação por gênero, têm uma imagem só.
  if (fotosAnotacao.length === 0 && template.fotoModeloUrl) {
    fotosAnotacao.push({ versao: 'unica', rotulo: 'Referência', url: template.fotoModeloUrl });
  }
  const fotoAnotacao =
    fotosAnotacao.find((f) => f.versao === versaoFotoAnotacao) || fotosAnotacao[0];

  const nonDuplicateGeneral = generalQuestions.filter((q) => !isDuplicateIdentQuestion(q));
  const especificas = template.perguntasEspecificas || [];

  const patientGeneralQuestions = nonDuplicateGeneral.filter(isPatientQuestion);
  const patientSpecificQuestions = especificas.filter(isPatientQuestion);
  const medicoQuestions = [
    ...nonDuplicateGeneral.filter(isMedicoQuestion),
    ...especificas.filter(isMedicoQuestion),
  ];

  const handlePrint = () => window.print();

  const handleSavePdf = async () => {
    if (!contentRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const slug = (template.procedimentoNome || 'ficha').toLowerCase().replace(/\s+/g, '-');
      await exportElementAsPDF(contentRef.current, `ficha-em-branco-${slug}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF da ficha em branco:', err);
      alert('Não foi possível gerar o PDF agora. Tente novamente em instantes.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-white rounded-sm shadow-2xl overflow-hidden max-h-[96vh] flex flex-col">
        {/* Controles de tela (não saem na impressão nem no PDF) */}
        <div className="px-6 py-3.5 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0 print:hidden gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74] shrink-0" />
            <span className="font-serif-luxury text-sm tracking-wide truncate">
              Ficha em Branco — {template.procedimentoNome}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm bg-white/10 border border-white/20 text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/20 transition-all"
              title="Abrir o diálogo de impressão"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#8e6945] transition-all shadow-xs disabled:opacity-60"
            >
              {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGeneratingPdf ? 'Gerando...' : 'Salvar PDF'}
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

        {/* Opções do que entra na folha */}
        <div className="px-6 py-3 bg-[#FAF9F6] border-b border-gray-200 shrink-0 print:hidden flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Incluir na folha</span>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-[#1A1A1A]">
            <input
              type="checkbox"
              checked={incluirPerguntasProfissional}
              onChange={(e) => setIncluirPerguntasProfissional(e.target.checked)}
              disabled={medicoQuestions.length === 0}
              className="accent-[#A67C52] w-4 h-4 rounded-xs disabled:opacity-40"
            />
            <span className={medicoQuestions.length === 0 ? 'text-gray-400' : ''}>
              Perguntas do profissional
              <span className="text-gray-400 ml-1">
                ({medicoQuestions.length === 0 ? 'nenhuma cadastrada' : medicoQuestions.length})
              </span>
            </span>
          </label>

          {mostrarMapaLaser && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#1A1A1A]">
              <input
                type="checkbox"
                checked={incluirMapaCorporal}
                onChange={(e) => setIncluirMapaCorporal(e.target.checked)}
                className="accent-[#A67C52] w-4 h-4 rounded-xs"
              />
              Mapa corporal (áreas do laser)
            </label>
          )}

          {orientationImage && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#1A1A1A]">
              <input
                type="checkbox"
                checked={incluirImagemOrientativa}
                onChange={(e) => setIncluirImagemOrientativa(e.target.checked)}
                className="accent-[#A67C52] w-4 h-4 rounded-xs"
              />
              Imagem orientativa
            </label>
          )}

          {fotoAnotacao && (
            <div className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={incluirFotoAnotacao}
                  onChange={(e) => setIncluirFotoAnotacao(e.target.checked)}
                  className="accent-[#A67C52] w-4 h-4 rounded-xs"
                />
                Imagem para anotação
              </label>

              {/* Só faz sentido escolher quando a ficha-modelo tem as duas versões. */}
              {incluirFotoAnotacao && fotosAnotacao.length > 1 && (
                <div className="flex items-center gap-1">
                  {fotosAnotacao.map((f) => (
                    <button
                      key={f.versao}
                      type="button"
                      onClick={() => setVersaoFotoAnotacao(f.versao)}
                      className={`px-2 py-0.5 rounded-xs text-[11px] font-semibold border transition-colors ${
                        fotoAnotacao.versao === f.versao
                          ? 'bg-[#A67C52] text-white border-[#A67C52]'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-[#A67C52]'
                      }`}
                    >
                      {f.rotulo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {consentSections && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#1A1A1A]">
              <input
                type="checkbox"
                checked={incluirTermoConsentimento}
                onChange={(e) => setIncluirTermoConsentimento(e.target.checked)}
                className="accent-[#A67C52] w-4 h-4 rounded-xs"
              />
              Termo de consentimento
            </label>
          )}
        </div>

        {/* DOCUMENTO */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-6 sm:p-10 text-[#1A1A1A] font-sans bg-white print:p-0 print:overflow-visible"
        >
          {/* Cabeçalho da clínica */}
          <div className="border-b-2 border-[#1A1A1A] pb-5 mb-6 flex items-start justify-between gap-4">
            <div>
              {/* O documento se apresenta pelo que ele é. Antes o topo trazia só o nome da
                  clínica, e uma folha impressa não dizia de qual procedimento era sem que
                  alguém lesse o corpo dela. O selo "Prontuário & Anamnese" saiu porque o
                  título agora diz a mesma coisa.

                  "La Vie Clinique" é a marca, e vai literal: o nome cadastrado no perfil é a
                  razão social por extenso, longa demais para um título — ela continua logo
                  abaixo, que é onde identifica a clínica. */}
              <h2 className="font-serif-luxury text-2xl font-bold tracking-tight text-[#1A1A1A] leading-tight">
                Anamnese - {template.procedimentoNome} - La Vie Clinique
              </h2>
              <p className="text-xs font-semibold text-[#1A1A1A] mt-1.5">
                {clinicProfile.name || 'La Vie Clinique'}
              </p>
              <p className="text-xs text-gray-500 italic mt-0.5">
                {clinicProfile.tagline || 'Excelência Médica e Estética Avançada'}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {clinicProfile.address} • {clinicProfile.cityState} • Tel: {clinicProfile.phone}
              </p>
            </div>

            <div className="text-right shrink-0">
              <span className="inline-block px-3 py-1 bg-gray-100 border border-gray-200 text-[10px] font-mono font-bold uppercase tracking-wider text-[#1A1A1A] rounded-xs">
                Ficha para preenchimento
              </span>
              {/* Rótulo abaixo da linha, como nos campos de assinatura: primeiro o espaço para
                  escrever, depois o que se escreve ali. A folga em cima separa do selo. */}
              <div className="mt-7 w-36 ml-auto">
                <div className="border-b border-dotted border-gray-400 h-6" />
                <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider mt-1">
                  Data do atendimento
                </span>
              </div>
            </div>
          </div>

          {/* Procedimento */}
          <div className="mb-5">
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Procedimento</span>
            <h3 className="font-serif-luxury text-lg font-bold text-[#A67C52] leading-tight">
              {template.procedimentoNome}
            </h3>
            {template.descricao && <p className="text-[11px] text-gray-500 mt-0.5">{template.descricao}</p>}
          </div>

          {/* Identificação do paciente — em branco */}
          <div className="bg-[#FAF9F6] border border-gray-200 rounded-sm p-4 mb-6 page-break-inside-avoid">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-5 gap-y-3">
              <IdentField label="Paciente" className="sm:col-span-4" />
              <IdentField label="Data de nascimento" className="sm:col-span-2" />
              <IdentField label="Contato / WhatsApp" className="sm:col-span-2" />
              <IdentField label="CPF" className="sm:col-span-2" />
              <IdentField label="Preferência musical" className="sm:col-span-2" />

              <div className="sm:col-span-3">
                <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Gênero</span>
                <div className="flex items-center gap-6 text-[11px] text-gray-700 h-6">
                  <span className="flex items-center gap-1.5">
                    <TickBox round /> Feminino
                  </span>
                  <span className="flex items-center gap-1.5">
                    <TickBox round /> Masculino
                  </span>
                </div>
              </div>
              <IdentField label="Profissional responsável" className="sm:col-span-3" />
            </div>
          </div>

          {/* Imagem orientativa */}
          {orientationImage && incluirImagemOrientativa && (
            <div className="mb-6 page-break-inside-avoid">
              <SectionHeading title={orientationImage.titulo || 'Imagem Orientativa'} />
              {orientationImage.descricao && (
                <p className="text-[11px] text-gray-600 leading-relaxed mb-2.5">{orientationImage.descricao}</p>
              )}
              <div className="border border-gray-200 rounded-sm bg-[#FAF9F6] p-3 flex justify-center">
                <img
                  src={orientationImage.url}
                  alt={orientationImage.titulo || 'Imagem orientativa do procedimento'}
                  className="block w-full h-auto object-contain rounded-xs"
                  style={{ maxHeight: '1040px' }}
                />
              </div>
            </div>
          )}

          {/*
            Mapa corporal do laser — frente e costas, com todas as áreas e **nenhuma marcada**.
            É o ponto da folha: quem imprime assinala à caneta.

            Vai numerado e com legenda ao lado porque no papel não há botão nem toque: sem o
            número, quem olha vê uma mancha hachurada e não tem como saber se é linha alba ou
            tórax. A legenda traz quadradinho para marcar, então dá para assinalar no desenho, na
            lista, ou nos dois.
          */}
          {mostrarMapaLaser && incluirMapaCorporal && (
            <div className="mb-6 page-break-inside-avoid">
              <SectionHeading title="Áreas de aplicação — assinale as regiões" />

              <div className="border border-gray-200 rounded-sm bg-[#FAF9F6] p-3">
                <div className="flex flex-wrap items-start justify-center gap-6">
                  {vistasDoMapa.map(({ vista, rotulo, imagem, areas, numeroInicial }) => (
                    <div key={vista} className="text-center">
                      <LaserBodyMapView
                        imagemUrl={imagem}
                        areas={areas}
                        selecionadas={VAZIO}
                        alturaManequim={330}
                        ocultarBotoes
                        numerar
                        numeroInicial={numeroInicial}
                      />
                      <span className="block text-[9px] uppercase tracking-wider text-gray-500 mt-1 font-bold">
                        {rotulo}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-1.5">
                  {vistasDoMapa.flatMap(({ areas, numeroInicial }) =>
                    areas.map((a, i) => (
                      <span
                        key={a.chave}
                        className="flex items-center gap-1.5 text-[10px] text-gray-700 leading-tight"
                      >
                        <TickBox />
                        <span className="font-bold text-[#C0392B] tabular-nums">
                          {numeroInicial + i}.
                        </span>
                        {a.nomeCurto}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Perguntas gerais do paciente */}
          {patientGeneralQuestions.length > 0 && (
            <div className="mb-6">
              <SectionHeading title="Saúde & Histórico Geral" hint="Respondido pelo(a) paciente" />
              {patientGeneralQuestions.map((q, idx) => (
                <QuestionBlock key={q.id} question={q} index={idx + 1} />
              ))}
            </div>
          )}

          {/* Termo de Consentimento e Responsabilidade — logo abaixo das perguntas gerais */}
          {consentSections && incluirTermoConsentimento && (
            <ConsentTermView sections={consentSections} variant="documento" className="mb-6" />
          )}

          {/* Perguntas específicas do procedimento */}
          {patientSpecificQuestions.length > 0 && (
            <div className="mb-6">
              <SectionHeading
                title={`Avaliação Específica — ${template.procedimentoNome}`}
                hint="Respondido pelo(a) paciente"
              />
              {patientSpecificQuestions.map((q, idx) => (
                <QuestionBlock key={q.id} question={q} index={idx + 1} />
              ))}
            </div>
          )}

          {/* Uso exclusivo do profissional */}
          {incluirPerguntasProfissional && medicoQuestions.length > 0 && (
            <div className="mb-6 p-3.5 rounded-sm border border-indigo-200 bg-indigo-50/30">
              <div className="flex items-center gap-2 border-b border-indigo-300 pb-1.5 mb-1">
                <Stethoscope className="w-3.5 h-3.5 text-indigo-700" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-indigo-950">
                  Uso Exclusivo do Profissional
                </h4>
              </div>
              <p className="text-[10px] text-indigo-900/60 mb-1">
                Preenchido pela equipe clínica durante o atendimento.
              </p>
              {medicoQuestions.map((q, idx) => (
                <QuestionBlock key={q.id} question={q} index={idx + 1} />
              ))}
            </div>
          )}

          {/* Foto de referência, limpa, para marcar à caneta na folha impressa */}
          {fotoAnotacao && incluirFotoAnotacao && (
            <div className="mb-6 page-break-inside-avoid">
              <SectionHeading
                title="Imagem para Anotação"
                hint="Marque à caneta durante o atendimento"
              />
              <div className="border border-gray-200 rounded-sm bg-white p-3 flex justify-center">
                <img
                  src={fotoAnotacao.url}
                  alt={`Mapa de referência para anotação — ${template.procedimentoNome}`}
                  className="block w-full h-auto object-contain rounded-xs"
                  style={{ maxHeight: '620px' }}
                />
              </div>
            </div>
          )}

          {/* Espaço livre para anotações */}
          <div className="mb-6 page-break-inside-avoid">
            <SectionHeading title="Observações Finais & Orientações" />
            <RuledLines count={4} />
          </div>

          {/* Consentimento e assinatura */}
          <div className="mt-8 pt-4 border-t-2 border-gray-300 page-break-inside-avoid">
            <p className="text-[10px] text-gray-500 leading-relaxed text-justify">
              Declaro que todas as informações prestadas nesta ficha de anamnese são verdadeiras, não tendo omitido
              qualquer fato relevante sobre meu estado de saúde, uso de medicações ou procedimentos prévios. Fui
              devidamente orientado(a) acerca dos cuidados pré e pós-procedimento e autorizo a realização do
              protocolo estético indicado.
            </p>

            <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-10">
              <div className="text-center">
                <div className="border-t border-[#1A1A1A] mb-1.5" />
                <span className="text-[10px] text-gray-500 block">Assinatura do(a) Paciente</span>
              </div>
              <div className="text-center">
                <div className="border-t border-[#1A1A1A] mb-1.5" />
                <span className="text-[10px] text-gray-500 block">
                  Profissional Responsável — {clinicProfile.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
