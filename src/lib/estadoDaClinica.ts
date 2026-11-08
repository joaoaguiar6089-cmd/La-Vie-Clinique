import { ehZulia } from './projetoFirebase';
import { clinicaDoLink } from '../utils/clinicas';

/**
 * A clínica do login (ou do link da paciente) — o estado de `src/lib/clinicaAtual.ts`, num módulo
 * sem o SDK do Firebase, para quem só precisa saber *qual* clínica: as assinaturas compartilhadas
 * (`sharedSubscription`), as chaves do `localStorage`, os links que saem para a paciente.
 *
 * Sem clínica definida é o modo legado: tudo na raiz, as chaves de sempre.
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

/**
 * Para as páginas da paciente (ficha, orçamento, agendamento), antes de qualquer leitura: define a
 * clínica pelo `c=` do link — ou, sem ele, a dos links antigos da La Vie. Devolve se dá para
 * saber a clínica. No modo legado, sempre `true` e nada muda (raiz).
 */
export function definirClinicaDoLink(search: string): boolean {
  if (!ehZulia) return true;
  const id = clinicaDoLink(new URLSearchParams(search).get('c'));
  definirClinicaAtual(id);
  return !!id;
}

/**
 * A chave de `localStorage` desta clínica. No legado, a própria `base` (as chaves de sempre). Na
 * Zulia, `base@<clinicaId>` — duas clínicas abertas no mesmo navegador não compartilham cache nem
 * marca de "já fiz" —, ou `null` enquanto a clínica não é conhecida (antes do login), e aí quem
 * chamou não lê nem grava nada: o cache antigo da La Vie no mesmo endereço não pode aparecer para
 * outra clínica.
 */
export function chaveLocal(base: string): string | null {
  if (!ehZulia) return base;
  return clinicaId ? `${base}@${clinicaId}` : null;
}

/** `localStorage.getItem` na chave desta clínica (ver `chaveLocal`). Nunca lança. */
export function lerLocal(base: string): string | null {
  const chave = chaveLocal(base);
  if (!chave) return null;
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

/**
 * `localStorage.setItem` na chave desta clínica. Lança como o original (cota cheia, storage
 * bloqueado) — quem chama já trata —, e não grava nada enquanto a clínica não é conhecida.
 */
export function gravarLocal(base: string, valor: string): void {
  const chave = chaveLocal(base);
  if (chave) localStorage.setItem(chave, valor);
}
