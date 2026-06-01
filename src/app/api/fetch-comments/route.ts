import { NextRequest, NextResponse } from "next/server";
import { FetchClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供有效的URL列表", total: 0, fetched: 0, results: [] },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new FetchClient(config, customHeaders);

    // Fetch content from all URLs in parallel (limit to top 5 to avoid timeout)
    const targetUrls = urls.slice(0, 5);
    const fetchPromises = targetUrls.map(async (url: string) => {
      try {
        const response = await client.fetch(url);
        const textContent = (response.content || [])
          .filter((item) => item.type === "text" && "text" in item && item.text)
          .map((item) => item.text as string)
          .join("\n");

        return {
          url,
          title: response.title || "",
          content: textContent,
          status: textContent.length > 50 ? "success" : "failed",
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
      total: targetUrls.length,
      fetched: successResults.length,
      results,
    });
  } catch (error) {
    console.error("[Fetch Comments API Error]", error);
    const isQuotaError =
      error instanceof Error &&
      (error.message.includes("ErrBalanceOverdue") ||
        error.message.includes("Forbidden"));
    const message = isQuotaError
      ? "抓取服务暂时不可用，请稍后重试"
      : "抓取评论失败，请稍后重试";
    return NextResponse.json({
      success: false,
      error: message,
      total: 0,
      fetched: 0,
      results: [],
    });
  }
}
