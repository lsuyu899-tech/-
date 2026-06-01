import { NextRequest, NextResponse } from "next/server";
import { FetchClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "请提供有效的帖子URL列表" },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new FetchClient(config, customHeaders);

    // Fetch content from all URLs in parallel
    const fetchPromises = urls.map(async (url: string) => {
      try {
        const response = await client.fetch(url);
        const textContent = (response.content || [])
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");

        return {
          url,
          title: response.title,
          content: textContent,
          status: response.status_code === 0 ? "success" : "failed",
        };
      } catch (err) {
        console.error(`[Fetch Error] ${url}:`, err);
        return {
          url,
          title: "",
          content: "",
          status: "failed",
        };
      }
    });

    const results = await Promise.all(fetchPromises);
    const successResults = results.filter((r) => r.status === "success");

    return NextResponse.json({
      success: true,
      total: urls.length,
      fetched: successResults.length,
      results,
    });
  } catch (error) {
    console.error("[Fetch Comments API Error]", error);
    const message =
      error instanceof Error && error.message.includes("ErrBalanceOverdue")
        ? "抓取服务暂时不可用，请稍后重试"
        : "抓取评论失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
