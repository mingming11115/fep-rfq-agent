import React, { useRef, useState } from 'react';
import useContentTransition from './useContentTransition';
import { Avatar, Badge, Button, Grid, Select, Space, Tag, Tooltip } from 'antd';
import { PageContainer, ProLayout } from '@ant-design/pro-components';
import { Bell, HelpCircle, Search } from 'lucide-react';

export default function RfqAppLayout({ navigation, activeNav, icons, collapsed, onCollapse, onNavigate, onHome,
  onSearch, onHelp, pending, identity, identities, actorName, onIdentityChange, pageTitle, isDetail,
  contentKey, body, footer, children }) {
  const screens = Grid.useBreakpoint();
  const compact = !screens.sm;
  const mobile = !screens.md;
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const contentRef = useRef(null);
  useContentTransition(contentRef, contentKey);
  const menu = navigation.map(item => {
    const Icon = item.page === 'knowledge' ? icons.knowledge : icons[item.key] || icons[item.page];
    return { path: '/' + item.key, key: item.key, name: item.label, targetPage: item.page,
      icon: Icon ? <Icon size={18}/> : undefined };
  });
  return <div className="rfq-pro-shell">
    <ProLayout className="rfq-pro-layout" title="FEP RFQ" logo={<span className="brand-mark">F</span>}
      layout="mix" splitMenus={false} fixSiderbar fixedHeader headerHeight={64} siderWidth={218}
      collapsed={mobile ? mobileCollapsed : collapsed} onCollapse={mobile ? setMobileCollapsed : onCollapse} location={{ pathname: '/' + activeNav }}
      menuDataRender={() => menu} onMenuHeaderClick={onHome} menu={{ autoClose: false }}
      menuItemRender={(item, dom) => <button type="button" className="rfq-layout-menu-button" data-testid={'nav-' + item.key}
        onClick={event => { event.preventDefault(); onNavigate(item.targetPage); if (mobile) setMobileCollapsed(true); }}>{dom}</button>}
      menuFooterRender={() => <span className="rfq-layout-menu-footer">{collapsed ? 'RFQ' : '交互原型 · 示例匹配'}</span>}
      actionsRender={() => [
        compact ? null : <Tag key="mode" className="rfq-demo-tag" bordered={false}>本机交互演示</Tag>,
        compact ? null : <Tooltip key="search" title="搜索页面和项目"><Button type="text" aria-label="搜索页面和项目" icon={<Search size={18}/>} onClick={onSearch}/></Tooltip>,
        <Tooltip key="help" title="使用指南"><Button type="text" aria-label="使用指南" icon={<HelpCircle size={18}/>} onClick={onHelp}/></Tooltip>,
        <Tooltip key="tasks" title="待办事项"><Badge count={pending} size="small"><Button type="text" aria-label="待办事项" icon={<Bell size={18}/>} onClick={() => onNavigate('tasks')}/></Badge></Tooltip>,
        <Space key="identity" size={6} className="rfq-layout-identity"><Avatar size="small" style={{ background: '#e8f0ff', color: '#165dff' }}>{actorName?.[0]}</Avatar><Select aria-label="演示身份" value={identity} options={identities} onChange={onIdentityChange} variant="borderless" popupMatchSelectWidth={false} style={{ width: compact ? 112 : 155 }}/></Space>,
      ].filter(Boolean)} footerRender={() => footer}
      token={{ bgLayout: '#f5f7fa', sider: { colorMenuBackground: '#ffffff', colorBgMenuItemSelected: '#e8f0ff', colorTextMenuSelected: '#165dff' }, pageContainer: { paddingInlinePageContainerContent: 0, paddingBlockPageContainerContent: 0 } }}>
      {isDetail ? <div key={contentKey} ref={contentRef} className="rfq-layout-content rfq-layout-detail">{body}</div> :
        <PageContainer className="rfq-page-container" title={false} breadcrumb={{ items: [{ title: '工作空间' }, { title: pageTitle }] }}>
          <div key={contentKey} ref={contentRef} className="rfq-layout-content">{body}</div>
        </PageContainer>}
    </ProLayout>
    {children}
  </div>;
}
