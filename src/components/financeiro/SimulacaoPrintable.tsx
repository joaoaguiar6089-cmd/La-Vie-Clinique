import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClinicProfile, SimulacaoDeCusto } from '../../types';
import { clinicMonogram } from '../ClinicLogo';
import {
  ALTURA_UTIL,
  BRONZE,
  CINZA,
  CINZA_CLARO,
  CONTENT_W,
  CREME,
  GAP,
  HAIRLINE,
  OFFWHITE,
  PRETO,
  TEXTO_DETALHE,
  dataCurta,
  estiloDaPagina,
  estiloDoNumeroDaPagina,
  estiloDoRotulo,
} from '../documentos/estiloA4';
import { formatBRL } from '../../utils/formatters';
import { custoDaLinha, formatarPrecoUnitario, quantidadeComUnidade, valorClienteDaLinha } from '../../utils/estoque';
import { totaisDoProcedimento } from '../../utils/simulacaoDeCusto';
import { partesDoNomeDaClinica } from '../../utils/recibos';

/**
 * A simulação de custo em folhas A4 — com a identidade do orçamento (monograma, serifa, bronze),
 * mas, ao contrário dele, mostrando tudo: cada material com quantidade, custo e valor repassado à
 * cliente, o total de cada procedimento e o total geral.
 *
 * Paginação medida, como a do orçamento, mas por **linha de material**: um procedimento com
 * muitos materiais continua na folha seguinte, com o nome dele repetido ("continuação"), em vez
 * de sair cortado do PDF.
 */

type DadosDaClinica = Pick<ClinicProfile, 'name' | 'tagline' | 'cityState' | 'phone'>;

/** Larguras das colunas; o material fica com o resto. Somam com folga dentro da folha. */
const COLUNAS = { qtd: 92, custoUn: 92, custo: 92, repasseUn: 92, repasse: 92 };
const COLUNA_MATERIAL = CONTENT_W - Object.values(COLUNAS).reduce((a, b) => a + b, 0);
const BEGE_DA_LINHA = '#F4F0EA';
const BEGE_DO_TOTAL = '#EEE6DB';

const rotuloPequeno: React.CSSProperties = { ...estiloDoRotulo, fontWeight: 600, letterSpacing: '.1em' };

const celula = (largura: number, alinhamento: 'left' | 'right' = 'right'): React.CSSProperties => ({
  width: largura,
  flexShrink: 0,
  textAlign: alinhamento,
  padding: '7px 10px',
  boxSizing: 'border-box',
});

const Cabecalho: React.FC<{ simulacao: SimulacaoDeCusto; clinica: DadosDaClinica }> = ({ simulacao, clinica }) => {
  const { curto, complemento } = partesDoNomeDaClinica(clinica.name);
  const linhaDeBaixo = [clinica.tagline, clinica.cityState].filter(Boolean).join(' • ');
  return (
    <div style={{ flexShrink: 0, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: PRETO,
              color: BRONZE,
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              letterSpacing: '.06em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {clinicMonogram(clinica.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: PRETO, lineHeight: 1.1 }}>{curto}</div>
            {[complemento, linhaDeBaixo].filter(Boolean).map((linha) => (
              <div
                key={linha}
                style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color: CINZA, marginTop: 4 }}
              >
                {linha}
              </div>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <div style={rotuloPequeno}>Simulação de custo</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: PRETO, lineHeight: 1.25, marginTop: 2 }}>
            {dataCurta(simulacao.createdAt)}
          </div>
          {simulacao.updatedAt && (
            <div style={{ fontSize: 10, color: CINZA, marginTop: 1 }}>Atualizada em {dataCurta(simulacao.updatedAt)}</div>
          )}
        </div>
      </div>
      <div style={{ height: 1, background: HAIRLINE, marginTop: 18 }} />
    </div>
  );
};

const CabecalhoCompacto: React.FC<{ simulacao: SimulacaoDeCusto }> = ({ simulacao }) => (
  <div style={{ flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: PRETO }}>
        Simulação de custo · {dataCurta(simulacao.createdAt)}
      </div>
      {simulacao.pacienteNome && (
        <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.14em', color: CINZA }}>
          {simulacao.pacienteNome}
        </div>
      )}
    </div>
    <div style={{ height: 1, background: HAIRLINE, marginTop: 9 }} />
  </div>
);

/** Cliente e autora à esquerda; o custo total no bloco preto à direita — o número procurado. */
const Identificacao: React.FC<{ simulacao: SimulacaoDeCusto }> = ({ simulacao }) => (
  <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', flexShrink: 0 }}>
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
      <div>
        <div style={{ ...rotuloPequeno, marginBottom: 5 }}>Cliente</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: simulacao.pacienteNome ? PRETO : CINZA_CLARO, lineHeight: 1.12 }}>
          {simulacao.pacienteNome || 'Sem cliente'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 28 }}>
        <div>
          <div style={{ ...rotuloPequeno, marginBottom: 3 }}>Feita por</div>
          <div style={{ fontSize: 12, color: TEXTO_DETALHE }}>{simulacao.criadoPorNome || '—'}</div>
        </div>
        <div>
          <div style={{ ...rotuloPequeno, marginBottom: 3 }}>Procedimentos</div>
          <div style={{ fontSize: 12, color: TEXTO_DETALHE }}>{simulacao.procedimentos.length}</div>
        </div>
      </div>
    </div>
    <div
      style={{
        background: PRETO,
        color: OFFWHITE,
        padding: '18px 22px 16px',
        width: 270,
        boxSizing: 'border-box',
        borderRadius: 8,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div>
        <div style={rotuloPequeno}>Custo total dos materiais</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: 1.15, marginTop: 6 }}>
          {formatBRL(simulacao.custoTotal)}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: CREME, opacity: 0.85 }}>
        Repassado à cliente: {formatBRL(simulacao.valorClienteTotal)}
      </div>
    </div>
  </div>
);

/** O nome do procedimento e o cabeçalho da tabela — repetidos quando ele continua na folha seguinte. */
const CabecalhoDoProcedimento: React.FC<{ simulacao: SimulacaoDeCusto; indice: number; continuacao: boolean }> = ({
  simulacao,
  indice,
  continuacao,
}) => {
  const p = simulacao.procedimentos[indice];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: BRONZE }}>{indice + 1}.</span>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: PRETO, lineHeight: 1.2 }}>{p.titulo}</span>
        {p.sessoes > 1 && <span style={{ fontSize: 10.5, color: CINZA }}>{p.sessoes} sessões</span>}
        {continuacao && <span style={{ fontSize: 10, color: CINZA_CLARO, fontStyle: 'italic' }}>(continuação)</span>}
      </div>
      <div
        style={{
          display: 'flex',
          background: PRETO,
          color: OFFWHITE,
          fontSize: 8.5,
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          fontWeight: 600,
        }}
      >
        <div style={celula(COLUNA_MATERIAL, 'left')}>Material</div>
        <div style={celula(COLUNAS.qtd)}>Quantidade</div>
        <div style={celula(COLUNAS.custoUn)}>Custo / un.</div>
        <div style={celula(COLUNAS.custo)}>Custo</div>
        <div style={celula(COLUNAS.repasseUn)}>Cliente / un.</div>
        <div style={celula(COLUNAS.repasse)}>Cliente</div>
      </div>
    </div>
  );
};

const LinhaDoMaterial: React.FC<{ simulacao: SimulacaoDeCusto; indice: number; linha: number }> = ({
  simulacao,
  indice,
  linha,
}) => {
  const m = simulacao.procedimentos[indice].materiais[linha];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: 10.5,
        color: PRETO,
        fontVariantNumeric: 'tabular-nums',
        background: linha % 2 === 1 ? BEGE_DA_LINHA : 'transparent',
        borderBottom: `1px solid ${HAIRLINE}`,
      }}
    >
      <div style={{ ...celula(COLUNA_MATERIAL, 'left'), lineHeight: 1.3 }}>
        {m.nome}
        {!m.produtoId && <span style={{ color: CINZA_CLARO, fontSize: 9 }}> · fora do estoque</span>}
      </div>
      <div style={celula(COLUNAS.qtd)}>{quantidadeComUnidade(m.quantidade, m.unidade)}</div>
      <div style={celula(COLUNAS.custoUn)}>{formatarPrecoUnitario(m.custoUnitario)}</div>
      <div style={{ ...celula(COLUNAS.custo), fontWeight: 600 }}>{formatBRL(custoDaLinha(m))}</div>
      <div style={{ ...celula(COLUNAS.repasseUn), color: CINZA }}>{formatarPrecoUnitario(m.valorCliente)}</div>
      <div style={{ ...celula(COLUNAS.repasse), color: CINZA }}>{formatBRL(valorClienteDaLinha(m))}</div>
    </div>
  );
};

const SemMateriais: React.FC = () => (
  <div style={{ padding: '9px 10px', fontSize: 10.5, color: CINZA, fontStyle: 'italic', borderBottom: `1px solid ${HAIRLINE}` }}>
    Nenhum material lançado neste procedimento.
  </div>
);

const TotalDoProcedimento: React.FC<{ simulacao: SimulacaoDeCusto; indice: number }> = ({ simulacao, indice }) => {
  const totais = totaisDoProcedimento(simulacao.procedimentos[indice]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: BEGE_DO_TOTAL,
        fontSize: 11,
        fontWeight: 700,
        color: PRETO,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div style={celula(COLUNA_MATERIAL + COLUNAS.qtd + COLUNAS.custoUn, 'left')}>Total do procedimento</div>
      <div style={celula(COLUNAS.custo)}>{formatBRL(totais.custo)}</div>
      <div style={celula(COLUNAS.repasseUn)} />
      <div style={{ ...celula(COLUNAS.repasse), fontWeight: 600, color: TEXTO_DETALHE }}>{formatBRL(totais.valorCliente)}</div>
    </div>
  );
};

/** O fecho: o custo de cada procedimento (quando há mais de um) e os totais. */
const Totais: React.FC<{ simulacao: SimulacaoDeCusto }> = ({ simulacao }) => {
  const linha: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    fontSize: 11.5,
    color: TEXTO_DETALHE,
    padding: '5px 0',
    fontVariantNumeric: 'tabular-nums',
  };
  return (
    <div style={{ flexShrink: 0, marginLeft: 'auto', width: 360 }}>
      <div style={{ ...rotuloPequeno, marginBottom: 6 }}>Resumo</div>
      {simulacao.procedimentos.length > 1 &&
        simulacao.procedimentos.map((p, i) => (
          <div key={p.id} style={linha}>
            <span style={{ minWidth: 0 }}>
              {i + 1}. {p.titulo}
            </span>
            <span style={{ flexShrink: 0 }}>{formatBRL(totaisDoProcedimento(p).custo)}</span>
          </div>
        ))}
      <div style={{ ...linha, borderTop: simulacao.procedimentos.length > 1 ? `1px solid ${HAIRLINE}` : undefined }}>
        <span>Valor repassado à cliente</span>
        <span>{formatBRL(simulacao.valorClienteTotal)}</span>
      </div>
      <div
        style={{
          ...linha,
          marginTop: 4,
          padding: '10px 14px',
          background: PRETO,
          color: OFFWHITE,
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span>Custo total dos materiais</span>
        <span>{formatBRL(simulacao.custoTotal)}</span>
      </div>
    </div>
  );
};

const Rodape: React.FC<{ clinica: DadosDaClinica }> = ({ clinica }) => {
  const assinatura = [partesDoNomeDaClinica(clinica.name).curto, clinica.cityState, clinica.phone].filter(Boolean).join(' • ');
  return (
    <div style={{ flexShrink: 0, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: 'flex', gap: 22, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 9, color: CINZA, maxWidth: 380, lineHeight: 1.4 }}>
          Documento interno. Os valores são os de cada material no dia em que ele entrou na simulação.
        </div>
        <div style={{ fontSize: 9, color: CINZA, textAlign: 'right' }}>{assinatura.replace(/-/g, '‑')}</div>
      </div>
    </div>
  );
};

// ==========================================
// PAGINAÇÃO
// ==========================================

/** Um pedaço de procedimento numa folha: o cabeçalho dele, algumas linhas e, no último, o total. */
interface Pedaco {
  procedimento: number;
  linhas: number[];
  continuacao: boolean;
  total: boolean;
}

interface Pagina {
  primeira: boolean;
  pedacos: Pedaco[];
  final: boolean;
}

export interface Alturas {
  cabecalho: number;
  cabecalhoCompacto: number;
  identificacao: number;
  /** Por procedimento: o cabeçalho dele, cada linha, a linha "sem materiais" e o total. */
  procedimentos: { cabecalho: number; linhas: number[]; vazio: number; total: number }[];
  totais: number;
  rodape: number;
}

/**
 * Distribui os procedimentos entre as folhas medindo a altura real de cada parte. Um
 * procedimento só começa numa folha se couber ao menos o nome e a primeira linha; um que não
 * cabe inteiro continua na seguinte, linha a linha. Os totais vão junto da última linha quando
 * cabem, senão ganham a folha seguinte.
 *
 * A conta segue a coluna da folha: cada bloco ocupa a altura dele mais o `GAP` até o próximo, e
 * o rodapé, presente em toda folha, fica reservado desde o começo — com o `GAP` do espaçador que
 * o empurra para o pé da página.
 */
export const paginarSimulacao = (alturas: Alturas): Pagina[] => {
  const paginas: Pagina[] = [];
  const reservaDoRodape = alturas.rodape + GAP;
  let atual: Pagina = { primeira: true, pedacos: [], final: false };
  let espaco = ALTURA_UTIL - reservaDoRodape - alturas.cabecalho - GAP - alturas.identificacao - GAP;

  const novaPagina = () => {
    paginas.push(atual);
    atual = { primeira: false, pedacos: [], final: false };
    espaco = ALTURA_UTIL - reservaDoRodape - alturas.cabecalhoCompacto - GAP;
  };

  alturas.procedimentos.forEach((p, indice) => {
    const semLinhas = p.linhas.length === 0;
    const primeira = semLinhas ? p.vazio + p.total : p.linhas[0] + (p.linhas.length === 1 ? p.total : 0);
    if (p.cabecalho + primeira + GAP > espaco && atual.pedacos.length > 0) novaPagina();

    let pedaco: Pedaco = { procedimento: indice, linhas: [], continuacao: false, total: false };
    espaco -= p.cabecalho;

    p.linhas.forEach((altura, linha) => {
      const ultima = linha === p.linhas.length - 1;
      // O GAP: se a próxima linha não couber, o pedaço termina aqui e precisa do espaço até o
      // bloco seguinte.
      const necessario = altura + (ultima ? p.total : 0) + GAP;
      // Uma linha sozinha que não cabe nem na folha vazia fica onde está — sem folhas em loop.
      if (necessario > espaco && pedaco.linhas.length > 0) {
        atual.pedacos.push(pedaco);
        novaPagina();
        pedaco = { procedimento: indice, linhas: [], continuacao: true, total: false };
        espaco -= p.cabecalho;
      }
      pedaco.linhas.push(linha);
      espaco -= altura;
    });

    pedaco.total = true;
    espaco -= p.total + (semLinhas ? p.vazio : 0) + GAP;
    atual.pedacos.push(pedaco);
  });

  if (alturas.totais + GAP > espaco && atual.pedacos.length > 0) novaPagina();
  atual.final = true;
  paginas.push(atual);
  return paginas;
};

const PedacoDoProcedimento: React.FC<{ simulacao: SimulacaoDeCusto; pedaco: Pedaco }> = ({ simulacao, pedaco }) => {
  const semMateriais = simulacao.procedimentos[pedaco.procedimento].materiais.length === 0;
  return (
    <div style={{ flexShrink: 0 }}>
      <CabecalhoDoProcedimento simulacao={simulacao} indice={pedaco.procedimento} continuacao={pedaco.continuacao} />
      {pedaco.linhas.map((linha) => (
        <LinhaDoMaterial key={linha} simulacao={simulacao} indice={pedaco.procedimento} linha={linha} />
      ))}
      {pedaco.total && semMateriais && <SemMateriais />}
      {pedaco.total && <TotalDoProcedimento simulacao={simulacao} indice={pedaco.procedimento} />}
    </div>
  );
};

interface PaginasDaSimulacaoProps {
  simulacao: SimulacaoDeCusto;
  clinica: DadosDaClinica;
  /** Avisa quando as folhas estão montadas — antes disso não há o que capturar. */
  onPronta?: (pronta: boolean) => void;
}

export const PaginasDaSimulacao: React.FC<PaginasDaSimulacaoProps> = ({ simulacao, clinica, onPronta }) => {
  const medicaoRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Pagina[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLayout(null);
    onPronta?.(false);

    (async () => {
      // Sem as fontes carregadas, a serifa ainda não está aplicada e toda medida sai errada.
      if (document.fonts) await document.fonts.ready;
      for (let tentativa = 0; !medicaoRef.current && tentativa < 30; tentativa++) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (cancelado) return;
      }
      const raiz = medicaoRef.current;
      if (cancelado || !raiz) return;
      const altura = (seletor: string) => raiz.querySelector<HTMLElement>(seletor)?.getBoundingClientRect().height ?? 0;

      setLayout(
        paginarSimulacao({
          cabecalho: altura('[data-medir="cabecalho"]'),
          cabecalhoCompacto: altura('[data-medir="cabecalho-compacto"]'),
          identificacao: altura('[data-medir="identificacao"]'),
          procedimentos: simulacao.procedimentos.map((p, i) => ({
            cabecalho: altura(`[data-medir="proc-${i}-cabecalho"]`),
            linhas: p.materiais.map((_, j) => altura(`[data-medir="proc-${i}-linha-${j}"]`)),
            vazio: altura(`[data-medir="proc-${i}-vazio"]`),
            total: altura(`[data-medir="proc-${i}-total"]`),
          })),
          totais: altura('[data-medir="totais"]'),
          rodape: altura('[data-medir="rodape"]'),
        })
      );
    })();

    return () => {
      cancelado = true;
    };
    // `onPronta` é um setter estável de quem chama; medir de novo só quando o documento muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulacao, clinica]);

  useEffect(() => {
    if (layout) onPronta?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const total = layout?.length || 0;

  return (
    <>
      {/* Passe de medição: fora da tela, mas com layout real (visibility, não display). Mora no
          `body`: dentro da prévia, que encolhe a folha com `scale` no celular, as alturas medidas
          sairiam encolhidas junto, e a folha caberia mais do que cabe. */}
      {!layout &&
        createPortal(
        <div
          ref={medicaoRef}
          aria-hidden
          style={{
            position: 'fixed',
            left: -20000,
            top: 0,
            width: CONTENT_W,
            visibility: 'hidden',
            fontFamily: 'var(--font-sans)',
            background: OFFWHITE,
          }}
        >
          <div data-medir="cabecalho">
            <Cabecalho simulacao={simulacao} clinica={clinica} />
          </div>
          <div data-medir="cabecalho-compacto">
            <CabecalhoCompacto simulacao={simulacao} />
          </div>
          <div data-medir="identificacao">
            <Identificacao simulacao={simulacao} />
          </div>
          {simulacao.procedimentos.map((p, i) => (
            <div key={p.id}>
              <div data-medir={`proc-${i}-cabecalho`}>
                <CabecalhoDoProcedimento simulacao={simulacao} indice={i} continuacao />
              </div>
              {p.materiais.map((_, j) => (
                <div key={j} data-medir={`proc-${i}-linha-${j}`}>
                  <LinhaDoMaterial simulacao={simulacao} indice={i} linha={j} />
                </div>
              ))}
              <div data-medir={`proc-${i}-vazio`}>
                <SemMateriais />
              </div>
              <div data-medir={`proc-${i}-total`}>
                <TotalDoProcedimento simulacao={simulacao} indice={i} />
              </div>
            </div>
          ))}
          <div data-medir="totais">
            <Totais simulacao={simulacao} />
          </div>
          <div data-medir="rodape">
            <Rodape clinica={clinica} />
          </div>
        </div>,
          document.body
        )}

      {layout?.map((pagina, indice) => (
        <div key={indice} data-pdf-page={indice + 1} style={estiloDaPagina}>
          {indice === 0 && (
            <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 18, background: PRETO }} />
          )}
          {pagina.primeira ? <Cabecalho simulacao={simulacao} clinica={clinica} /> : <CabecalhoCompacto simulacao={simulacao} />}
          {pagina.primeira && <Identificacao simulacao={simulacao} />}
          {pagina.pedacos.map((pedaco) => (
            <PedacoDoProcedimento
              key={`${pedaco.procedimento}-${pedaco.linhas[0] ?? 'v'}`}
              simulacao={simulacao}
              pedaco={pedaco}
            />
          ))}
          {pagina.final && <Totais simulacao={simulacao} />}
          <div style={{ flex: 1 }} />
          <Rodape clinica={clinica} />
          <div style={estiloDoNumeroDaPagina}>
            {indice + 1}/{total}
          </div>
        </div>
      ))}
    </>
  );
};
