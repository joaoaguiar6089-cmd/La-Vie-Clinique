import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { documentoDaPlataforma } from '../lib/clinicaAtual';
import { usoDe, type UsoDaClinica } from '../utils/planos';

/** O plano e o uso da clínica, como o painel vê (`clinicas/{c}`). */
export interface PlanoDaClinica {
  plano: unknown;
  cortesia: boolean;
  uso: UsoDaClinica;
}

/**
 * Acompanha o plano e o uso da clínica. No modo legado (sem documento da clínica) entrega `null`:
 * sem plano, sem limite. Sem conseguir ler, também `null` — a tela não bloqueia por isso; quem
 * confere de verdade são as regras e o servidor.
 */
export function assinarPlanoDaClinica(onUpdate: (plano: PlanoDaClinica | null) => void): () => void {
  const ref = documentoDaPlataforma();
  if (!ref) {
    onUpdate(null);
    return () => {};
  }
  return onSnapshot(
    ref,
    (snap) => {
      const dados = snap.data();
      onUpdate(dados ? { plano: dados.plano, cortesia: dados.cortesia === true, uso: usoDe(dados) } : null);
    },
    () => onUpdate(null)
  );
}

/** O plano e o uso da clínica para um componente (`null` enquanto não chega, no legado ou sem leitura). */
export function usePlanoDaClinica(): PlanoDaClinica | null {
  const [plano, setPlano] = useState<PlanoDaClinica | null>(null);
  useEffect(() => assinarPlanoDaClinica(setPlano), []);
  return plano;
}
