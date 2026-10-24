const legacyStatuses={'待办理':'待处理','办理中':'处理中','已办理':'已处理'};
export const normalizeTaskStatus=status=>legacyStatuses[status]||status;
