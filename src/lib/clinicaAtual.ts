import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Onde moram os dados da clínica do login — a base da Zulia para várias clínicas.
 *
 * Na plataforma, cada clínica tem um documento `clinicas/{clinicaId}`, e todas as coleções de
 * hoje (`patients`, `anamnesis_records`, `quotes`...) moram dentro dele. O painel nunca monta
 * esse caminho na mão: pede `colecao(nome)` ou `documento(nome, id)`, e aqui se decide onde fica.
 *
 * **Sem clínica definida, o caminho é o da raiz**, exatamente como sempre foi. É o modo do
 * projeto atual da La Vie, antes da migração: nada no sistema que está no ar muda por causa
 * deste arquivo. A clínica é definida no login, a partir da claim `clinicaId` que o servidor
 * grava (ver docs/zulia-plataforma.md).
 */

let clinicaId: string | null = null;

/** Define a clínica do login. `null` volta ao modo legado (raiz). */
export function definirClinicaAtual(id: string | null): void {
  clinicaId = id && id.trim() ? id.trim() : null;
}

/** A clínica do login, ou `null` no modo legado. */
export function clinicaAtual(): string | null {
  return clinicaId;
}

/** A coleção `nome` da clínica do login (ou da raiz, no modo legado). */
export function colecao(nome: string): CollectionReference {
  return clinicaId ? collection(db, 'clinicas', clinicaId, nome) : collection(db, nome);
}

/** O documento `id` da coleção `nome` da clínica do login (ou da raiz, no modo legado). */
export function documento(nome: string, id: string): DocumentReference {
  return clinicaId ? doc(db, 'clinicas', clinicaId, nome, id) : doc(db, nome, id);
}

/**
 * A pasta do Storage para `caminho` (ex.: `anamnese/fotos-pacientes`): dentro de
 * `clinicas/{clinicaId}/` na plataforma, ou o próprio caminho no modo legado.
 */
export function pastaDaClinica(caminho: string): string {
  const limpo = caminho.replace(/^\/+/, '');
  return clinicaId ? `clinicas/${clinicaId}/${limpo}` : limpo;
}
