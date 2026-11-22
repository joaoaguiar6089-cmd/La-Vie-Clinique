import { AppView } from '../types';

/**
 * As abas da tela Fichas — anamnese (o histórico de saúde) e relatório (o registro de cada
 * atendimento, inclusive o da Avaliação, que deixou de ter ficha própria).
 *
 * Continuam sendo telas separadas para o app, mas no menu viraram um item só, "Fichas": o trilho
 * do computador e do tablet e o "Mais" do celular acendem esse item em qualquer uma delas.
 */
export type AbaDasFichas = Extract<AppView, 'anamnesis' | 'acompanhamento'>;

export const ehAbaDasFichas = (view: AppView): view is AbaDasFichas =>
  view === 'anamnesis' || view === 'acompanhamento';
