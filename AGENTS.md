# 项目上下文

## 项目简介

小红书痛点洞察 - 一款用于从小红书评论区提取用户痛点的网页应用。支持关键词搜索小红书帖子，抓取评论内容，AI 深度分析用户痛点。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **SDK**: coze-coding-dev-sdk (Web Search / Fetch URL / LLM)

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── search/route.ts       # 小红书帖子搜索 API
│   │   │   ├── fetch-comments/route.ts # 帖子评论抓取 API
│   │   │   └── analyze/route.ts       # AI 痛点分析 API (SSE 流式)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                  # 主页面 (搜索/结果/痛点展示)
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/
│   ├── lib/utils.ts
│   └── server.ts
├── DESIGN.md               # 设计规范
├── AGENTS.md               # 本文件
├── next.config.ts
├── package.json
└── tsconfig.json
```

## 核心功能流程

1. **搜索**: 用户输入关键词 → `/api/search` 调用 `SearchClient.advancedSearch` 搜索小红书近3天热帖
2. **抓取**: 点击分析 → `/api/fetch-comments` 调用 `FetchClient.fetch` 抓取帖子页面内容
3. **分析**: `/api/analyze` 调用 `LLMClient.stream` 流式输出痛点分析结果
4. **展示**: 前端解析流式 JSON，结构化展示痛点分类、严重程度、用户原话和改进建议

## API 接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/search` | POST | 搜索小红书帖子，参数: `{ keyword: string }` |
| `/api/fetch-comments` | POST | 抓取帖子内容，参数: `{ urls: string[] }` |
| `/api/analyze` | POST | AI 痛点分析 (SSE)，参数: `{ keyword: string, comments: string }` |

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；禁止隐式 `any` 和 `as any`
- SDK 调用必须在后端代码中使用，严禁前端暴露 API 密钥
- 所有 SDK 客户端必须使用 `HeaderUtils.extractForwardHeaders` 传递请求头

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random()
2. 必须使用 'use client' + useEffect + useState 确保客户端渲染
3. 禁止非法 HTML 嵌套

## 构建与测试

- 开发: `pnpm dev`
- 构建: `pnpm build`
- 类型检查: `pnpm ts-check`
- Lint: `pnpm lint`
