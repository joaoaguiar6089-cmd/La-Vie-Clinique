import { AppView } from '../types';

/**
 * As três abas da tela Fichas — anamnese (o histórico de saúde), avaliação (antes do
 * procedimento) e relatório (depois do atendimento).
 *
 * Continuam sendo três telas para o app, mas no menu viraram um item só, "Fichas": o trilho do
 * computador e do tablet e o "Mais" do celular acendem esse item em qualquer uma das três.
 */
export type AbaDasFichas = Extract<AppView, 'anamnesis' | 'evaluations' | 'acompanhamento'>;

export const ehAbaDasFichas = (view: AppView): view is AbaDasFichas =>
  view === 'anamnesis' || view === 'evaluations' || view === 'acompanhamento';
