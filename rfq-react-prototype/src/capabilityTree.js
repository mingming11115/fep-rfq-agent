const belongsTo = (record, buId) => (record.buId || 'BU-DEMO') === buId;
const matchesFilter = (value, selected, allLabel) => !selected || selected === allLabel || value === selected;
const matchesQuery = (record, query) => Object.values(record).filter(value => typeof value === 'string').join(' ').toLowerCase().includes(query);

export function buildCapabilityTree({ buId, buName, models = [], processes = [], capabilities = [], filters = {} }) {
  const query = (filters.query || '').trim().toLowerCase();
  const scopedProcesses = processes.filter(record => belongsTo(record, buId));
  const scopedCapabilities = capabilities.filter(record => belongsTo(record, buId));
  const latestModels = new Map();
  for (const record of models.filter(record => belongsTo(record, buId))) {
    const previous = latestModels.get(record.id);
    if (!previous || (record.version || 1) > (previous.version || 1)) latestModels.set(record.id, record);
  }
  const capabilityFilters = (filters.source && filters.source !== '全部来源') || (filters.status && filters.status !== '全部状态');
  const children = [...latestModels.values()].flatMap(model => {
    if (!matchesFilter(model.series, filters.series, '全部产品系列') || !matchesFilter(model.lifecycle, filters.lifecycle, '全部生命周期')) return [];
    const modelMatches = !query || matchesQuery(model, query);
    const modelProcesses = scopedProcesses.filter(process => process.modelId === model.id);
    const modelCapabilities = scopedCapabilities.filter(capability => capability.modelId === model.id
      && matchesFilter(capability.source, filters.source, '全部来源') && matchesFilter(capability.status, filters.status, '全部状态'));
    const capabilityNode = (record, processId) => ({ key: `capability:${record.id}:${record.version}`, kind: 'capability', label: record.metric, record, modelId: model.id, processId, children: [] });
    const processNodes = modelProcesses.flatMap(process => {
      const processMatches = modelMatches || matchesQuery(process, query);
      const children = modelCapabilities.filter(capability => capability.processId === process.id && (processMatches || matchesQuery(capability, query))).map(record => capabilityNode(record, process.id));
      if ((!processMatches || capabilityFilters) && !children.length) return [];
      return [{ key: `process:${process.id}`, kind: 'process', label: `${process.code} ${process.name}`, record: process, modelId: model.id, processId: process.id, children }];
    });
    const unassignedMatches = modelMatches || '待关联工艺'.includes(query);
    const unassigned = modelCapabilities.filter(capability => !modelProcesses.some(process => process.id === capability.processId)
      && (unassignedMatches || matchesQuery(capability, query))).map(record => capabilityNode(record, 'unassigned'));
    if (unassigned.length) processNodes.push({ key: `unassigned:${model.id}`, kind: 'unassigned', label: '待关联工艺', modelId: model.id, processId: 'unassigned', children: unassigned });
    if ((!modelMatches || capabilityFilters) && !processNodes.length) return [];
    return [{ key: `model:${model.id}`, kind: 'model', label: `${model.name} · ${model.revision}`, record: model, modelId: model.id, children: processNodes }];
  });
  return { key: `bu:${buId}`, kind: 'bu', label: buName || buId, children };
}

export function findCapabilityTreeNode(root, key) {
  if (!root) return null;
  if (root.key === key) return root;
  for (const child of root.children) {
    const found = findCapabilityTreeNode(child, key);
    if (found) return found;
  }
  return null;
}

export function resolveCapabilityTreeSelection(root, key) {
  const selected = findCapabilityTreeNode(root, key);
  if (selected) return selected;
  for (const model of root.children) {
    for (const process of model.children) {
      if (process.children.length) return process.children[0];
    }
  }
  return root.children[0] || root;
}
