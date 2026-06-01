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

    const kw = keyword.trim();

    // Strategy 1: Search for user complaints/pain points about the keyword on xiaohongshu
    const complaintResponse = await client.advancedSearch(
      `${kw} 小红书 吐槽 踩雷 避坑`,
      {
        searchType: "web",
        count: 8,
        needContent: false,
        needUrl: true,
        needSummary: true,
      }
    );

    // Strategy 2: Broader search for negative reviews and experiences
    const reviewResponse = await client.advancedSearch(
      `${kw} 差评 不好用 失望 体验`,
      {
        searchType: "web",
        count: 8,
        needContent: false,
        needUrl: true,
        needSummary: true,
      }
    );

    // Merge and deduplicate results
    const seenUrls = new Set<string>();
    const allPosts: Array<{
      id: string;
      title: string;
      url: string;
      snippet: string;
      summary: string | undefined;
      publishTime: string | undefined;
      siteName: string | undefined;
      rankScore: number | undefined;
    }> = [];

    const processItems = (items: typeof complaintResponse.web_items) => {
      for (const item of items || []) {
        const url = item.url || "";
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);
        allPosts.push({
          id: item.id || "",
          title: item.title || "",
          url: item.url || "",
          snippet: item.snippet || "",
          summary: item.summary,
          publishTime: item.publish_time,
          siteName: item.site_name,
          rankScore: item.rank_score,
        });
      }
    };

    processItems(complaintResponse.web_items);
    processItems(reviewResponse.web_items);

    return NextResponse.json({
      success: true,
      keyword: kw,
      count: allPosts.length,
      posts: allPosts,
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
    return NextResponse.json({
      success: false,
      error: message,
      keyword: "",
      count: 0,
      posts: [],
    });
  }
}
