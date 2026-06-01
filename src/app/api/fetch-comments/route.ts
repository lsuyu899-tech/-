import { NextRequest, NextResponse } from "next/server";

const TIKHUB_BASE_URL = "https://api.tikhub.io";

interface TikHubComment {
  id: string;
  content: string;
  like_count: number;
  sub_comment_count: number;
  ip_location?: string;
  user?: {
    nickname: string;
    userid?: string;
  };
  sub_comments?: TikHubComment[];
}

interface TikHubNoteDetail {
  title?: string;
  desc?: string;
  type?: string;
  user?: {
    nickname?: string;
  };
  liked_count?: number;
  comments_count?: number;
}

function getApiKey(): string | undefined {
  return process.env.TIKHUB_API_TOKEN;
}

async function fetchNoteDetail(
  noteId: string,
  apiKey: string
): Promise<{ title: string; desc: string } | null> {
  try {
    const url = `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/app_v2/get_image_note_detail?note_id=${encodeURIComponent(noteId)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (result.code !== 200 || !result.data) return null;

    const data = result.data;
    const noteData = data.data || data;
    return {
      title: noteData.title || "",
      desc: noteData.desc || "",
    };
  } catch (e) {
    console.error("[FetchComments] Note detail error:", e);
    return null;
  }
}

async function fetchNoteComments(
  noteId: string,
  apiKey: string,
  maxComments: number = 50
): Promise<string[]> {
  const allComments: string[] = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore && allComments.length < maxComments) {
    try {
      const params = new URLSearchParams({
        note_id: noteId,
        cursor: cursor,
      });

      const url = `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/app_v2/get_note_comments?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) break;

      const result = await response.json();
      if (result.code !== 200 || !result.data) break;

      const data = result.data;
      const innerData = data.data || data;
      const comments: TikHubComment[] = innerData.comments || [];

      for (const comment of comments) {
        if (allComments.length >= maxComments) break;

        const nickname = comment.user?.nickname || "匿名用户";
        const location = comment.ip_location ? `（${comment.ip_location}）` : "";
        allComments.push(`${nickname}${location}：${comment.content}`);

        // Also include sub-comments (replies)
        if (comment.sub_comments && comment.sub_comments.length > 0) {
          for (const sub of comment.sub_comments) {
            if (allComments.length >= maxComments) break;
            const subNickname = sub.user?.nickname || "匿名用户";
            allComments.push(`  └ ${subNickname}：${sub.content}`);
          }
        }
      }

      hasMore = innerData.has_more === true;
      cursor = String(innerData.cursor || "");
      if (!cursor) hasMore = false;
    } catch (e) {
      console.error("[FetchComments] Comment fetch error:", e);
      break;
    }
  }

  return allComments;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteIds } = body;

    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供笔记ID列表" },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "TikHub API Token 未配置，请在环境变量中设置 TIKHUB_API_TOKEN",
        total: noteIds.length,
        fetched: 0,
        results: [],
      });
    }

    const results: Array<{
      noteId: string;
      title: string;
      content: string;
      commentCount: number;
      status: string;
    }> = [];

    for (const noteId of noteIds) {
      try {
        // Fetch note detail
        const detail = await fetchNoteDetail(noteId, apiKey);

        // Fetch comments
        const comments = await fetchNoteComments(noteId, apiKey, 50);

        const title = detail?.title || "";
        const desc = detail?.desc || "";
        const combinedContent = [desc, "--- 评论区 ---", ...comments]
          .filter(Boolean)
          .join("\n");

        results.push({
          noteId,
          title,
          content: combinedContent,
          commentCount: comments.length,
          status: "success",
        });
      } catch (e) {
        console.error(`[FetchComments] Error fetching note ${noteId}:`, e);
        results.push({
          noteId,
          title: "",
          content: "",
          commentCount: 0,
          status: "failed",
        });
      }
    }

    const fetched = results.filter((r) => r.status === "success").length;

    return NextResponse.json({
      success: true,
      total: noteIds.length,
      fetched,
      results,
    });
  } catch (error) {
    console.error("[FetchComments API] Error:", error);
    return NextResponse.json({
      success: false,
      error: "评论抓取失败，请稍后重试",
      total: 0,
      fetched: 0,
      results: [],
    });
  }
}
