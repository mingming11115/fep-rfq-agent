import React from 'react';
import { createRoot } from 'react-dom/client';
import '@ant-design/v5-patch-for-react-19';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles.css';
import './antd-ui.css';

createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN} theme={{
    token: {
      colorPrimary: '#165dff', colorBgLayout: '#f5f7fa', fontSize: 14,
      borderRadius: 6, controlHeight: 34, colorText: '#1d2129',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif",
    },
    components: { Table: { headerBg: '#f7f9fc' }, Layout: { bodyBg: '#f5f7fa' } },
  }}><AntApp><App /></AntApp></ConfigProvider>
);
