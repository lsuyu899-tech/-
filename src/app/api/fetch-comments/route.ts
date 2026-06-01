import { NextRequest, NextResponse } from "next/server";
import { FetchClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

const TIKHUB_BASE_URL = "https://api.tikhub.io";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteIds, xsecTokens } = body;

    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供有效的笔记ID列表", total: 0, fetched: 0, results: [] },
        { status: 400 }
      );
    }

    const apiKey = process.env.TIKHUB_API_TOKEN;
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const fetchClient = new FetchClient(config, customHeaders);

    // Fetch note content and comments for each note (limit to top 5)
    const targetIds = noteIds.slice(0, 5);
    const fetchPromises = targetIds.map(async (noteId: string, index: number) => {
      try {
        const results: { noteId: string; title: string; content: string; status: string } = {
          noteId,
          title: "",
          content: "",
          status: "failed",
        };

        // Strategy 1: Try TikHub API for note detail + comments
        if (apiKey) {
          try {
            const xsecToken = xsecTokens?.[index] || "";
            const noteUrl = `${TIKHUB_BASE_URL}/api/v1/xiaohongshu/app/v2/note/detail?note_id=${noteId}&xsec_token=${xsecToken}`;
            const noteRes = await fetch(noteUrl, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            });

            if (noteRes.ok) {
              const noteData = await noteRes.json();
              if (noteData.code === 200 && noteData.data) {
                const detail = JSON.parse(noteData.data);
                const noteDetail = detail?.note_detail_map?.[noteId]?.note;
                if (noteDetail) {
                  results.title = noteDetail.title || "";
                  const desc = noteDetail.desc || "";
                  const comments = noteDetail.comment_list?.comments || [];
                  const commentTexts = comments
                    .map((c: { content?: string; user_info?: { nickname?: string } }) => {
                      const name = c.user_info?.nickname || "用户";
                      const text = c.content || "";
                      return text ? `${name}: ${text}` : "";
                    })
                    .filter(Boolean)
                    .join("\n");

                  results.content = [desc, commentTexts ? `---评论区---\n${commentTexts}` : ""]
                    .filter(Boolean)
                    .join("\n");
                  results.status = results.content.length > 10 ? "success" : "failed";
                }
              }
            }
          } catch (e) {
            console.error(`[TikHub Note Detail Error] ${noteId}:`, e);
          }
        }

        // Strategy 2: Fallback to fetch-url for xiaohongshu note page
        if (results.status === "failed") {
          try {
            const xhsUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
            const response = await fetchClient.fetch(xhsUrl);
            const textContent = (response.content || [])
              .filter((item) => item.type === "text" && "text" in item && item.text)
              .map((item) => item.text as string)
              .join("\n");

            if (textContent.length > 50) {
              results.title = response.title || "";
              results.content = textContent;
              results.status = "success";
            }
          } catch (e) {
            console.error(`[Fetch URL Error] ${noteId}:`, e);
          }
        }

        return results;
      } catch (err) {
        console.error(`[Fetch Error] ${noteId}:`, err);
        return {
          noteId,
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
      total: targetIds.length,
      fetched: successResults.length,
      results,
    });
  } catch (error) {
    console.error("[Fetch Comments API Error]", error);
    return NextResponse.json({
      success: false,
      error: "抓取评论失败，请稍后重试",
      total: 0,
      fetched: 0,
      results: [],
    });
  }
}
