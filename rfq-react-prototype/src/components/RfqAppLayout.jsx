import React, { useEffect, useRef, useState } from 'react';
import useContentTransition from './useContentTransition';
import { Avatar, Badge, Button, Grid, Select, Space, Tag, Tooltip, theme } from 'antd';
import { PageContainer, ProLayout } from '@ant-design/pro-components';
import { Bell, HelpCircle, Search } from "./icons";

export default function RfqAppLayout({ navigation, activeNav, icons, collapsed, onCollapse, onNavigate, onHome,
  onSearch, onHelp, pending, identity, identities, actorName, onIdentityChange, pageTitle, isDetail,
  contentKey, body, footer, children }) {
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const compact = !screens.sm;
  const mobile = !screens.md;
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  useEffect(() => { setMobileCollapsed(true); }, [mobile]);
  useEffect(() => { if (isDetail) { onCollapse(true); setMobileCollapsed(true); } }, [isDetail, contentKey, onCollapse]);
  const contentRef = useRef(null);
  useContentTransition(contentRef, contentKey, { kind: 'page' });
  const menu = navigation.map(item => {
    const Icon = item.page === 'knowledge' ? icons.knowledge : icons[item.key] || icons[item.page];
    return { path: '/' + item.key, key: item.key, name: item.label, targetPage: item.page,
      icon: Icon ? <Icon size={18}/> : undefined };
  });
  return <div className="rfq-pro-shell">
    <ProLayout className="rfq-pro-layout" title="FEP RFQ" logo={<span className="brand-mark">F</span>}
      layout="mix" splitMenus={false} fixSiderbar fixedHeader headerHeight={64} siderWidth={218} breakpoint={isDetail ? false : undefined}
      collapsed={mobile ? mobileCollapsed : collapsed} onCollapse={mobile ? setMobileCollapsed : onCollapse} location={{ pathname: '/' + activeNav }}
      menuDataRender={() => menu} onMenuHeaderClick={onHome} menu={{ autoClose: false }}
      menuItemRender={(item, dom) => <button type="button" className="rfq-layout-menu-button" data-testid={'nav-' + item.key}
        onClick={event => { event.preventDefault(); onNavigate(item.targetPage); if (mobile) setMobileCollapsed(true); }}>{dom}</button>}
      menuFooterRender={() => <span className="rfq-layout-menu-footer">{collapsed ? 'RFQ' : 'FEP · RFQ 工作空间'}</span>}
      actionsRender={() => [
        compact ? null : <Tooltip key="mode" title="当前为本机演示环境，使用示例数据"><Tag className="rfq-demo-tag" bordered={false}>演示环境</Tag></Tooltip>,
        compact ? null : <Tooltip key="search" title="搜索页面和项目"><Button type="text" aria-label="搜索页面和项目" icon={<Search size={18}/>} onClick={onSearch}/></Tooltip>,
        <Tooltip key="help" title="使用指南"><Button type="text" aria-label="使用指南" icon={<HelpCircle size={18}/>} onClick={onHelp}/></Tooltip>,
        <Tooltip key="tasks" title="待办事项"><Badge count={pending} size="small"><Button type="text" aria-label="待办事项" icon={<Bell size={18}/>} onClick={() => onNavigate('tasks')}/></Badge></Tooltip>,
        <Space key="identity" size={6} className="rfq-layout-identity"><Avatar size="small" style={{ background: '#e8f0ff', color: '#1677ff' }}>{actorName?.[0]}</Avatar><Select aria-label="演示身份" value={identity} options={identities} onChange={onIdentityChange} variant="borderless" popupMatchSelectWidth={false} style={{ width: compact ? 112 : 155 }}/></Space>,
      ].filter(Boolean)} footerRender={isDetail ? false : () => footer}
      token={{ sider: { colorBgMenuItemSelected: token.colorPrimaryBg, colorTextMenuSelected: token.colorPrimary }, pageContainer: { paddingInlinePageContainerContent: 0, paddingBlockPageContainerContent: 0 } }}>
      {isDetail ? <div key={contentKey} ref={contentRef} className="rfq-layout-content rfq-layout-detail">{body}</div> :
        <PageContainer className="rfq-page-container" title={false} breadcrumb={{ items: [{ title: '工作空间' }, { title: pageTitle }] }}>
          <div key={contentKey} ref={contentRef} className="rfq-layout-content">{body}</div>
        </PageContainer>}
    </ProLayout>
    {children}
  </div>;
}
