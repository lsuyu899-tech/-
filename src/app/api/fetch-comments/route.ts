import { NextRequest, NextResponse } from "next/server";

const TIKHUB_BASE_URL = "https://api.tikhub.io";

interface NoteResult {
  noteId: string;
  title: string;
  content: string;
  commentCount: number;
  status: string;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteIds } = body as { noteIds: string[] };

    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供有效的笔记ID列表", total: 0, fetched: 0, results: [] },
        { status: 400 }
      );
    }

    const apiKey = process.env.TIKHUB_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "TikHub API Token 未配置，请在环境变量中设置 TIKHUB_API_TOKEN",
        total: noteIds.length,
        fetched: 0,
        results: [],
      });
    }

    const headers = buildHeaders(apiKey);

    // Process up to 5 notes in parallel
    const targetIds = noteIds.slice(0, 5);
    const fetchPromises = targetIds.map(async (noteId: string): Promise<NoteResult> => {
      const result: NoteResult = {
        noteId,
        title: "",
        content: "",
        commentCount: 0,
        status: "failed",
      };

      try {
        // Step 1: Get note detail (title + description)
        const detailUrl = `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/app_v2/get_image_note_detail?note_id=${encodeURIComponent(noteId)}`;
        const detailRes = await fetch(detailUrl, { headers });

        let noteTitle = "";
        let noteDesc = "";

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.code === 200 && detailData.data) {
            try {
              const parsed = typeof detailData.data === "string" ? JSON.parse(detailData.data) : detailData.data;
              // Navigate the nested data structure
              const noteDetail = parsed?.data?.noteDetailMap?.[noteId]?.note
                || parsed?.note_detail_map?.[noteId]?.note
                || parsed?.note
                || null;

              if (noteDetail) {
                noteTitle = noteDetail.title || noteDetail.display_title || "";
                noteDesc = noteDetail.desc || noteDetail.description || "";
                result.title = noteTitle;
              }
            } catch (parseErr) {
              console.error(`[Parse Detail Error] ${noteId}:`, parseErr);
            }
          }
        }

        // Step 2: Get note comments (first page, sorted by latest for more relevant feedback)
        const commentsUrl = `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/app_v2/get_note_comments?note_id=${encodeURIComponent(noteId)}&index=0&sort_strategy=latest_v2`;
        const commentsRes = await fetch(commentsUrl, { headers });

        const commentTexts: string[] = [];

        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          if (commentsData.code === 200 && commentsData.data) {
            try {
              const parsed = typeof commentsData.data === "string" ? JSON.parse(commentsData.data) : commentsData.data;
              const comments = parsed?.data?.comments
                || parsed?.comments
                || [];

              result.commentCount = comments.length;

              for (const comment of comments) {
                const nickname = comment?.user_info?.nickname || comment?.nickname || "匿名用户";
                const text = comment?.content || comment?.text || "";
                const likeCount = comment?.like_count || comment?.liked_count || 0;

                if (text) {
                  const likeStr = likeCount > 0 ? ` (${likeCount}赞)` : "";
                  commentTexts.push(`${nickname}${likeStr}: ${text}`);
                }
              }
            } catch (parseErr) {
              console.error(`[Parse Comments Error] ${noteId}:`, parseErr);
            }
          }
        }

        // Combine note content and comments
        const parts: string[] = [];
        if (noteTitle) parts.push(`标题: ${noteTitle}`);
        if (noteDesc) parts.push(`内容: ${noteDesc}`);
        if (commentTexts.length > 0) {
          parts.push(`---评论区 (${commentTexts.length}条)---`);
          parts.push(...commentTexts);
        }

        result.content = parts.join("\n");
        result.status = result.content.length > 10 ? "success" : "failed";
      } catch (err) {
        console.error(`[Fetch Error] ${noteId}:`, err);
      }

      return result;
    });

    const results = await Promise.all(fetchPromises);
    const successResults = results.filter((r) => r.status === "success");

    return NextResponse.json({
      success: true,
      total: targetIds.length,
      fetched: successResults.length,
      results,
    });
  } catch (error) {
    console.error("[Fetch Comments API Error]", error);
    return NextResponse.json({
      success: false,
      error: "评论抓取失败，请稍后重试",
      total: 0,
      fetched: 0,
      results: [],
    });
  }
}
