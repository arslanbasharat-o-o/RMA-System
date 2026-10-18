/** Exact identity scoring; part compatibility and substring overlap are not identity. */
export function sameDeviceIdentity(
  expectedManufacturer: string, expectedModel: string,
  actualManufacturer: string | null | undefined, actualModel: string | null | undefined
): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");
  const manufacturer = (s: string) => normalize(s) === "googlepixel" ? "google" : normalize(s);
  const device = (mfg: string, model: string) => {
    let value = normalize(model);
    const prefix = manufacturer(mfg);
    if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length);
    if (prefix === "samsung") value = value.replace(/^galaxy/, "");
    return value;
  };
  if (!actualManufacturer?.trim() || !actualModel?.trim() || !expectedManufacturer.trim() || !expectedModel.trim()) return false;
  return manufacturer(expectedManufacturer) === manufacturer(actualManufacturer) &&
    device(expectedManufacturer, expectedModel) === device(actualManufacturer, actualModel);
}

export function percentile(values: number[], percentile: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * percentile) - 1)];
}
