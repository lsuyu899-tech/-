import { NextRequest, NextResponse } from "next/server";

const TIKHUB_BASE_URL = "https://api.tikhub.io";

interface TikHubNote {
  note_id: string;
  title: string;
  desc: string;
  type: string;
  user?: {
    nickname: string;
    avatar?: string;
    user_id?: string;
  };
  interact_info?: {
    liked_count?: string;
    cover_cover_url?: string;
    collected_count?: string;
    comment_count?: string;
    share_count?: string;
  };
  cover?: {
    url?: string;
    url_default?: string;
  };
  xsec_token?: string;
  model_type?: string;
  tag_list?: Array<{ id: string; name: string; type: string }>;
}

interface TikHubSearchResponse {
  code: number;
  message: string;
  message_zh: string;
  data: string; // JSON string containing search results
  request_id: string;
}

export async function POST(request: NextRequest) {
  try {
    const { keyword } = await request.json();

    if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "请输入有效的关键词" },
        { status: 400 }
      );
    }

    const apiKey = process.env.TIKHUB_API_TOKEN;
    if (!apiKey) {
      console.error("[Search API] TIKHUB_API_TOKEN not configured");
      return NextResponse.json({
        success: false,
        error: "TikHub API Token 未配置，请在环境变量中设置 TIKHUB_API_TOKEN",
        keyword: "",
        count: 0,
        posts: [],
      });
    }

    const kw = keyword.trim();

    // Search with popularity sorting to get hot posts
    const params = new URLSearchParams({
      keyword: kw,
      page: "1",
      sort_type: "popularity_descending",
      note_type: "普通笔记",
      time_filter: "一周内",
    });

    const response = await fetch(
      `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/app_v2/search_notes?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[Search API] TikHub request failed: ${response.status} ${errorText.slice(0, 200)}`
      );

      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({
          success: false,
          error: "TikHub API Token 无效或已过期，请检查配置",
          keyword: kw,
          count: 0,
          posts: [],
        });
      }

      return NextResponse.json({
        success: false,
        error: `搜索服务暂时不可用 (${response.status})`,
        keyword: kw,
        count: 0,
        posts: [],
      });
    }

    const result: TikHubSearchResponse = await response.json();

    if (result.code !== 200 || !result.data) {
      console.error("[Search API] TikHub returned error:", result.message);
      return NextResponse.json({
        success: false,
        error: result.message_zh || result.message || "搜索失败",
        keyword: kw,
        count: 0,
        posts: [],
      });
    }

    // Parse the data field (it's a JSON string)
    let searchData: { items?: TikHubNote[]; search_id?: string; search_session_id?: string };
    try {
      searchData = JSON.parse(result.data);
    } catch {
      console.error("[Search API] Failed to parse TikHub data field");
      return NextResponse.json({
        success: false,
        error: "搜索结果解析失败",
        keyword: kw,
        count: 0,
        posts: [],
      });
    }

    const notes = searchData.items || [];

    // Transform notes to our Post format
    const posts = notes.map((note) => ({
      id: note.note_id || "",
      title: note.title || note.desc?.slice(0, 50) || "无标题",
      desc: note.desc || "",
      coverUrl: note.cover?.url || note.cover?.url_default || "",
      type: note.type || "",
      nickname: note.user?.nickname || "匿名用户",
      likedCount: note.interact_info?.liked_count || "0",
      collectedCount: note.interact_info?.collected_count || "0",
      commentCount: note.interact_info?.comment_count || "0",
      shareCount: note.interact_info?.share_count || "0",
      xsecToken: note.xsec_token || "",
      noteId: note.note_id || "",
      tags: (note.tag_list || []).map((t) => t.name).filter(Boolean),
    }));

    return NextResponse.json({
      success: true,
      keyword: kw,
      count: posts.length,
      posts,
      searchId: searchData.search_id || "",
      searchSessionId: searchData.search_session_id || "",
    });
  } catch (error) {
    console.error("[Search API Error]", error);
    return NextResponse.json({
      success: false,
      error: "搜索失败，请稍后重试",
      keyword: "",
      count: 0,
      posts: [],
    });
  }
}
