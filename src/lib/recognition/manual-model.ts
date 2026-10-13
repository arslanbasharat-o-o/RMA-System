interface ReviewEntry {
  actionType: string;
  newState: unknown;
  previousState?: unknown;
}

/** Entries must be newest first. A later mark_unknown explicitly releases the correction. */
export function getManualModelOverride(entries: ReviewEntry[]) {
  for (const entry of entries) {
    if (entry.actionType === "mark_unknown") return null;
    if (!["change_model", "manual_verify", "accept_suggestion"].includes(entry.actionType)) continue;
    const state = (entry.actionType === "accept_suggestion" ? entry.previousState : entry.newState) as Record<string, unknown> | null;
    if (!state || typeof state !== "object") continue;
    const model = state.predictedModel ?? state.predicted_model;
    const manufacturer = state.predictedManufacturer ?? state.predicted_manufacturer;
    if (typeof model !== "string" || !model || typeof manufacturer !== "string" || !manufacturer) continue;
    const assembly = state.predictedDisplayAssembly ?? state.predicted_display_assembly;
    const catalogId = state.catalogDisplayId ?? state.catalog_display_id;
    return {
      predictedModel: model,
      predictedManufacturer: manufacturer,
      predictedDisplayAssembly: typeof assembly === "string" ? assembly : `${manufacturer} ${model} Display`,
      catalogDisplayId: typeof catalogId === "string" ? catalogId : null,
      modelConfidenceScore: 1,
    };
  }
  return null;
}
