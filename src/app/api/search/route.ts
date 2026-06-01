import { NextRequest, NextResponse } from "next/server";
import { SearchClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { keyword } = await request.json();

    if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "请输入有效的关键词" },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new SearchClient(config, customHeaders);

    // Search Xiaohongshu for hot posts in the last 3 days
    const response = await client.advancedSearch(
      `${keyword.trim()} 小红书 评论`,
      {
        searchType: "web",
        count: 10,
        sites: "xiaohongshu.com",
        timeRange: "3d",
        needContent: true,
        needUrl: true,
        needSummary: true,
      }
    );

    const posts = (response.web_items || []).map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      summary: item.summary,
      content: item.content,
      publishTime: item.publish_time,
      siteName: item.site_name,
      rankScore: item.rank_score,
    }));

    return NextResponse.json({
      success: true,
      keyword: keyword.trim(),
      count: posts.length,
      posts,
    });
  } catch (error) {
    console.error("[Search API Error]", error);
    const isQuotaError =
      error instanceof Error &&
      (error.message.includes("ErrBalanceOverdue") ||
        error.message.includes("Forbidden"));
    const message = isQuotaError
      ? "搜索服务暂时不可用，请稍后重试"
      : "搜索失败，请稍后重试";
    // Return 200 with success:false so frontend can show friendly error
    // instead of triggering HTTP error handling
    return NextResponse.json({
      success: false,
      error: message,
      keyword: "",
      count: 0,
      posts: [],
    });
  }
}
