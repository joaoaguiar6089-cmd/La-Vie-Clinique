import { useCallback, useEffect, useRef, useState } from 'react';
import { Attendance, ClinicProfile, GoogleAgendaConfig, Procedure } from '../types';
import {
  assinarGoogleAgenda,
  enviarAoGoogle,
  gravarMarcaGoogleAgenda,
  marcarContaComErro,
} from '../services/googleAgenda';
import { hojeISO } from '../utils/attendances';
import { OperacaoGoogle, planejarSincronizacao } from '../utils/googleAgenda';

/** Espera um pouco depois de cada mudança: remarcar, por exemplo, grava dois atendimentos. */
const ESPERA_MS = 2500;
/**
 * Mais um tanto ao acaso: com dois painéis abertos, um deles costuma terminar e gravar a marca
 * antes de o outro começar — que então não vê nada a enviar, em vez de repetir o envio.
 */
const ESPERA_ALEATORIA_MS = 4000;
const POR_LOTE = 25;
/** Servidor fora do ar ou sem resposta: tenta de novo depois disto. */
const PAUSA_SE_INDISPONIVEL_MS = 10 * 60 * 1000;
const PRIMEIRA_ESPERA_APOS_FALHA_MS = 2 * 60 * 1000;
const MAIOR_ESPERA_APOS_FALHA_MS = 60 * 60 * 1000;

const chaveDaOperacao = (op: OperacaoGoogle) => `${op.acao}:${op.profissionalId}:${op.eventoId}`;

interface Entrada {
  /** Só com alguém logado: o servidor exige o login do painel. */
  ativo: boolean;
  atendimentos: Attendance[];
  /** Enquanto a lista não chegou, uma lista vazia não quer dizer "nenhum agendamento". */
  carregando: boolean;
  catalogo: Procedure[];
  clinica: Pick<ClinicProfile, 'address' | 'cityState'>;
}

/**
 * Mantém o Google Agenda de cada profissional conectada igual à agenda do painel.
 *
 * Roda em todo painel aberto e logado, sobre a lista de atendimentos que o App já tem em memória:
 * a cada mudança, compara (`planejarSincronizacao`) e envia só a diferença. Como acontece com as
 * respostas das clientes pelo link, é o painel aberto que faz o trabalho — sem painel aberto,
 * nada muda no banco e não há o que enviar.
 *
 * Dois painéis abertos fazem o mesmo envio, e tudo bem: o id do evento é o mesmo, então o Google
 * fica com um evento só.
 */
export function useSincronizacaoGoogleAgenda({
  ativo,
  atendimentos,
  carregando,
  catalogo,
  clinica,
}: Entrada): void {
  const [config, setConfig] = useState<GoogleAgendaConfig | null>(null);

  useEffect(() => {
    if (!ativo) {
      setConfig(null);
      return;
    }
    return assinarGoogleAgenda(setConfig);
  }, [ativo]);

  const proximaTentativa = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (ativo) return;
    // Saiu do painel: nada de tentativa agendada rodando sem login.
    if (proximaTentativa.current) clearTimeout(proximaTentativa.current);
    proximaTentativa.current = null;
  }, [ativo]);

  const dados = useRef({ atendimentos, catalogo, clinica, config });
  dados.current = { atendimentos, catalogo, clinica, config };

  const rodando = useRef(false);
  const deNovo = useRef(false);
  const pausadoAte = useRef(0);
  const falhas = useRef(new Map<string, { vezes: number; ate: number }>());

  const executar = useCallback(async (): Promise<void> => {
    if (rodando.current) {
      deNovo.current = true;
      return;
    }
    if (Date.now() < pausadoAte.current) return;
    rodando.current = true;

    try {
      const { atendimentos, catalogo, clinica, config } = dados.current;
      const contas = config?.contas || {};
      const agora = Date.now();
      const operacoes = planejarSincronizacao(atendimentos, contas, catalogo, clinica, hojeISO()).filter(
        (op) => (falhas.current.get(chaveDaOperacao(op))?.ate ?? 0) <= agora
      );
      if (operacoes.length === 0) return;

      const porConta = new Map<string, OperacaoGoogle[]>();
      operacoes.forEach((op) => {
        porConta.set(op.profissionalId, [...(porConta.get(op.profissionalId) || []), op]);
      });

      for (const [profissionalId, daConta] of porConta) {
        const conta = contas[profissionalId];
        if (!conta) continue;

        for (let i = 0; i < daConta.length; i += POR_LOTE) {
          const lote = daConta.slice(i, i + POR_LOTE);
          const resposta = await enviarAoGoogle(
            conta,
            lote.map((op) => ({
              acao: op.acao,
              eventoId: op.eventoId,
              ...(op.acao === 'salvar' ? { evento: op.evento } : {}),
            }))
          );

          if (resposta.tipo === 'indisponivel') {
            pausadoAte.current = Date.now() + PAUSA_SE_INDISPONIVEL_MS;
            return;
          }
          if (resposta.tipo === 'conta-invalida') {
            await marcarContaComErro(profissionalId, conta.conectadoEm, resposta.motivo).catch((e) =>
              console.warn('Google Agenda: não foi possível marcar a conta para reconectar:', e)
            );
            break;
          }

          const aceitos = new Set(resposta.resultados.filter((r) => r.ok).map((r) => r.eventoId));
          for (const op of lote) {
            const chave = chaveDaOperacao(op);
            if (!aceitos.has(op.eventoId)) {
              const vezes = (falhas.current.get(chave)?.vezes ?? 0) + 1;
              const espera = Math.min(
                PRIMEIRA_ESPERA_APOS_FALHA_MS * 2 ** (vezes - 1),
                MAIOR_ESPERA_APOS_FALHA_MS
              );
              falhas.current.set(chave, { vezes, ate: Date.now() + espera });
              continue;
            }
            falhas.current.delete(chave);
            const marca = op.acao === 'salvar' ? op.marca : op.limparMarca ? null : undefined;
            if (marca === undefined) continue;
            await gravarMarcaGoogleAgenda(op.atendimentoId, marca).catch((e) =>
              // Atendimento excluído no meio do envio, por exemplo. A próxima rodada acerta.
              console.warn('Google Agenda: não foi possível anotar o envio no atendimento:', e)
            );
          }
        }
      }
    } finally {
      rodando.current = false;

      // Quando a próxima tentativa vence (falha ou servidor fora do ar), roda sozinho — sem
      // depender de alguém mexer na agenda.
      if (proximaTentativa.current) clearTimeout(proximaTentativa.current);
      const vencimentos = [pausadoAte.current, ...[...falhas.current.values()].map((f) => f.ate)].filter(
        (ate) => ate > Date.now()
      );
      proximaTentativa.current =
        vencimentos.length > 0
          ? setTimeout(() => void executar(), Math.min(...vencimentos) - Date.now() + 1000)
          : null;

      if (deNovo.current) {
        deNovo.current = false;
        setTimeout(() => void executar(), 0);
      }
    }
  }, []);

  useEffect(() => {
    if (!ativo || carregando || !config || Object.keys(config.contas || {}).length === 0) return;
    const espera = setTimeout(() => void executar(), ESPERA_MS + Math.random() * ESPERA_ALEATORIA_MS);
    return () => clearTimeout(espera);
  }, [ativo, carregando, config, atendimentos, catalogo, clinica.address, clinica.cityState, executar]);

  useEffect(
    () => () => {
      if (proximaTentativa.current) clearTimeout(proximaTentativa.current);
    },
    []
  );
}
