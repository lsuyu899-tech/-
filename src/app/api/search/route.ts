import { NextRequest, NextResponse } from "next/server";

const TIKHUB_BASE_URL = "https://api.tikhub.io";

interface TikHubNote {
  id: string;
  title: string;
  desc: string;
  type: string;
  user?: {
    nickname: string;
    images?: string;
    red_id?: string;
  };
  liked_count?: number;
  collected_count?: number;
  comments_count?: number;
  shared_count?: number;
  images_list?: Array<{
    url?: string;
    url_size_large?: string;
    width?: number;
    height?: number;
  }>;
  xsec_token?: string;
  tag_info?: { title: string; type: string };
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

    const apiKey = request.headers.get("x-tikhub-token");
    if (!apiKey) {
      console.error("[Search API] TikHub API Token not configured");
      return NextResponse.json({
        success: false,
        error: "请先配置 TikHub API Token（点击顶部「配置 Token」按钮）",
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

    const result = await response.json();

    if (result.code !== 200) {
      console.error("[Search API] TikHub returned error:", result.message);
      return NextResponse.json({
        success: false,
        error: result.message_zh || result.message || "搜索失败",
        keyword: kw,
        count: 0,
        posts: [],
      });
    }

    // Navigate the nested data structure: result.data.data.items[].note
    let notes: TikHubNote[] = [];
    try {
      const outerData = result.data;
      if (outerData && typeof outerData === "object") {
        const innerData = outerData.data;
        if (innerData && typeof innerData === "object") {
          const items = innerData.items;
          if (Array.isArray(items)) {
            notes = items
              .filter((item: { model_type?: string; note?: TikHubNote }) => item.model_type === "note" && item.note)
              .map((item: { note: TikHubNote }) => item.note);
          }
        }
      }
    } catch (e) {
      console.error("[Search API] Failed to parse TikHub data structure:", e);
    }

    // Transform notes to our Post format
    const posts = notes.map((note) => ({
      id: note.id || "",
      title: note.title || note.desc?.slice(0, 50) || "无标题",
      desc: note.desc || "",
      coverUrl: note.images_list?.[0]?.url_size_large || note.images_list?.[0]?.url || "",
      type: note.type || "",
      nickname: note.user?.nickname || "匿名用户",
      avatarUrl: note.user?.images || "",
      likedCount: String(note.liked_count || 0),
      collectedCount: String(note.collected_count || 0),
      commentCount: String(note.comments_count || 0),
      shareCount: String(note.shared_count || 0),
      xsecToken: note.xsec_token || "",
      noteId: note.id || "",
      tags: note.tag_info?.title ? [note.tag_info.title] : [],
    }));

    return NextResponse.json({
      success: true,
      keyword: kw,
      count: posts.length,
      posts,
    });
  } catch (error) {
    console.error("[Search API] Error:", error);
    return NextResponse.json({
      success: false,
      error: "搜索失败，请稍后重试",
      keyword: "",
      count: 0,
      posts: [],
    });
  }
}
