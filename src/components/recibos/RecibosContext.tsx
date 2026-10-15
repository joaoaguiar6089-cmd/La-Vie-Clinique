import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ClinicProfile, Patient, Procedure, Quote, Recibo } from '../../types';
import { excluirRecibo, subscribeToRecibos } from '../../services/databaseService';
import { apagarComprovante } from '../../services/comprovantes';
import { recibosDoOrcamento } from '../../utils/recibos';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { ReciboFormPanel } from './ReciboFormPanel';
import { ReciboPreviewModal } from './ReciboPreviewModal';

interface RecibosContextValue {
  /** Todos os recibos, dos pagamentos mais recentes para os mais antigos. */
  recibos: Recibo[];
  carregando: boolean;
  /** A assinatura falhou — quase sempre as regras novas ainda não publicadas. */
  erro: string | null;
  /** Os recibos de um orçamento, do mais antigo para o mais novo. */
  doOrcamento: (quoteId: string) => Recibo[];
  /** Recibo avulso — o pagamento que chegou sem orçamento. */
  abrirNovo: (paciente?: Patient | null) => void;
  /** Recibo de um orçamento: a cliente, os procedimentos e o valor já vêm dele. */
  abrirDoOrcamento: (quote: Quote) => void;
  abrirEdicao: (recibo: Recibo) => void;
  abrirPrevia: (recibo: Recibo) => void;
  pedirExclusao: (recibo: Recibo) => void;
  /** Apaga, sem perguntar, os recibos de um orçamento — quem chama já perguntou (desfazer pagamento). */
  excluirDoOrcamento: (quoteId: string) => Promise<void>;
}

const RecibosContext = createContext<RecibosContextValue | null>(null);

/**
 * Os recibos e o que se faz com eles, para o painel inteiro.
 *
 * O recibo aparece em quatro lugares — o cartão do orçamento, a aba "Recibos" da tela de
 * Orçamentos, a aba "Pagamentos" da paciente e o desfecho do orçamento na linha do tempo — e os
 * quatro abrem o mesmo formulário e a mesma prévia. Um contexto evita levar a lista e os modais
 * por props através de cada tela no meio do caminho, e garante uma assinatura só da coleção.
 *
 * Ausente fora do painel autenticado: a página pública do orçamento não lê recibos (a coleção é
 * só da equipe), e `useRecibos()` devolve `null` lá.
 */
export const RecibosProvider: React.FC<{
  clinic: ClinicProfile;
  pacientes: Patient[];
  /** O catálogo, para a lista de procedimentos do formulário. */
  procedimentos: Procedure[];
  children: React.ReactNode;
}> = ({ clinic, pacientes, procedimentos, children }) => {
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{
    recibo?: Recibo;
    orcamento?: Quote;
    paciente?: Patient | null;
  } | null>(null);
  const [previaId, setPreviaId] = useState<string | null>(null);
  /** O recibo recém-salvo, até a assinatura trazê-lo — a prévia abre na hora, sem esperar. */
  const [recemSalvo, setRecemSalvo] = useState<Recibo | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  useEffect(
    () =>
      subscribeToRecibos(
        (data) => {
          setRecibos(data);
          setCarregando(false);
          setErro(null);
        },
        (e) => {
          setCarregando(false);
          const semPermissao = (e as { code?: string }).code === 'permission-denied';
          setErro(
            semPermissao
              ? 'As notas de recibo ainda não podem ser lidas: publique as regras novas do Firebase (firestore.rules e storage.rules).'
              : `Não foi possível carregar os recibos: ${e.message}`
          );
        }
      ),
    []
  );

  const doOrcamento = useCallback((quoteId: string) => recibosDoOrcamento(recibos, quoteId), [recibos]);

  const excluirDoOrcamento = useCallback(
    async (quoteId: string) => {
      const doQuote = recibosDoOrcamento(recibos, quoteId);
      await Promise.all(doQuote.map((r) => excluirRecibo(r.id)));
      doQuote.forEach((r) => void apagarComprovante(r.comprovante));
    },
    [recibos]
  );

  const pedirExclusao = useCallback((recibo: Recibo) => {
    setConfirmacao({
      titulo: `Excluir o recibo Nº ${recibo.numero}?`,
      mensagem:
        `Recibo de ${recibo.pacienteNome}.\n\nO documento${recibo.comprovante ? ' e o comprovante anexo são apagados' : ' é apagado'} ` +
        'e o número não volta a ser usado. Se a cliente já recebeu o PDF, ele continua com ela.',
      textoConfirmar: 'Excluir recibo',
      onConfirmar: async () => {
        try {
          await excluirRecibo(recibo.id);
          void apagarComprovante(recibo.comprovante);
          setPreviaId((atual) => (atual === recibo.id ? null : atual));
        } catch (e) {
          setConfirmacao(aviso('Não foi possível excluir o recibo', (e as Error).message, 'perigo'));
        }
      },
    });
  }, []);

  const valor = useMemo<RecibosContextValue>(
    () => ({
      recibos,
      carregando,
      erro,
      doOrcamento,
      abrirNovo: (paciente) => setFormulario({ paciente: paciente || null }),
      abrirDoOrcamento: (orcamento) => setFormulario({ orcamento }),
      abrirEdicao: (recibo) => setFormulario({ recibo }),
      abrirPrevia: (recibo) => {
        setRecemSalvo(null);
        setPreviaId(recibo.id);
      },
      pedirExclusao,
      excluirDoOrcamento,
    }),
    [recibos, carregando, erro, doOrcamento, pedirExclusao, excluirDoOrcamento]
  );

  // A prévia mostra a versão da lista — editar com ela aberta já reflete na hora.
  const previa = previaId
    ? recibos.find((r) => r.id === previaId) || (recemSalvo?.id === previaId ? recemSalvo : null)
    : null;
  const contatoDaPrevia = previa?.pacienteId
    ? pacientes.find((p) => p.id === previa.pacienteId)?.contato
    : undefined;

  return (
    <RecibosContext.Provider value={valor}>
      {children}

      <ReciboFormPanel
        aberto={!!formulario}
        onFechar={() => setFormulario(null)}
        recibo={formulario?.recibo || null}
        orcamento={formulario?.orcamento || null}
        pacienteInicial={formulario?.paciente || null}
        pacientes={pacientes}
        procedimentos={procedimentos}
        clinic={clinic}
        onSalvo={(salvo) => {
          // Emitido, o passo seguinte é mandar para a cliente: a prévia abre com o "Enviar".
          setRecemSalvo(salvo);
          setPreviaId(salvo.id);
        }}
      />

      <ReciboPreviewModal
        recibo={previa}
        contato={contatoDaPrevia}
        onClose={() => setPreviaId(null)}
        onEditar={(recibo) => {
          setPreviaId(null);
          setFormulario({ recibo });
        }}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </RecibosContext.Provider>
  );
};

/** Os recibos e as ações deles; `null` fora do painel autenticado. */
export const useRecibos = (): RecibosContextValue | null => useContext(RecibosContext);
