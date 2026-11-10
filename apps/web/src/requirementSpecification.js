export function readRequirementSpecification(metricsJson) {
  if (!metricsJson) { return null; }
  try {
    const {specification} = JSON.parse(metricsJson) ?? {};
    return typeof specification === 'string' ? specification.trim() || null : null;
  } catch {
    return null;
  }
}
