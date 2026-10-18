export interface ModelResultFields {
  predictedModel?: string | null;
  predictedDisplayAssembly?: string | null;
}

function isUnidentifiedLabel(value?: string | null) {
  const normalized = value?.trim();
  return !normalized || /^(?:unidentified|unknown|pending identification)\b/i.test(normalized);
}

export function hasModelSuggestion(item: ModelResultFields) {
  return !isUnidentifiedLabel(item.predictedModel) || !isUnidentifiedLabel(item.predictedDisplayAssembly);
}
