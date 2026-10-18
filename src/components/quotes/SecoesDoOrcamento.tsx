import React from 'react';
import { AlertCircle, Calculator, CreditCard, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { ClinicProfile, Patient, Procedure } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { sugerirDescontoCombinado } from '../../utils/quoteCalc';
import { nomeCurtoDaArea } from '../../utils/laserAreas';
import { PatientSearchSelect } from './PatientSearchSelect';
import { ProcedureSearchAdd } from './ProcedureSearchAdd';
import { ProdutoSearchAdd } from './ProdutoSearchAdd';
import { QuoteItemEditor } from './QuoteItemEditor';
import { QuotePaymentOptionEditor } from './QuotePaymentOptionEditor';
import { CustoDeMaterialDoOrcamento } from './CustoDeMaterialDoOrcamento';
import { LaserQuoteMapModal } from '../laser/LaserQuoteMapModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { AvisoTinta, CampoTinta, INPUT_TINTA, Interruptor } from '../common/Tinta';
import { OrcamentoEmEdicao, fromDateInput, toDateInput } from './useOrcamentoEmEdicao';

/*
  As partes do formulário de orçamento — a paciente e as datas, os itens com o desconto, e o
  pagamento. O formulário de orçamento as mostra em etapas; a ficha de avaliação, uma embaixo da
  outra. O estado mora em `useOrcamentoEmEdicao`.
*/

export const SectionHeader: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h3 className="font-sans text-[15px] font-bold text-ink flex items-center gap-2">
    {icon}
    {children}
  </h3>
);

/**
 * A paciente, o WhatsApp, as datas, o "já teve avaliação" e a mensagem de abertura.
 *
 * Sem `patients`, a paciente não se escolhe aqui: é a da ficha de avaliação que abriu o orçamento.
 */
export const SecaoDadosDoOrcamento: React.FC<{
  orc: OrcamentoEmEdicao;
  patients?: Patient[];
  idBase?: string;
}> = ({ orc, patients, idBase = 'orcamento' }) => (
  <>
    <div className="space-y-3.5">
      {patients && (
        <div>
          <PatientSearchSelect
            patients={patients}
            pacienteId={orc.pacienteId}
            pacienteNome={orc.pacienteNome}
            onSelect={({ id, nome, contato }) => {
              orc.setPacienteId(id);
              orc.setPacienteNome(nome);
              if (contato !== undefined) orc.setPacienteContato(contato);
            }}
          />
          {orc.errors.paciente && (
            <p className="mt-1 px-1 text-[13px] font-medium text-danger">{orc.errors.paciente}</p>
          )}
        </div>
      )}

      <CampoTinta rotulo="WhatsApp" htmlFor={`${idBase}-contato`}>
        <input
          id={`${idBase}-contato`}
          type="tel"
          inputMode="tel"
          value={orc.pacienteContato}
          onChange={(e) => orc.setPacienteContato(e.target.value)}
          placeholder="(19) 99123-4567"
          autoComplete="off"
          className={INPUT_TINTA}
        />
      </CampoTinta>

      <div className="grid grid-cols-2 gap-2.5">
        <CampoTinta rotulo="Emissão" htmlFor={`${idBase}-emissao`}>
          <input
            id={`${idBase}-emissao`}
            type="date"
            value={toDateInput(orc.dataEmissao)}
            onChange={(e) => orc.setDataEmissao(fromDateInput(e.target.value))}
            className={`${INPUT_TINTA} min-h-[24px]`}
          />
        </CampoTinta>
        <CampoTinta rotulo="Válido até" htmlFor={`${idBase}-validade`} erro={orc.errors.validade}>
          <input
            id={`${idBase}-validade`}
            type="date"
            value={toDateInput(orc.dataValidade)}
            onChange={(e) => orc.setDataValidade(fromDateInput(e.target.value))}
            className={`${INPUT_TINTA} min-h-[24px]`}
          />
        </CampoTinta>
      </div>

      <div className="rounded-2xl bg-card border border-ink/10 px-4 py-3.5 flex flex-col gap-3">
        <Interruptor
          ligado={orc.jaTeveAvaliacao}
          onMudar={orc.setJaTeveAvaliacao}
          rotulo="Já teve avaliação"
          descricao="A data sai no PDF, junto do nome da paciente."
        />
        {orc.jaTeveAvaliacao && (
          <CampoTinta
            rotulo="Data da avaliação"
            htmlFor={`${idBase}-avaliacao`}
            erro={orc.errors.avaliacao}
            className="max-w-[220px]"
          >
            <input
              id={`${idBase}-avaliacao`}
              type="date"
              value={toDateInput(orc.dataAvaliacao)}
              onChange={(e) => orc.setDataAvaliacao(fromDateInput(e.target.value))}
              className={`${INPUT_TINTA} min-h-[24px]`}
            />
          </CampoTinta>
        )}
      </div>
    </div>

    <div className="space-y-2">
      <SectionHeader icon={<MessageSquare className="w-4 h-4" />}>Mensagem de abertura</SectionHeader>
      <CampoTinta rotulo="O texto que abre o orçamento" htmlFor={`${idBase}-apresentacao`}>
        <textarea
          id={`${idBase}-apresentacao`}
          value={orc.textoApresentacao}
          onChange={(e) => {
            orc.setTextoApresentacao(e.target.value);
            orc.setTextoEditadoManualmente(true);
          }}
          rows={3}
          className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
        />
      </CampoTinta>
      {!orc.textoEditadoManualmente && (
        <p className="px-1 text-[13px] text-ink-soft">
          Sugestão automática — acompanha o nome da paciente até você editar.
        </p>
      )}
    </div>
  </>
);

/** Os procedimentos e produtos, o desconto, os totais e o custo de material (interno). */
export const SecaoItensDoOrcamento: React.FC<{
  orc: OrcamentoEmEdicao;
  procedures: Procedure[];
  clinic: ClinicProfile;
}> = ({ orc, procedures, clinic }) => {
  const { itens, totais } = orc;
  return (
    <>
      <div className="space-y-3">
        <SectionHeader icon={<Sparkles className="w-4 h-4" />}>
          Procedimentos e produtos ({itens.length})
        </SectionHeader>

        {orc.errors.itens && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {orc.errors.itens}
          </AvisoTinta>
        )}

        <div className="space-y-3">
          {itens.map((item, index) => (
            <QuoteItemEditor
              key={item.id}
              item={item}
              index={index}
              total={itens.length}
              professionals={orc.professionals}
              onChange={orc.updateItem}
              onRemove={() => orc.removeItem(item.id)}
              onMove={(direction) => orc.moveItem(index, direction)}
              produtos={orc.produtos}
              linhasDoConsumo={orc.custos[item.id] || []}
              onAlternarConsumo={(marcado) => orc.alternarConsumoDoItem(item, marcado)}
              onMudarConsumo={(linhas) => orc.mudarConsumoDoItem(item.id, linhas)}
              onRecalcularConsumo={() => orc.recalcularConsumoDoItem(item.id)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <ProcedureSearchAdd
            procedures={procedures}
            onAdd={orc.addProcedure}
            onAbrirMapa={() => orc.setMapaAberto(true)}
            areasNoMapa={orc.areasNoOrcamento.size}
          />
          <ProdutoSearchAdd produtos={orc.produtos} onAdd={orc.addProduto} />
          {orc.areasNoOrcamento.size > 0 && (
            <label className="w-full flex items-center gap-2 text-body text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={orc.mostrarMapaCorporal}
                onChange={(e) => orc.setMostrarMapaCorporal(e.target.checked)}
                className="w-4 h-4 accent-ink"
              />
              Incluir o manequim com as áreas contratadas no PDF
            </label>
          )}

          {orc.avisoDaAnamnese && (
            <p className="w-full text-body text-ok bg-ok-bg rounded-xl px-3 py-2 leading-snug flex items-start justify-between gap-2">
              <span>
                {orc.avisoDaAnamnese.quantidade}{' '}
                {orc.avisoDaAnamnese.quantidade === 1 ? 'área veio' : 'áreas vieram'} da ficha de{' '}
                {new Date(orc.avisoDaAnamnese.data).toLocaleDateString('pt-BR')}. Desmarque no mapa
                o que não entrar.
              </span>
              <button
                type="button"
                onClick={() => orc.setAvisoDaAnamnese(null)}
                className="shrink-0 underline underline-offset-2 hover:no-underline"
              >
                ok
              </button>
            </p>
          )}
          <button
            type="button"
            onClick={orc.addItemAvulso}
            className="h-10 px-4 rounded-full border border-ink/15 text-ink text-[14px] font-semibold hover:border-ink/40 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Procedimento fora do catálogo
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <SectionHeader icon={<Calculator className="w-4 h-4" />}>Desconto</SectionHeader>

        <div className="rounded-2xl bg-card border border-ink/10 px-4 py-3.5 flex flex-col gap-3">
          <Interruptor
            ligado={orc.temDescontoCombinado}
            onMudar={orc.alternarDescontoCombinado}
            rotulo="Desconto plano combinado"
            descricao={`Sugestão: ${sugerirDescontoCombinado(orc.procedimentosParaDesconto, clinic)}% para ${orc.procedimentosParaDesconto} ${
              orc.procedimentosParaDesconto === 1 ? 'procedimento' : 'procedimentos'
            }.`}
          />
          {orc.temDescontoCombinado && (
            <div className="flex items-end gap-3">
              <CampoTinta
                rotulo="Percentual"
                htmlFor="orcamento-desconto-combinado"
                sufixo={<span className="text-[14px] font-semibold text-ink-soft">%</span>}
                className="w-36"
              >
                <input
                  id="orcamento-desconto-combinado"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={orc.descontoCombinadoPercentual}
                  onChange={(e) => orc.setDescontoCombinadoPercentual(Number(e.target.value) || 0)}
                  className={`${INPUT_TINTA} tabular-nums`}
                />
              </CampoTinta>
              <p className="text-[13px] text-ink-soft pb-3">abate {formatBRL(totais.descontoCombinadoValor)}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-ink/10 p-4 space-y-1.5 text-[14px] tabular-nums">
          <div className="flex justify-between text-ink-soft">
            <span>Subtotal</span>
            <span>{formatBRL(totais.subtotal)}</span>
          </div>
          {orc.temDescontoCombinado && totais.descontoCombinadoValor > 0 && (
            <div className="flex justify-between text-ink-soft">
              <span>Desconto plano combinado ({orc.descontoCombinadoPercentual}%)</span>
              <span>− {formatBRL(totais.descontoCombinadoValor)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 mt-1 border-t border-ink/8 text-ink font-bold">
            <span>Total</span>
            <span className="text-[17px]">{formatBRL(totais.total)}</span>
          </div>
          {totais.descontoEfetivoPercentual > 0 && (
            <p className="text-[13px] text-ink-soft pt-1">
              Desconto efetivo de {totais.descontoEfetivoPercentual.toFixed(1).replace('.', ',')}% sobre
              os valores de tabela
            </p>
          )}
        </div>
      </div>

      {/* Seção interna — custo de material. Nunca vai para o documento do orçamento. */}
      <CustoDeMaterialDoOrcamento
        itens={itens}
        custos={orc.custos}
        produtos={orc.produtos}
        totalDoOrcamento={totais.total}
        onChange={orc.mudarConsumoDoItem}
        onRecalcular={orc.recalcularConsumoDoItem}
      />
    </>
  );
};

/** As formas de pagamento, a negociação e as observações. */
export const SecaoPagamentoDoOrcamento: React.FC<{ orc: OrcamentoEmEdicao }> = ({ orc }) => (
  <div className="space-y-4">
    <SectionHeader icon={<CreditCard className="w-4 h-4" />}>
      Formas de pagamento ({orc.opcoesPagamento.length})
    </SectionHeader>

    <p className="text-[13px] text-ink-soft -mt-2">
      A primeira forma é a principal — dá o valor do bloco preto no PDF. As demais aparecem como
      alternativas, ex.: cartão parcelado com Pix à vista com desconto ao lado.
    </p>

    <div className="space-y-3">
      {orc.opcoesPagamento.map((opcao, index) => {
        const resultado = orc.totais.opcoesPagamento[index];
        return (
          <QuotePaymentOptionEditor
            key={opcao.id}
            opcao={opcao}
            valorFinal={resultado?.valorFinal ?? 0}
            parcela={resultado?.parcela ?? null}
            principal={index === 0}
            podeRemover={orc.opcoesPagamento.length > 1}
            onChange={orc.updateOpcaoPagamento}
            onRemove={() => orc.removeOpcaoPagamento(opcao.id)}
          />
        );
      })}
    </div>

    <button
      type="button"
      onClick={orc.addOpcaoPagamento}
      className="h-10 px-4 rounded-full border border-ink/15 text-ink text-[14px] font-semibold hover:border-ink/40 transition-colors flex items-center gap-1.5"
    >
      <Plus className="w-4 h-4" />
      Adicionar forma de pagamento
    </button>

    <CampoTinta rotulo="Negociação (opcional)" htmlFor="orcamento-negociacao">
      <textarea
        id="orcamento-negociacao"
        value={orc.negociacao}
        onChange={(e) => orc.setNegociacao(e.target.value)}
        rows={2}
        placeholder="Entrada de R$ 800,00 no Pix e o restante parcelado..."
        className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
      />
    </CampoTinta>

    <CampoTinta rotulo="Observações (opcional)" htmlFor="orcamento-observacoes">
      <textarea
        id="orcamento-observacoes"
        value={orc.observacoes}
        onChange={(e) => orc.setObservacoes(e.target.value)}
        rows={2}
        placeholder="Você pode iniciar por um único procedimento e incluir o outro depois..."
        className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
      />
    </CampoTinta>
  </div>
);

/**
 * O mapa do laser e a confirmação de tirar um item já ajustado. Fora de qualquer `<form>`: um
 * clique no mapa não pode disparar o submit do orçamento.
 */
export const ModaisDoOrcamento: React.FC<{
  orc: OrcamentoEmEdicao;
  procedures: Procedure[];
  clinic: ClinicProfile;
}> = ({ orc, procedures, clinic }) => {
  const confirmar = orc.confirmarRemocao;
  return (
    <>
      <LaserQuoteMapModal
        isOpen={orc.mapaAberto}
        onClose={() => orc.setMapaAberto(false)}
        procedures={procedures}
        clinic={clinic}
        selecionadas={orc.areasNoOrcamento}
        onToggle={orc.alternarAreaDoLaser}
      />

      <ConfirmDialog
        pedido={
          confirmar
            ? {
                titulo: `Remover ${nomeCurtoDaArea(confirmar.titulo)} do orçamento?`,
                mensagem:
                  'Este item já foi ajustado — desconto, número de sessões ou cálculo por consumo. Removê-lo ' +
                  'descarta esses ajustes, e eles não voltam ao marcar a área de novo.',
                textoConfirmar: 'Remover mesmo assim',
                onConfirmar: () => {
                  orc.removeItem(confirmar.id);
                  orc.setConfirmarRemocao(null);
                },
              }
            : null
        }
        onFechar={() => orc.setConfirmarRemocao(null)}
      />
    </>
  );
};
