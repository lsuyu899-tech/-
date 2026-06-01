import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { keyword, comments } = await request.json();

    if (!keyword || typeof keyword !== "string") {
      return new Response(
        JSON.stringify({ error: "请提供关键词" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!comments || typeof comments !== "string" || comments.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "没有可分析的内容" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一位资深的小红书内容策略师，擅长从社交媒体评论中挖掘用户痛点，并将其转化为可执行的小红书内容创作方向。

请根据以下小红书帖子及其评论内容，围绕关键词「${keyword.trim()}」，识别用户痛点并给出创作建议。

请严格按照以下 JSON 格式输出分析结果（不要输出其他内容）：

{
  "overview": "一句话概述用户痛点整体情况",
  "painPoints": [
    {
      "category": "痛点分类名称",
      "severity": "high/medium/low",
      "description": "痛点详细描述",
      "evidence": "来自评论的具体证据/原话摘要",
      "frequency": "该痛点出现的频率估算（如：频繁、偶尔、较少）"
    }
  ],
  "suggestions": ["基于痛点的小红书内容创作建议1", "基于痛点的小红书内容创作建议2"]
}

要求：
1. 每个痛点必须有具体的评论证据支撑
2. severity 判断标准：high=严重影响用户体验，medium=有一定影响，low=轻微不便
3. 按严重程度从高到低排序
4. 至少识别3个核心痛点
5. suggestions 必须围绕痛点给出小红书内容创作建议，包括：选题方向、标题写法、内容切入角度、如何击中用户情绪等，目的是帮助创作者产出更能引起共鸣、更贴近用户痛点的小红书帖子`;

    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `以下是小红书上关于「${keyword.trim()}」的帖子评论内容，请进行痛点分析：\n\n${comments}`,
      },
    ];

    // Use streaming for real-time output
    const stream = client.stream(messages, {
      model: "doubao-seed-2-0-lite-260215",
      temperature: 0.3,
    });

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
              );
            }
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
          );
          controller.close();
        } catch (err) {
          console.error("[Stream Error]", err);
          const errMsg =
            err instanceof Error && err.message.includes("ErrBalanceOverdue")
              ? "AI 分析服务暂时不可用，请稍后重试"
              : "分析过程中出现错误";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errMsg })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Analyze API Error]", error);
    const message =
      error instanceof Error && error.message.includes("ErrBalanceOverdue")
        ? "AI 分析服务暂时不可用，请稍后重试"
        : "分析失败，请稍后重试";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
