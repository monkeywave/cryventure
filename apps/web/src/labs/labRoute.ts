import type { Messages, PrimitiveManifest } from '@cryventure/core';

export interface LabRouteTexts {
  title: string;
  /** The producer's optional `<i18nNamespace>.description`; `undefined` when its catalog has none. */
  description: string | undefined;
}

/** Title (from `titleKey`) and description of a producer's standalone lab page, from the lab's messages. */
export function labRouteTexts(producer: Pick<PrimitiveManifest, 'id' | 'titleKey' | 'i18nNamespace'>, messages: Messages): LabRouteTexts {
  return { title: messages[producer.titleKey] ?? producer.id, description: messages[`${producer.i18nNamespace}.description`] };
}
