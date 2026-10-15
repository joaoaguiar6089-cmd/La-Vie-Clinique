import {
  FieldPath,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  Attendance,
  ContaGoogleAgenda,
  GoogleAgendaConfig,
  MarcaGoogleAgenda,
  Professional,
} from '../types';
import { EventoGoogle, idDoEventoGoogle } from '../utils/googleAgenda';
import { ENDERECO_DO_SITE } from '../utils/publicLinks';

/**
 * O lado do painel da ligação com o Google Agenda: as contas conectadas (no banco), a janela de
 * autorização e o envio dos eventos ao servidor do site. As regras de o que enviar estão em
 * `utils/googleAgenda.ts`; o porquê do servidor, em `server/googleAgenda.ts`.
 */

const CONFIG_REF = () => doc(db, 'clinic_settings', 'google_agenda');
const CANAL = 'lavie-google-agenda';

/**
 * As rotas moram no site publicado. Chamadas sempre lá, inclusive quando o painel está aberto
 * noutro endereço (dentro do AI Studio): o servidor de desenvolvimento não tem essas rotas.
 */
const API = `${ENDERECO_DO_SITE}/api/google-agenda`;

export function assinarGoogleAgenda(
  onUpdate: (config: GoogleAgendaConfig) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    CONFIG_REF(),
    (snap) => onUpdate((snap.data() as GoogleAgendaConfig) || {}),
    (err) => {
      console.warn('Google Agenda: não foi possível ler as contas conectadas:', err);
      onError?.(err);
    }
  );
}

export type SituacaoDaIntegracao = 'configurada' | 'nao-configurada' | 'indisponivel';

/** O servidor do site tem as chaves do Google? */
export async function situacaoDaIntegracao(): Promise<SituacaoDaIntegracao> {
  try {
    const resposta = await fetch(`${API}/status`);
    const corpo = await resposta.json();
    return corpo?.configurado ? 'configurada' : 'nao-configurada';
  } catch {
    return 'indisponivel';
  }
}

/** A janela de autorização só devolve o resultado para uma aba aberta no site publicado. */
export const podeConectarDaqui = (): boolean =>
  typeof window !== 'undefined' && window.location.origin === new URL(ENDERECO_DO_SITE).origin;

interface ResultadoDaJanela {
  estado: string;
  ok: boolean;
  erro?: string;
  conta?: ContaGoogleAgenda;
}

const ESPERA_MAXIMA_MS = 10 * 60 * 1000;

/**
 * Abre a janela do Google para a profissional autorizar, espera a resposta e grava a conta.
 *
 * Tem de ser chamada direto do clique — senão o navegador bloqueia a janela. Reconectando, o
 * calendário que ela já tem é reaproveitado.
 */
export async function conectarGoogleAgenda(
  profissional: Pick<Professional, 'id' | 'email'>,
  contaAnterior?: ContaGoogleAgenda
): Promise<ContaGoogleAgenda> {
  const estado = crypto.randomUUID();
  const parametros = new URLSearchParams({ estado });
  if (profissional.email) parametros.set('email', profissional.email);
  if (contaAnterior?.calendarioId) parametros.set('calendario', contaAnterior.calendarioId);

  const janela = window.open(
    `${API}/conectar?${parametros}`,
    'google-agenda',
    'width=520,height=700'
  );
  if (!janela) {
    throw new Error('O navegador bloqueou a janela do Google. Permita janelas deste site e tente de novo.');
  }

  const resultado = await new Promise<ResultadoDaJanela>((resolve, reject) => {
    const chave = `${CANAL}:${estado}`;
    let canal: BroadcastChannel | null = null;
    const terminar = (r: ResultadoDaJanela | null) => {
      clearTimeout(prazo);
      canal?.close();
      window.removeEventListener('storage', aoMudarStorage);
      try {
        localStorage.removeItem(chave);
      } catch {
        // Sem storage, nada ficou guardado.
      }
      if (r) resolve(r);
      else reject(new Error('A conexão com o Google não foi concluída a tempo. Tente de novo.'));
    };
    const receber = (dado: unknown) => {
      const r = dado as ResultadoDaJanela | null;
      if (r && r.estado === estado) terminar(r);
    };
    const aoMudarStorage = (e: StorageEvent) => {
      if (e.key === chave && e.newValue) {
        try {
          receber(JSON.parse(e.newValue));
        } catch {
          // Valor estranho: continua esperando o canal.
        }
      }
    };
    const prazo = setTimeout(() => terminar(null), ESPERA_MAXIMA_MS);
    try {
      canal = new BroadcastChannel(CANAL);
      canal.onmessage = (e) => receber(e.data);
    } catch {
      // Navegador sem BroadcastChannel: fica só o storage.
    }
    window.addEventListener('storage', aoMudarStorage);
  });

  if (!resultado.ok || !resultado.conta) {
    throw new Error(`Não foi possível conectar: ${resultado.erro || 'erro desconhecido'}.`);
  }

  // `mergeFields` troca a conta inteira — um `erro` antigo não sobrevive à reconexão — e cria o
  // documento se ele ainda não existir.
  const campo = new FieldPath('contas', profissional.id);
  await setDoc(CONFIG_REF(), { contas: { [profissional.id]: resultado.conta } }, { mergeFields: [campo] });
  return resultado.conta;
}

/** Tira a conta do painel e, se der, revoga a autorização no Google. O calendário fica lá. */
export async function desconectarGoogleAgenda(profissionalId: string, conta: ContaGoogleAgenda): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      await fetch(`${API}/desconectar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenCifrado: conta.tokenCifrado }),
      });
    }
  } catch (e) {
    console.warn('Google Agenda: não foi possível revogar a autorização:', e);
  }
  await updateDoc(CONFIG_REF(), new FieldPath('contas', profissionalId), deleteField());
}

/**
 * Marca a conta como recusada pelo Google: a sincronização dela para até reconectar.
 *
 * Só marca a conexão que falhou (`conectadoEm`): se a profissional reconectou nesse meio-tempo,
 * a conta nova não herda o erro da velha.
 */
export async function marcarContaComErro(
  profissionalId: string,
  conectadoEm: string,
  motivo: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(CONFIG_REF());
    const conta = (snap.data() as GoogleAgendaConfig | undefined)?.contas?.[profissionalId];
    if (!conta || conta.conectadoEm !== conectadoEm) return;
    tx.update(CONFIG_REF(), new FieldPath('contas', profissionalId, 'erro'), motivo);
  });
}

export interface OperacaoParaEnviar {
  acao: 'salvar' | 'apagar';
  eventoId: string;
  evento?: EventoGoogle;
}

export type RespostaDoEnvio =
  | { tipo: 'ok'; resultados: { eventoId: string; ok: boolean }[] }
  | { tipo: 'conta-invalida'; motivo: string }
  | { tipo: 'indisponivel' };

/** Envia um lote de operações de uma conta. Nunca lança. */
export async function enviarAoGoogle(
  conta: ContaGoogleAgenda,
  operacoes: OperacaoParaEnviar[]
): Promise<RespostaDoEnvio> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { tipo: 'indisponivel' };
    const resposta = await fetch(`${API}/sincronizar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenCifrado: conta.tokenCifrado,
        calendarioId: conta.calendarioId,
        operacoes,
      }),
    });
    const corpo = await resposta.json().catch(() => null);
    if (resposta.status === 409 && corpo?.erro === 'conta-invalida') {
      return { tipo: 'conta-invalida', motivo: String(corpo.motivo || 'o Google recusou a autorização') };
    }
    if (!resposta.ok || !Array.isArray(corpo?.resultados)) return { tipo: 'indisponivel' };
    return { tipo: 'ok', resultados: corpo.resultados };
  } catch {
    return { tipo: 'indisponivel' };
  }
}

/** Grava (ou apaga) a marca do que o Google já tem deste atendimento. */
export async function gravarMarcaGoogleAgenda(
  atendimentoId: string,
  marca: MarcaGoogleAgenda | null
): Promise<void> {
  await updateDoc(doc(db, 'attendances', atendimentoId), {
    googleAgenda: marca ?? deleteField(),
  });
}

/**
 * Tira do Google o evento de um atendimento que acabou de ser excluído. Fica fora da comparação
 * de `utils/googleAgenda.ts` porque, excluído, o atendimento some da lista — e a marca com ele.
 * Nunca lança: a exclusão já aconteceu.
 */
export async function removerDoGoogleAgenda(atendimento: Attendance): Promise<void> {
  const marca = atendimento.googleAgenda;
  if (!marca) return;
  try {
    const config = (await getDoc(CONFIG_REF())).data() as GoogleAgendaConfig | undefined;
    const conta = config?.contas?.[marca.profissionalId];
    if (!conta || conta.erro || conta.calendarioId !== marca.calendarioId) return;
    const resposta = await enviarAoGoogle(conta, [
      { acao: 'apagar', eventoId: idDoEventoGoogle(atendimento.id) },
    ]);
    if (resposta.tipo !== 'ok' || !resposta.resultados[0]?.ok) {
      console.warn('Google Agenda: o evento do atendimento excluído ficou no Google.', resposta);
    }
  } catch (e) {
    console.warn('Google Agenda: não foi possível tirar o atendimento excluído do Google:', e);
  }
}
