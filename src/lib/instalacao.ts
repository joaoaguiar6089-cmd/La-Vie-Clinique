/**
 * O site instalado como app no celular ("Adicionar à tela inicial").
 *
 * No Android (Chrome, Edge, Samsung Internet) e no Chrome do computador, o navegador avisa que o
 * site pode ser instalado com o evento `beforeinstallprompt` — e o avisa **uma vez, logo ao
 * carregar**. Por isso este módulo escuta desde a abertura do site (é importado no `main.tsx`) e
 * guarda o pedido, para o botão "Instalar agora" de Ajustes → Instalar no celular usar depois.
 *
 * O iPhone não tem esse evento: lá a instalação é sempre pelo menu Compartilhar do Safari, e a
 * tela mostra o passo a passo.
 */

interface PedidoDeInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pedido: PedidoDeInstalacao | null = null;
let instaladoAgora = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sem o `preventDefault`, alguns navegadores mostram a faixa deles na hora, no meio do login.
    e.preventDefault();
    pedido = e as PedidoDeInstalacao;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    pedido = null;
    instaladoAgora = true;
    avisar();
  });
}

/** O navegador ofereceu instalar (Android e Chrome do computador). */
export const podeInstalarAgora = (): boolean => !!pedido;

/** Abre a janela de instalação do navegador. Devolve se a pessoa aceitou. */
export async function instalarAgora(): Promise<boolean> {
  if (!pedido) return false;
  const atual = pedido;
  await atual.prompt();
  const { outcome } = await atual.userChoice;
  // O pedido só vale uma vez, aceito ou não.
  pedido = null;
  if (outcome === 'accepted') instaladoAgora = true;
  avisar();
  return outcome === 'accepted';
}

/** Para a tela acompanhar a chegada do pedido e a instalação. Devolve o "parar de ouvir". */
export function acompanharInstalacao(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Aberto pelo ícone da tela inicial (app instalado), e não por uma aba do navegador. */
export function abertoComoApp(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return instaladoAgora || iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export type Aparelho = 'iphone' | 'android' | 'computador';

/** Que tipo de aparelho é este — para abrir já o passo a passo certo. */
export function aparelhoAtual(): Aparelho {
  if (typeof navigator === 'undefined') return 'computador';
  const ua = navigator.userAgent || '';
  // O iPad com iPadOS 13+ se apresenta como Mac; o que o denuncia é a tela de toque.
  const ipadComoMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  if (/iPhone|iPad|iPod/.test(ua) || ipadComoMac) return 'iphone';
  if (/Android/i.test(ua)) return 'android';
  return 'computador';
}
