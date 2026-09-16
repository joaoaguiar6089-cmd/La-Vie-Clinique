/**
 * Conserto de formas de dado que voltam erradas do Firestore.
 *
 * Mora fora do `databaseService` para poder ser testado sem subir o SDK do Firebase —
 * ver `scripts/verificar-mapa-laser.ts`.
 */

/**
 * Devolve uma lista de verdade a partir do que veio do banco.
 *
 * Campos que deveriam ser array às vezes voltam como **mapa de chaves numéricas**
 * (`{0: …, 1: …}`): backups reimportados, gravações antigas e o próprio `cleanForFirestore`, que
 * achata array dentro de array, todos produzem essa forma.
 *
 * O estrago é traiçoeiro porque o TypeScript continua jurando que é um array, e porque o código
 * que consome falha **no segundo uso, não no primeiro**:
 *
 * ```ts
 * if (lista.length === 0) return <Vazio />;   // undefined === 0 → false, passa direto
 * return lista.map(...)                       // TypeError: lista.map is not a function
 * ```
 *
 * Foi assim que uma ficha-modelo com `perguntasEspecificas` em forma de mapa apagou a tela inteira
 * do preenchimento de anamnese. Só o leitor pode resolver: o dado estragado já está gravado.
 */
export function paraArray<T>(valor: unknown): T[] {
  if (Array.isArray(valor)) return valor as T[];
  if (valor && typeof valor === 'object') {
    const registro = valor as Record<string, unknown>;
    const chaves = Object.keys(registro)
      .map(Number)
      .filter((k) => Number.isInteger(k) && k >= 0)
      .sort((a, b) => a - b);
    if (chaves.length > 0) return chaves.map((k) => registro[String(k)]) as T[];
  }
  return [];
}
