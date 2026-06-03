import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

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

function getApiKey(request?: NextRequest): string | undefined {
  return request?.headers.get("x-tikhub-token") || undefined;
}

async function fetchNoteComments(
  noteId: string,
  apiKey: string,
  maxComments: number = 20
): Promise<string[]> {
  // Check cache first
  const cacheKey = `comments:${noteId}`;
  const cached = getCached<string[]>(cacheKey);
  if (cached) {
    console.log("[FetchComments] Cache hit for", noteId);
    return cached.slice(0, maxComments);
  }

  const allComments: string[] = [];
  let cursor = "";
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && allComments.length < maxComments && pageCount < 2) {
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

      pageCount++;
      hasMore = innerData.has_more === true;
      cursor = String(innerData.cursor || "");
      if (!cursor) hasMore = false;
    } catch (e) {
      console.error("[FetchComments] Comment fetch error:", e);
      break;
    }
  }

  // Cache the result
  if (allComments.length > 0) {
    setCache(cacheKey, allComments);
  }

  return allComments;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteIds, noteDescriptions } = body as {
      noteIds: string[];
      noteDescriptions?: Record<string, string>;
    };

    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供笔记ID列表" },
        { status: 400 }
      );
    }

    const apiKey = getApiKey(request);
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "请先配置 TikHub API Token（点击顶部「配置 Token」按钮）",
        total: noteIds.length,
        fetched: 0,
        results: [],
      });
    }

    // Default to 20 comments per note (1 API call), max 2 pages
    const maxComments = 20;

    const results: Array<{
      noteId: string;
      title: string;
      content: string;
      commentCount: number;
      status: string;
    }> = [];

    for (const noteId of noteIds) {
      try {
        // Check per-note result cache
        const noteCacheKey = `noteResult:${noteId}`;
        const cachedNote = getCached<{
          noteId: string;
          title: string;
          content: string;
          commentCount: number;
          status: string;
        }>(noteCacheKey);
        if (cachedNote) {
          console.log("[FetchComments] Cache hit for note result", noteId);
          results.push(cachedNote);
          continue;
        }

        // Use description from search results instead of extra API call
        const desc = noteDescriptions?.[noteId] || "";

        // Fetch comments (1-2 API calls per note instead of 3-4)
        const comments = await fetchNoteComments(noteId, apiKey, maxComments);

        const combinedContent = [desc, "--- 评论区 ---", ...comments]
          .filter(Boolean)
          .join("\n");

        const noteResult = {
          noteId,
          title: "",
          content: combinedContent,
          commentCount: comments.length,
          status: "success" as const,
        };
        results.push(noteResult);
        // Cache successful result
        setCache(noteCacheKey, noteResult);
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
