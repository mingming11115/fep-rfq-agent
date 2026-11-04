import React from 'react';
import {Space,Typography} from 'antd';
import './admin-management.css';
export default function AdminPageHeader({title,description,actions}){
 return <header className="admin-page-header"><div className="admin-page-heading"><Typography.Title level={2}>{title}</Typography.Title>{description&&<Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}</div>{actions&&<Space wrap className="admin-page-actions">{actions}</Space>}</header>;
}
