import React from 'react';
import { createRoot } from 'react-dom/client';
import '@ant-design/v5-patch-for-react-19';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AuthGate from './AuthGate';
import DatabaseWorkspace from './DatabaseWorkspace.jsx';
import ThemeBridge from './components/ThemeBridge';
import './styles.css';
import './antd-ui.css';
import './ui-polish.css';
import './rfq-detail-theme.css';
import './tab-theme.css';

createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN} theme={{
    components: { Tabs: { horizontalItemGutter: 32, horizontalItemPadding: '16px 0', inkBarColor: '#1677ff', itemSelectedColor: '#1677ff', titleFontSize: 14 } },
    token: {
      colorPrimary: '#1677ff',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif",
    },
  }}><AntApp><ThemeBridge><AuthGate loginAccounts={[]}><DatabaseWorkspace/></AuthGate></ThemeBridge></AntApp></ConfigProvider>
);
