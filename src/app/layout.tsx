import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: '小红书痛点洞察 - 用户评论痛点提取工具',
  description: '输入关键词，自动搜索小红书热帖，AI 深度分析评论区用户痛点，助力产品优化与市场洞察。',
  keywords: [
    '小红书',
    '痛点分析',
    '用户评论',
    '市场洞察',
    '产品优化',
    '评论分析',
  ],
  authors: [{ name: '痛点洞察' }],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
