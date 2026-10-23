export function appendAnalysisRun(runs,run){if(runs.some(item=>item.id===run.id))return runs;return [{...run},...runs];}
