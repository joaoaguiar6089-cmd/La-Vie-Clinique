import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Layers } from 'lucide-react';
import {
  AnamnesisQuestion,
  Attendance,
  ClinicProfile,
  EvaluationTemplate,
  Patient,
  Procedure,
  Professional,
} from '../../types';
import {
  deleteEvaluationGeneralQuestion,
  deleteEvaluationTemplate,
  saveAllEvaluationGeneralQuestions,
  saveEvaluationGeneralQuestion,
  saveEvaluationTemplate,
} from '../../services/databaseService';
import { GeneralQuestionsManager } from '../anamnesis/GeneralQuestionsManager';
import { EvaluationQueueView } from './EvaluationQueueView';
import { EvaluationTemplatesManager } from './EvaluationTemplatesManager';
import { EvaluationFillModal } from './EvaluationFillModal';
import { PrintableEvaluationSheet } from './PrintableEvaluationSheet';
import { ModuleTabs } from '../common/ModuleTabs';
import { filaDePendentes } from '../../utils/evaluations';

interface EvaluationsModuleProps {
  clinicProfile: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Fichas-modelo assinadas no App, como as de anamnese — o preenchimento também precisa delas. */
  fichas: EvaluationTemplate[];
  atendimentos: Attendance[];
  pacientes: Patient[];
  professionals: Professional[];
  /** Perguntas gerais de avaliação, assinadas no App para o contador e o modal as verem. */
  gerais: AnamnesisQuestion[];
}

type EvaluationTab = 'fila' | 'fichas';

/**
 * A tela de Fichas de Avaliação.
 *
 * São duas abas porque configuração e rotina têm ritmos diferentes: a ficha-modelo se mexe uma vez
 * por trimestre, enquanto a fila é trabalho do dia. Uma tela no menu só com o gerenciador seria um
 * item morto — é a fila que justifica ela estar ali e que alimenta o contador.
 */
export const EvaluationsModule: React.FC<EvaluationsModuleProps> = ({
  clinicProfile,
  catalogProcedures,
  fichas,
  atendimentos,
  pacientes,
  professionals,
  gerais,
}) => {
  const [abaAtiva, setAbaAtiva] = useState<EvaluationTab>('fila');
  const [avaliando, setAvaliando] = useState<Attendance | null>(null);
  const [imprimindo, setImprimindo] = useState<EvaluationTemplate | null>(null);
  const [criarFichaPara, setCriarFichaPara] = useState<{
    procedureId?: string;
    procedimentoNome: string;
  } | null>(null);

  const pendentes = useMemo(() => filaDePendentes(atendimentos), [atendimentos]);

  const pacienteDoAtendimento = useMemo(
    () => (avaliando ? pacientes.find((p) => p.id === avaliando.pacienteId) : undefined),
    [avaliando, pacientes]
  );

  return (
    <div className="space-y-6">
      {/* Mesma barra da anamnese, literalmente o mesmo componente — ver `ModuleTabs`. */}
      <ModuleTabs
        tabs={[
          {
            id: 'fila' as const,
            icon: ClipboardCheck,
            label: 'Avaliações',
            count: pendentes.length,
          },
          { id: 'fichas' as const, icon: Layers, label: 'Fichas-modelo', count: fichas.length },
        ]}
        active={abaAtiva}
        onSelect={setAbaAtiva}
      />

      {abaAtiva === 'fila' ? (
        <EvaluationQueueView atendimentos={atendimentos} onAvaliar={setAvaliando} />
      ) : (
        <div className="space-y-8">
          {/*
            Perguntas gerais acima dos modelos, como na anamnese: são herdadas por toda ficha de
            avaliação, então quem vem ajustar um modelo vê primeiro o que já entra nele sem
            ninguém pedir.
          */}
          <GeneralQuestionsManager
            questions={gerais}
            onSaveQuestion={saveEvaluationGeneralQuestion}
            onSaveAllQuestions={saveAllEvaluationGeneralQuestions}
            onDeleteQuestion={deleteEvaluationGeneralQuestion}
            titulo="Perguntas Gerais de Avaliação"
            selo="Toda Avaliação"
            subtitulo="Entram em toda ficha de avaliação, venha de onde vier o procedimento — inclusive nos procedimentos que ainda não têm ficha-modelo própria."
            // Sem padrões: a clínica começa sem nenhuma pergunta geral de avaliação, e um botão
            // "restaurar" que substitui tudo por uma lista vazia seria só um jeito silencioso de
            // apagar o trabalho da equipe.
            defaults={undefined}
            idPrefixo="avg"
          />

          <EvaluationTemplatesManager
            fichas={fichas}
            catalogo={catalogProcedures}
            onSalvar={saveEvaluationTemplate}
            onExcluir={deleteEvaluationTemplate}
            onImprimirEmBranco={setImprimindo}
            criarPara={criarFichaPara}
            onCriarParaConsumido={() => setCriarFichaPara(null)}
          />
        </div>
      )}

      {avaliando && (
        <EvaluationFillModal
          isOpen
          onClose={() => setAvaliando(null)}
          atendimento={avaliando}
          paciente={pacienteDoAtendimento}
          fichas={fichas}
          gerais={gerais}
          catalogo={catalogProcedures}
          professionals={professionals}
          clinicProfile={clinicProfile}
          onCadastrarFicha={(alvo) => {
            setAvaliando(null);
            setCriarFichaPara(alvo);
            setAbaAtiva('fichas');
          }}
        />
      )}

      {imprimindo && (
        <PrintableEvaluationSheet
          ficha={imprimindo}
          gerais={gerais}
          clinicProfile={clinicProfile}
          onClose={() => setImprimindo(null)}
        />
      )}
    </div>
  );
};
