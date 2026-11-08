import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { ehZulia } from '../src/lib/projetoFirebase';
import { clinicaDoLink } from '../src/utils/clinicas';

/**
 * Onde moram os dados de uma clínica, do lado do servidor — o par de `src/lib/clinicaAtual.ts`.
 *
 * Na Zulia, cada clínica tem as coleções dentro de `clinicas/{c}`; no modo legado (o projeto da La
 * Vie), elas ficam na raiz e `clinicaId` é sempre `null`. O servidor nunca monta esse caminho na
 * mão: pede `caminhoDaColecao` ou `colecaoDaClinica`.
 */

/** `clinicas/{c}/<nome>` na Zulia, ou `<nome>` no legado (`clinicaId` nulo). */
export const caminhoDaColecao = (clinicaId: string | null, nome: string): string =>
  clinicaId ? `clinicas/${clinicaId}/${nome}` : nome;

export const colecaoDaClinica = (db: Firestore, clinicaId: string | null, nome: string): CollectionReference =>
  db.collection(caminhoDaColecao(clinicaId, nome));

/**
 * A clínica de um pedido que veio de um link de paciente (`c` do link).
 *   - legado: sempre `null` (raiz), qualquer que seja o `c`;
 *   - Zulia: o `c`, ou a clínica dos links antigos quando o link não tem `c`.
 * `undefined` quando, na Zulia, não dá para saber de qual clínica é — um `c` que não parece id, ou
 * link antigo antes de a La Vie ter id. Quem chama responde que o link não vale.
 */
export function clinicaDoPedido(c: unknown, zulia: boolean = ehZulia): string | null | undefined {
  if (!zulia) return null;
  return clinicaDoLink(c) ?? undefined;
}
