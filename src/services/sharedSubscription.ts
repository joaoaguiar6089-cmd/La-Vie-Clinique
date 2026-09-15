/**
 * Compartilhamento e sobrevida das assinaturas do Firestore.
 *
 * O problema que isto resolve: o módulo de anamnese abria uma assinatura de pacientes, fichas
 * preenchidas e perguntas gerais *toda vez que era montado*. Como ele só existe enquanto a aba
 * "Anamnese" está aberta, ir para o catálogo e voltar derrubava as três assinaturas e abria três
 * novas — e cada assinatura nova cobra uma leitura por documento no snapshot inicial. Numa clínica
 * com algumas centenas de fichas, meia dúzia de idas e vindas entre abas consumia milhares de
 * leituras da cota diária sem nenhum dado novo ter aparecido.
 *
 * Aqui cada chave tem no máximo uma assinatura viva, compartilhada por todos os interessados. Quem
 * chega depois recebe na hora o último valor já conhecido, sem custo. E quando o último interessado
 * sai, a assinatura fica viva por mais um tempo (`GRACE_MS`) em vez de morrer na hora: uma ida
 * rápida a outra aba volta a encontrá-la pronta. Manter um `onSnapshot` aberto não cobra leitura —
 * só as mudanças que chegam cobram — então essa sobrevida é praticamente de graça.
 */

type Listener<T> = (data: T) => void;
type ErrorListener = (err: Error) => void;

interface SharedEntry<T> {
  stop: () => void;
  listeners: Set<Listener<T>>;
  errorListeners: Set<ErrorListener>;
  /** Último valor recebido, entregue de imediato a quem assinar depois. */
  lastValue?: T;
  hasValue: boolean;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/** Quanto tempo a assinatura continua viva depois que o último interessado sai. */
const GRACE_MS = 5 * 60 * 1000;

const entries = new Map<string, SharedEntry<any>>();

/**
 * Assina `key`, criando a assinatura real só se ainda não houver uma viva.
 *
 * `start` recebe os callbacks e devolve a função de cancelamento da assinatura real — é a mesma
 * assinatura de qualquer `subscribeToX` deste projeto, então envolver uma existente é direto.
 * Devolve a função para cancelar apenas este interessado.
 */
export function subscribeShared<T>(
  key: string,
  start: (onData: Listener<T>, onError: ErrorListener) => () => void,
  onData: Listener<T>,
  onError?: ErrorListener
): () => void {
  let entry = entries.get(key) as SharedEntry<T> | undefined;

  if (!entry) {
    const novo: SharedEntry<T> = {
      stop: () => {},
      listeners: new Set(),
      errorListeners: new Set(),
      hasValue: false,
    };
    entries.set(key, novo);

    novo.stop = start(
      (data) => {
        novo.lastValue = data;
        novo.hasValue = true;
        novo.listeners.forEach((l) => l(data));
      },
      (err) => {
        novo.errorListeners.forEach((l) => l(err));
      }
    );

    entry = novo;
  }

  // Alguém voltou antes de a sobrevida acabar: cancela o desligamento agendado.
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }

  entry.listeners.add(onData);
  if (onError) entry.errorListeners.add(onError);

  // Quem chega com a assinatura já viva não espera (nem paga) um novo snapshot.
  if (entry.hasValue) {
    onData(entry.lastValue as T);
  }

  let cancelado = false;
  return () => {
    if (cancelado) return;
    cancelado = true;

    const atual = entries.get(key) as SharedEntry<T> | undefined;
    if (!atual) return;

    atual.listeners.delete(onData);
    if (onError) atual.errorListeners.delete(onError);

    if (atual.listeners.size === 0 && !atual.idleTimer) {
      atual.idleTimer = setTimeout(() => {
        // Alguém pode ter voltado entre o agendamento e agora.
        if (atual.listeners.size > 0) {
          atual.idleTimer = undefined;
          return;
        }
        atual.stop();
        entries.delete(key);
      }, GRACE_MS);
    }
  };
}

/**
 * Derruba todas as assinaturas compartilhadas e esquece os valores em cache. Usado no logout, para
 * que a próxima pessoa a entrar não veja dados da anterior.
 */
export function resetSharedSubscriptions(): void {
  entries.forEach((entry) => {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.stop();
  });
  entries.clear();
}
