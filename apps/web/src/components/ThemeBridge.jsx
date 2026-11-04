import React from 'react';
import { theme } from 'antd';

export default function ThemeBridge({ children }) {
  const { token } = theme.useToken();
  return <div className="rfq-theme" style={{
    color: token.colorText, fontSize: token.fontSize, fontFamily: token.fontFamily,
    '--primary': token.colorPrimary, '--primary-hover': token.colorPrimaryHover,
    '--blue': token.colorPrimary, '--color-primary': token.colorPrimary,
    '--border': token.colorBorderSecondary, '--color-border': token.colorBorderSecondary,
    '--text': token.colorText, '--color-text': token.colorText,
    '--muted': token.colorTextDescription, '--color-text-secondary': token.colorTextSecondary,
    '--text-secondary': token.colorTextSecondary, '--bg': token.colorBgLayout,
    '--surface': token.colorBgContainer,
  }}>{children}</div>;
}
