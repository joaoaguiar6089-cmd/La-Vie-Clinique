import { AnamnesisQuestion } from '../types';

/**
 * Perguntas gerais que já são cobertas pelos campos dedicados de identificação (nome, contato,
 * nascimento, preferência musical) em toda tela de ficha. Elas continuam existindo no cadastro de
 * perguntas gerais por retrocompatibilidade, mas repeti-las no formulário faria o paciente
 * responder duas vezes a mesma coisa.
 */
export function isDuplicateIdentQuestion(q: AnamnesisQuestion): boolean {
  const idLower = q.id.toLowerCase();
  const textLower = q.texto.toLowerCase();
  return (
    idLower === 'gen-nome' ||
    idLower === 'gen-nascimento' ||
    idLower === 'gen-whatsapp' ||
    idLower === 'gen-contato' ||
    idLower === 'gen-telefone' ||
    idLower === 'gen-musica' ||
    textLower.includes('nome completo') ||
    textLower.includes('qual seu nome') ||
    textLower === 'data de nascimento' ||
    textLower.includes('música') ||
    textLower.includes('musica')
  );
}

/** Pergunta respondida pelo profissional. Ausência de `publicoAlvo` significa 'paciente'. */
export const isMedicoQuestion = (q: AnamnesisQuestion): boolean =>
  (q.publicoAlvo || 'paciente') === 'medico';

export const isPatientQuestion = (q: AnamnesisQuestion): boolean => !isMedicoQuestion(q);
