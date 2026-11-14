// 项目阶段文案：接口与数据库中仍以英文枚举传递，界面统一从这里取中文名。
export const PROJECT_STAGE_LABELS = {
  DRAFT: '待上传',
  PARSING: '解析比对中',
  REVIEWING: '评审确认中',
  APPROVED: '审批完成',
  EXPORTED: '已导出',
  CANCELLED: '已删除',
};

// 看板展示顺序：CANCELLED 属于归档项目，不进活动项目阶段分布。
export const PROJECT_STAGE_ORDER = [
  PROJECT_STAGE_LABELS.DRAFT,
  PROJECT_STAGE_LABELS.PARSING,
  PROJECT_STAGE_LABELS.REVIEWING,
  PROJECT_STAGE_LABELS.APPROVED,
  PROJECT_STAGE_LABELS.EXPORTED,
];
