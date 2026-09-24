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
/**
 * A entrada do histórico que um painel acabou de largar e que ainda não foi desempilhada.
 *
 * O `history.back()` da limpeza é **assíncrono**: o `popstate` que ele provoca chega depois, e
 * chega para quem estiver escutando naquele momento. Se outro painel abriu nesse intervalo, ele
 * recebe o evento como se a pessoa tivesse apertado voltar e fecha na mesma hora — o painel "não
 * abre". Era o que acontecia com a ficha de avaliação, montada já aberta: o StrictMode monta,
 * desmonta e remonta o efeito, e a remontagem levava o `popstate` da desmontagem.
 *
 * Por isso a limpeza não desempilha na hora. Ela agenda, e quem abrir antes de o agendamento
 * rodar **adota** a entrada largada em vez de empilhar outra: o histórico fica com a mesma
 * profundidade e nenhum `popstate` fantasma é disparado.
 */
let largada: { marca: string; timer: ReturnType<typeof setTimeout> } | null = null;

export function useVoltarFecha(aberto: boolean, fechar: () => void): void {
  useEffect(() => {
    if (!aberto || typeof window === 'undefined') return;

    // Marca única: é por ela que a limpeza confere se a entrada do topo ainda é a nossa antes
    // de desempilhar.
    let marca: string;
    if (largada && window.history.state?.laviePainel === largada.marca) {
      clearTimeout(largada.timer);
      marca = largada.marca;
      largada = null;
    } else {
      marca = `painel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      window.history.pushState({ laviePainel: marca }, '');
    }

    let fechadoPeloVoltar = false;
    const aoVoltar = () => {
      fechadoPeloVoltar = true;
      fechar();
    };
    window.addEventListener('popstate', aoVoltar);

    return () => {
      window.removeEventListener('popstate', aoVoltar);
      if (fechadoPeloVoltar) return;
      if (window.history.state?.laviePainel !== marca) return;
      const timer = setTimeout(() => {
        if (largada?.marca !== marca) return;
        largada = null;
        if (window.history.state?.laviePainel === marca) window.history.back();
      }, 0);
      largada = { marca, timer };
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
