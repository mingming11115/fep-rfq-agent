import React from 'react';
import { createRoot } from 'react-dom/client';
import '@ant-design/v5-patch-for-react-19';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import ThemeBridge from './components/ThemeBridge';
import './styles.css';
import './antd-ui.css';
import './ui-polish.css';

createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN} theme={{
    token: {
      colorPrimary: '#1677ff',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif",
    },
  }}><AntApp><ThemeBridge><App /></ThemeBridge></AntApp></ConfigProvider>
);
