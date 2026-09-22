import { useEffect } from 'react';

/**
 * O botão voltar do celular fecha o painel aberto, em vez de sair do app.
 *
 * O app não tem rotas — a navegação é por estado — então, sem isto, abrir um formulário em tela
 * cheia e apertar voltar no Android descarta tudo e sai da aplicação. É o gesto mais natural do
 * mundo para "fechar isso aqui", e era o mais destrutivo.
 *
 * Como funciona: ao abrir, o painel empilha uma entrada no histórico que não leva a lugar nenhum.
 * O voltar consome essa entrada, o `popstate` chega aqui e o painel fecha. Quando o painel é
 * fechado por outro caminho (o X, o Esc, salvar), a limpeza desempilha a entrada que colocamos —
 * senão o próximo "voltar" gastaria um toque sem fechar nada, e a pessoa apertaria de novo,
 * saindo do app.
 *
 * Empilhar um por painel também resolve o painel dentro do painel: cada um consome o seu.
 */
export function useVoltarFecha(aberto: boolean, fechar: () => void): void {
  useEffect(() => {
    if (!aberto || typeof window === 'undefined') return;

    // Marca única: é por ela que a limpeza confere se a entrada do topo ainda é a nossa antes
    // de desempilhar. Sem a conferência, o StrictMode do desenvolvimento (que monta, desmonta e
    // remonta o efeito) deixaria uma entrada órfã — e um "voltar" que não fecha nada.
    const marca = `painel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.history.pushState({ laviePainel: marca }, '');

    let fechadoPeloVoltar = false;
    const aoVoltar = () => {
      fechadoPeloVoltar = true;
      fechar();
    };
    window.addEventListener('popstate', aoVoltar);

    return () => {
      window.removeEventListener('popstate', aoVoltar);
      if (fechadoPeloVoltar) return;
      if (window.history.state?.laviePainel === marca) window.history.back();
    };
    // `fechar` costuma ser uma função nova a cada render; incluí-la republicaria a entrada no
    // histórico a cada pintura. O que importa é a abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);
}

/**
 * Trava a rolagem da página enquanto um painel está aberto.
 *
 * Sem isto, rolar dentro do painel "vaza" para a página atrás dele assim que a lista do painel
 * chega ao fim — e, no iOS, a página atrás fica deslocada quando o painel fecha.
 */
export function useTravarRolagem(aberto: boolean): void {
  useEffect(() => {
    if (!aberto || typeof document === 'undefined') return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);
}
