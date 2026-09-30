import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AppointmentLink, AppointmentLinkResposta } from '../../types';
import { getLinkDoAgendamento, responderAoLink } from '../../services/databaseService';
import { respostaParaGravar } from '../../utils/agendamentoLink';
import { AppointmentCard } from './AppointmentCard';

/**
 * A página que a cliente abre pelo link `?agendamento=<token>`, sem login.
 *
 * Mesma família de `PublicQuoteEntry` e `PublicAnamnesisEntry`: montada antes do painel, então não
 * abre assinatura nenhuma nem carrega o catálogo. Diferente da página do orçamento, esta **grava**
 * — mas uma coisa só, a resposta (`responderAoLink`), e as regras do Firestore garantem que é só
 * isso que o token permite.
 */

/** Uma leitura do Firestore não tem prazo próprio: sem isto, uma conexão ruim vira tela em branco. */
const PRAZO_DE_CARREGAMENTO_MS = 20000;

type Estado = 'carregando' | 'pronto' | 'naoEncontrado' | 'erro';

export const PublicAppointmentEntry: React.FC = () => {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('agendamento') || '');
  const [estado, setEstado] = useState<Estado>(token ? 'carregando' : 'naoEncontrado');
  const [link, setLink] = useState<AppointmentLink | null>(null);
  const [mensagemDeErro, setMensagemDeErro] = useState('');
  // Incrementado por "Tentar novamente" — refaz a leitura sem recarregar a página inteira.
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    let resolvido = false;
    setEstado('carregando');

    const vigia = setTimeout(() => {
      if (cancelado || resolvido) return;
      setMensagemDeErro(
        'A página está demorando mais do que o esperado. Verifique sua conexão e tente de novo.'
      );
      setEstado('erro');
    }, PRAZO_DE_CARREGAMENTO_MS);

    getLinkDoAgendamento(token)
      .then((encontrado) => {
        if (cancelado) return;
        resolvido = true;
        if (!encontrado) {
          setEstado('naoEncontrado');
          return;
        }
        setLink(encontrado);
        setEstado('pronto');
        document.title = `Seu agendamento · ${encontrado.clinica.name}`;
      })
      .catch((e) => {
        if (cancelado) return;
        resolvido = true;
        console.warn('Falha ao abrir o link do agendamento:', e);
        setMensagemDeErro(
          'Não foi possível abrir o agendamento agora. Verifique sua conexão e tente de novo.'
        );
        setEstado('erro');
      })
      .finally(() => clearTimeout(vigia));

    return () => {
      cancelado = true;
      clearTimeout(vigia);
    };
  }, [token, tentativa]);

  const responder = useCallback(
    async (resposta: AppointmentLinkResposta) => {
      await responderAoLink(token, resposta);
      // A tela passa a mostrar a resposta na hora, sem reler o documento.
      setLink((atual) =>
        atual
          ? {
              ...atual,
              resposta: respostaParaGravar(resposta),
              respondidoEm: new Date().toISOString(),
              respostaPendente: true,
            }
          : atual
      );
    },
    [token]
  );

  if (estado === 'carregando') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center" role="status">
        <Loader2 className="w-8 h-8 text-brand animate-spin" aria-label="Carregando seu agendamento" />
      </div>
    );
  }

  if (estado === 'pronto' && link) {
    return <AppointmentCard link={link} onResponder={responder} />;
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="bg-card border border-line rounded-[20px] p-8 max-w-sm text-center shadow-[0_24px_60px_-28px_rgba(26,26,26,0.3)]">
        <AlertCircle className="w-8 h-8 text-brand mx-auto mb-3" />
        {estado === 'erro' ? (
          <>
            <p className="text-body-lg text-ink">{mensagemDeErro}</p>
            <button
              type="button"
              onClick={() => setTentativa((n) => n + 1)}
              className="mt-5 min-h-[48px] px-6 rounded-[14px] bg-brand text-white text-body-lg font-semibold hover:bg-brand-hover transition-colors"
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <>
            <h1 className="font-serif-luxury text-title mb-1">Agendamento não encontrado</h1>
            <p className="text-body-lg text-ink-soft">
              Este link pode estar incorreto ou o agendamento foi cancelado. Confira com a clínica
              o endereço que você recebeu.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
