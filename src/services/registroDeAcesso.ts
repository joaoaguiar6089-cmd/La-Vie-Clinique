import type { User } from 'firebase/auth';
import { ehZulia } from '../lib/projetoFirebase';

/**
 * Avisa o servidor que este login abriu o painel — o registro de acesso que a plataforma guarda por
 * 6 meses (ver `server/registrosDeAcesso.ts`). Uma vez por aba: recarregar a página não repete.
 *
 * Nunca atrapalha: sem servidor (a prévia do AI Studio, o `vite dev`), sem rede ou com qualquer
 * erro, simplesmente não registra.
 */
export function avisarAcessoAoPainel(usuario: User | null): void {
  if (!ehZulia || !usuario) return;
  const chave = `acesso-registrado:${usuario.uid}`;
  try {
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, '1');
  } catch {
    // sem sessionStorage (aba anônima com armazenamento bloqueado): registra assim mesmo
  }
  void usuario
    .getIdToken()
    .then((token) =>
      fetch('/api/acesso', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true })
    )
    .catch(() => {});
}
