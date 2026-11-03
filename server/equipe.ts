import type { Firestore } from 'firebase-admin/firestore';
import { mesmaEquipe, uidsDaEquipe } from '../src/utils/equipe';

/**
 * Mantém `clinic_settings/main_profile.equipeUids` igual aos logins da lista de profissionais.
 *
 * As regras do Firestore liberam o painel só para os uids desta lista (ver `src/utils/equipe.ts`).
 * O painel já grava a lista a cada salvamento do perfil; isto aqui é a rede de segurança — roda
 * quando o servidor sobe e de tempos em tempos, e conserta uma lista que ficou para trás (um
 * perfil salvo por uma versão antiga do app, por exemplo). Sem ela, uma profissional com login
 * válido poderia ficar trancada fora do próprio painel.
 *
 * Devolve `true` quando precisou corrigir.
 */
export async function sincronizarEquipe(db: Firestore): Promise<boolean> {
  const ref = db.collection('clinic_settings').doc('main_profile');
  const snap = await ref.get();
  if (!snap.exists) return false;
  const dados = snap.data() || {};
  const uids = uidsDaEquipe(dados.professionals);
  if (mesmaEquipe(dados.equipeUids, uids)) return false;
  await ref.update({ equipeUids: uids });
  return true;
}

const INTERVALO_MS = 30 * 60 * 1000;

/** Sincroniza agora e a cada 30 minutos. Nunca lança: o servidor continua de pé se falhar. */
export function manterEquipeSincronizada(banco: () => Firestore | null): void {
  const rodar = async () => {
    const db = banco();
    if (!db) return;
    try {
      if (await sincronizarEquipe(db)) console.log('[equipe] lista de logins da equipe atualizada.');
    } catch (erro) {
      console.warn('[equipe] não foi possível conferir a lista de logins da equipe:', erro);
    }
  };
  void rodar();
  setInterval(rodar, INTERVALO_MS).unref();
}
