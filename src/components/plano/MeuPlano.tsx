import React from 'react';
import { BadgeCheck, Check, Gem, Mail } from 'lucide-react';
import { usePlanoDaClinica, type PlanoDaClinica } from '../../services/planoDaClinica';
import { LIMITES_DO_GRATUITO } from '../../utils/planos';
import { PRESTADOR } from '../../utils/documentosLegais';
import { MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { LinkDoDocumento } from '../auth/CadastroDaClinica';

/**
 * "Meu plano", nas Configurações (só para a admin, na plataforma): o plano da clínica, o uso
 * contra os limites do gratuito, o que cada plano inclui e o caminho para assinar.
 *
 * O uso vem dos contadores de `clinicas/{c}` (ver src/utils/planos.ts). A assinatura pela
 * InfinitePay é a etapa 4; até lá, "Assinar" abre um e-mail pronto para a plataforma.
 */

const INCLUI_GRATUITO = [
  'Todos os módulos: agenda, fichas, orçamentos, recibos, estoque e financeiro',
  `Até ${LIMITES_DO_GRATUITO.clientes} clientes (as arquivadas contam)`,
  `Até ${LIMITES_DO_GRATUITO.procedimentos} procedimentos no catálogo`,
  `${LIMITES_DO_GRATUITO.logins} login (o da administradora)`,
];

const INCLUI_COMPLETO = [
  'Todos os módulos',
  'Clientes sem limite',
  'Procedimentos sem limite',
  'Logins para toda a equipe, com papéis de administradora e profissional',
  'Assinatura mensal ou anual (com desconto)',
];

/**
 * Uma barra de uso. Sem limite, só o número. `alarme`: cheio fica vermelho e perto, âmbar — menos no
 * login do gratuito, que é sempre "1 de 1" (o da admin) e não é um problema.
 */
const Medidor: React.FC<{ rotulo: string; usado: number; limite: number | null; alarme?: boolean }> = ({
  rotulo,
  usado,
  limite,
  alarme = true,
}) => {
  const proporcao = limite ? Math.min(1, usado / limite) : 0;
  const cheio = alarme && limite !== null && usado >= limite;
  const perto = alarme && limite !== null && !cheio && proporcao >= 0.8;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{rotulo}</span>
        <span className={`text-xs font-semibold ${cheio ? 'text-red-700' : perto ? 'text-amber-700' : 'text-ink-soft'}`}>
          {limite === null ? `${usado} · sem limite` : `${usado} de ${limite}`}
        </span>
      </div>
      {limite !== null && (
        <div
          className="mt-1.5 h-2 rounded-full bg-surface-2 overflow-hidden"
          role="meter"
          aria-label={rotulo}
          aria-valuemin={0}
          aria-valuemax={limite}
          aria-valuenow={usado}
        >
          <div
            className={`h-full rounded-full transition-all ${cheio ? 'bg-red-600' : perto ? 'bg-amber-500' : 'bg-brand'}`}
            style={{ width: `${Math.max(proporcao * 100, usado > 0 ? 4 : 0)}%` }}
          />
        </div>
      )}
    </div>
  );
};

const ListaDoPlano: React.FC<{ titulo: string; itens: string[]; destaque?: boolean }> = ({ titulo, itens, destaque }) => (
  <div
    className={`rounded-2xl p-4 border ${destaque ? 'border-brand/40 bg-brand/5' : 'border-[rgba(26,26,26,.08)] bg-card'}`}
  >
    <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
      {destaque && <Gem className="w-3.5 h-3.5 text-brand" />}
      {titulo}
    </p>
    <ul className="mt-2 space-y-1.5">
      {itens.map((item) => (
        <li key={item} className="flex items-start gap-1.5 text-xs text-ink-soft leading-relaxed">
          <Check className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
          {item}
        </li>
      ))}
    </ul>
  </div>
);

/** O e-mail pronto para pedir a assinatura, enquanto a cobrança pela InfinitePay não existe. */
const linkParaAssinar = (nomeDaClinica: string): string => {
  const assunto = `Quero assinar o plano completo — ${nomeDaClinica}`;
  const corpo =
    `Olá! Quero assinar o plano completo da ${MARCA_DA_PLATAFORMA} para a ${nomeDaClinica}.\n\n` +
    'Prefiro a assinatura: ( ) mensal  ( ) anual\n';
  return `mailto:${PRESTADOR.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
};

export const ConteudoDoPlano: React.FC<{ plano: PlanoDaClinica; nomeDaClinica: string }> = ({ plano, nomeDaClinica }) => {
  const completo = plano.plano === 'completo';
  const limite = (n: number) => (completo ? null : n);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Plano atual:</span>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
            completo ? 'bg-brand text-white' : 'bg-surface-2 text-ink'
          }`}
        >
          {completo && <BadgeCheck className="w-3.5 h-3.5" />}
          {completo ? 'Completo' : 'Gratuito'}
        </span>
        {completo && plano.cortesia && (
          <span className="text-xs text-ink-soft">— cortesia da {MARCA_DA_PLATAFORMA}, sem cobrança</span>
        )}
      </div>

      <div className="space-y-3">
        <Medidor rotulo="Clientes" usado={plano.uso.clientes} limite={limite(LIMITES_DO_GRATUITO.clientes)} />
        <Medidor rotulo="Procedimentos" usado={plano.uso.procedimentos} limite={limite(LIMITES_DO_GRATUITO.procedimentos)} />
        <Medidor rotulo="Logins da equipe" usado={plano.logins} limite={limite(LIMITES_DO_GRATUITO.logins)} alarme={false} />
      </div>

      {!completo && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ListaDoPlano titulo="Gratuito" itens={INCLUI_GRATUITO} />
            <ListaDoPlano titulo="Completo" itens={INCLUI_COMPLETO} destaque />
          </div>
          <div className="rounded-2xl p-4 bg-surface border border-[rgba(26,26,26,.08)] space-y-2.5">
            <p className="text-xs text-ink-soft leading-relaxed">
              A assinatura pelo próprio painel, com pagamento pela InfinitePay, chega em breve. Para assinar agora, fale
              com a {MARCA_DA_PLATAFORMA}: liberamos o plano completo assim que o pagamento for confirmado.
            </p>
            <a
              href={linkParaAssinar(nomeDaClinica)}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto h-[44px] px-5 rounded-xl bg-brand text-white text-[14px] font-semibold hover:bg-brand-hover transition-colors"
            >
              <Mail className="w-4 h-4" />
              Quero assinar o plano completo
            </a>
          </div>
        </>
      )}

      <p className="text-[11.5px] text-muted leading-relaxed">
        Cliente arquivada continua contando; só excluir de vez libera a vaga. As regras dos planos, da cobrança e do
        cancelamento estão nos <LinkDoDocumento documento="termos-de-uso">Termos de Uso</LinkDoDocumento>.
      </p>
    </div>
  );
};

/** A seção, com o plano acompanhado em tempo real. Some enquanto o plano não chega. */
export const MeuPlano: React.FC<{ nomeDaClinica: string }> = ({ nomeDaClinica }) => {
  const plano = usePlanoDaClinica();
  if (!plano) {
    return <p className="text-xs text-muted">Carregando o plano…</p>;
  }
  return <ConteudoDoPlano plano={plano} nomeDaClinica={nomeDaClinica} />;
};
