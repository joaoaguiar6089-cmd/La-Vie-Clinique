/**
 * Quem é da equipe — a lista que as regras do Firestore usam para liberar o painel.
 *
 * As regras não conseguem procurar um uid dentro da lista `professionals` (é uma lista de mapas),
 * então o perfil da clínica guarda também `equipeUids`: só os uids das profissionais com login.
 * O painel grava essa lista a cada salvamento do perfil (`saveClinicProfileToDb`) e o servidor
 * confere de tempos em tempos (`server/equipe.ts`), para que um login criado ou removido valha
 * nas regras na mesma hora.
 *
 * Antes disto as regras liberavam tudo para "qualquer pessoa logada" — e o cadastro de contas é
 * aberto (o botão "Criar login" do painel depende dele), então qualquer pessoa que criasse uma
 * conta entrava no painel e lia recibos, atendimentos e financeiro.
 */

/** Os uids das profissionais com login, sem repetição e em ordem — a forma gravada no perfil. */
export const uidsDaEquipe = (professionals?: ReadonlyArray<{ uid?: unknown } | null | undefined>): string[] =>
  [
    ...new Set(
      (professionals || [])
        .map((p) => p?.uid)
        .filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0)
    ),
  ].sort();

/** O login `uid` é de alguém da equipe? */
export const ehDaEquipe = (
  professionals: ReadonlyArray<{ uid?: unknown } | null | undefined> | undefined,
  uid: string | null | undefined
): boolean => !!uid && uidsDaEquipe(professionals).includes(uid);

/** As duas listas são iguais? (A gravada no perfil pode estar fora de ordem ou faltar.) */
export const mesmaEquipe = (a: unknown, b: string[]): boolean => {
  if (!Array.isArray(a)) return false;
  const ordenada = [...new Set(a.filter((x): x is string => typeof x === 'string'))].sort();
  return ordenada.length === b.length && ordenada.every((uid, i) => uid === b[i]);
};
