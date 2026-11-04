import React from 'react';
import { ArrowRight, GitBranch, Clock3 } from "./icons";
import { getReviewRoute } from '../rfqWorkflow';
export default function ApprovalRoute({ requirement, config, review }) {
  const route = getReviewRoute(requirement, config);
  const overdue = review?.deadline && !['已关闭', '已完成'].includes(review.status) && new Date(`${review.deadline}T23:59:59`).getTime() < Date.now();
  return <div className="rfq-route"><div className="rfq-section-title"><GitBranch size={15}/><strong>审批路径</strong><span>{route.rule}</span></div><p>{route.reasons.join(' · ')}</p><div className="rfq-route-steps"><span><small>专业处理</small><b>{review?.owner || route.owner || '未配置'}</b></span><ArrowRight size={15}/><span><small>独立批准</small><b>{route.approver || '未配置'}</b></span><ArrowRight size={15}/><span><small>结果回填</small><b>条目应答确认</b></span></div>{review && <div className={overdue ? 'rfq-deadline overdue' : 'rfq-deadline'}><Clock3 size={13}/>{review.status} · 截止 {review.deadline || '未设置'}{overdue && ' · 已逾期'}</div>}</div>;
}
