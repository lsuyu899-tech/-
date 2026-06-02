"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Zap,
  ArrowRight,
  RefreshCw,
  Heart,
  MessageSquare,
  Bookmark,
  User,
  ImageOff,
  ExternalLink,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// Types
interface Post {
  id: string;
  title: string;
  desc: string;
  coverUrl: string;
  type: string;
  nickname: string;
  likedCount: string;
  collectedCount: string;
  commentCount: string;
  shareCount: string;
  xsecToken: string;
  noteId: string;
  tags: string[];
}

interface PainPoint {
  category: string;
  severity: "high" | "medium" | "low";
  description: string;
  evidence: string;
  frequency: string;
}

interface AnalysisResult {
  overview: string;
  painPoints: PainPoint[];
  suggestions: string[];
}

type StepStatus = "idle" | "searching" | "fetching" | "analyzing" | "done" | "error";

// Severity color mapping
function severityColor(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-red-50 text-red-700 border-red-200";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "low":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return severity;
  }
}

function severityIcon(severity: string) {
  switch (severity) {
    case "high":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "medium":
      return <TrendingUp className="h-3.5 w-3.5" />;
    case "low":
      return <Lightbulb className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

// Step indicator component
function StepIndicator({
  step,
  status,
  label,
}: {
  step: number;
  status: "pending" | "active" | "done" | "error";
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
          status === "active"
            ? "bg-[#FF6B6B] text-white scale-110"
            : status === "done"
            ? "bg-emerald-500 text-white"
            : status === "error"
            ? "bg-red-500 text-white"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {status === "done" ? "✓" : status === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : step}
      </div>
      <span
        className={`text-sm font-medium transition-colors duration-300 ${
          status === "active"
            ? "text-[#1A1A2E]"
            : status === "done"
            ? "text-emerald-600"
            : status === "error"
            ? "text-red-600"
            : "text-gray-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// Note cover image component
function NoteCover({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 rounded-l-xl">
        <ImageOff className="h-6 w-6 text-gray-300" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover rounded-l-xl"
      onError={() => setError(true)}
    />
  );
}

// Main page component
export default function HomePage() {
  const [keyword, setKeyword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stepStatus, setStepStatus] = useState<StepStatus>("idle");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [analyzeCount, setAnalyzeCount] = useState(3);
  const abortRef = useRef<AbortController | null>(null);

  // Load API key from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("tikhub_api_key");
    if (saved) setApiKey(saved);
    setApiKeyLoaded(true);
  }, []);

  // Save API key to localStorage when it changes
  useEffect(() => {
    if (apiKeyLoaded && apiKey) {
      localStorage.setItem("tikhub_api_key", apiKey);
    }
  }, [apiKey, apiKeyLoaded]);

  // Helper to build headers with API key
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-tikhub-token"] = apiKey;
    return headers;
  }, [apiKey]);

  // Step 1: Search for posts
  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) return;

    // Check API key before searching
    const currentKey = apiKey || localStorage.getItem("tikhub_api_key") || "";
    if (!currentKey) {
      setErrorMessage("请先配置 TikHub API Token（点击顶部「配置 Token」按钮）");
      setStepStatus("error");
      return;
    }

    // Reset states
    setPosts([]);
    setAnalysisText("");
    setAnalysisResult(null);
    setErrorMessage("");
    setStepStatus("searching");

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      headers["x-tikhub-token"] = currentKey;

      const res = await fetch("/api/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ keyword: keyword.trim() }),
      });

      const data = await res.json();

      if (!data.success) {
        setErrorMessage(data.error || "搜索服务暂时不可用");
        setStepStatus("error");
        return;
      }

      if (!data.posts || data.posts.length === 0) {
        setErrorMessage(`未找到「${keyword.trim()}」相关的小红书笔记，请尝试其他关键词`);
        setStepStatus("error");
        return;
      }

      setPosts(data.posts);
      setStepStatus("idle");
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "搜索时发生错误");
      setStepStatus("error");
    }
  }, [keyword]);

  // Step 2 & 3: Fetch comments and analyze
  const handleAnalyze = useCallback(async () => {
    if (posts.length === 0) return;

    setStepStatus("fetching");
    setAnalysisText("");
    setAnalysisResult(null);
    setErrorMessage("");

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      // Step 2: Fetch comments from xiaohongshu notes via TikHub API
      const selectedPosts = posts.slice(0, analyzeCount);
      const noteIds = selectedPosts.map((p) => p.noteId).filter(Boolean);
      const noteDescriptions = selectedPosts.reduce<Record<string, string>>((acc, p) => {
        if (p.noteId && (p.title || p.desc)) {
          acc[p.noteId] = `【${p.title}】by ${p.nickname}\n${p.desc || ""}`;
        }
        return acc;
      }, {});
      const currentKey = apiKey || localStorage.getItem("tikhub_api_key") || "";
      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (currentKey) reqHeaders["x-tikhub-token"] = currentKey;

      let allContent = "";

      if (noteIds.length > 0) {
        const fetchRes = await fetch("/api/fetch-comments", {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify({
            noteIds,
            noteDescriptions,
          }),
          signal: abortController.signal,
        });

        const fetchData = await fetchRes.json();

        if (fetchData.success && fetchData.fetched > 0) {
          allContent = fetchData.results
            .filter((r: { status: string; content: string }) => r.status === "success" && r.content)
            .map((r: { noteId: string; title: string; content: string; commentCount: number }) => {
              return `【笔记ID: ${r.noteId}${r.title ? " - " + r.title : ""}】\n${r.content}`;
            })
            .join("\n---\n");
        }
      }

      // Fallback: use note descriptions as analysis content
      if (!allContent.trim()) {
        allContent = posts
          .map((p) => {
            let text = `【${p.title}】by ${p.nickname}\n`;
            if (p.desc) text += p.desc + "\n";
            if (p.tags.length > 0) text += `标签: ${p.tags.join("、")}\n`;
            text += `互动数据: 点赞${p.likedCount} 收藏${p.collectedCount} 评论${p.commentCount}`;
            return text;
          })
          .join("\n---\n");
      }

      if (!allContent.trim()) {
        throw new Error("无法获取有效的笔记内容");
      }

      // Step 3: Analyze with LLM (streaming)
      setStepStatus("analyzing");

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          keyword: keyword.trim(),
          comments: allContent,
        }),
        signal: abortController.signal,
      });

      if (!analyzeRes.ok) {
        throw new Error("分析请求失败");
      }

      const reader = analyzeRes.body?.getReader();
      if (!reader) throw new Error("无法读取分析结果");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                setErrorMessage(data.error);
                setStepStatus("error");
                return;
              }
              if (data.done) {
                continue;
              }
              if (data.content) {
                fullText += data.content;
                setAnalysisText(fullText);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      // Try to parse the final result as JSON
      try {
        const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/) ||
          fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          const parsed = JSON.parse(jsonStr);
          setAnalysisResult(parsed);
        }
      } catch {
        console.log("Could not parse analysis result as JSON");
      }

      setStepStatus("done");
    } catch (err) {
      if (abortController.signal.aborted) return;
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "分析时发生错误");
      setStepStatus("error");
    }
  }, [posts, keyword]);

  // Handle key press
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && stepStatus !== "searching") {
        handleSearch();
      }
    },
    [handleSearch, stepStatus]
  );

  // Reset everything
  const handleReset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setKeyword("");
    setPosts([]);
    setStepStatus("idle");
    setAnalysisText("");
    setAnalysisResult(null);
    setErrorMessage("");
    setExpandedPost(null);
  }, []);

  const isProcessing = stepStatus === "searching" || stepStatus === "fetching" || stepStatus === "analyzing";

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6B6B]">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-base font-bold text-[#1A1A2E]">
              小红书痛点洞察
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className={`text-xs ${apiKey ? "text-emerald-600 hover:text-emerald-700" : "text-gray-500 hover:text-[#1A1A2E]"}`}
            >
              <Key className="mr-1 h-3 w-3" />
              {apiKey ? "Token 已配置" : "配置 Token"}
            </Button>
            {stepStatus !== "idle" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-[#1A1A2E]"
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                重新开始
              </Button>
            )}
          </div>
        </div>
        {/* API Key Input Panel */}
        {showApiKeyInput && (
          <div className="border-t border-[#E5E7EB] bg-gray-50/80 px-6 py-3">
            <div className="mx-auto max-w-5xl">
              <div className="flex items-center gap-3">
                <Key className="h-4 w-4 text-gray-400 shrink-0" />
                <Input
                  type="password"
                  placeholder="输入你的 TikHub API Token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-8 text-sm font-mono bg-white"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (apiKey) {
                      localStorage.setItem("tikhub_api_key", apiKey);
                      setShowApiKeyInput(false);
                    }
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-700 shrink-0"
                >
                  确认
                </Button>
                {apiKey && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setApiKey(""); localStorage.removeItem("tikhub_api_key"); }}
                    className="text-xs text-red-500 hover:text-red-600 shrink-0"
                  >
                    清除
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Token 将保存在浏览器本地，不会上传到服务器。获取 Token：前往{" "}
                <a href="https://tikhub.io" target="_blank" rel="noopener noreferrer" className="text-[#FF6B6B] hover:underline">
                  tikhub.io
                </a>{" "}
                注册后在用户中心创建 API Token。
              </p>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20">
        {/* Search Section */}
        <section className="pt-16 pb-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#1A1A2E]">
              挖掘用户真实痛点
            </h2>
            <p className="mt-2 text-sm text-[#6B7280]">
              输入关键词，自动搜索小红书热帖，AI 深度分析评论区用户痛点
            </p>
          </div>

          <div className="mx-auto mt-8 flex max-w-xl gap-3">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入关键词，如：护肤品、租房、减肥..."
              disabled={isProcessing}
              className="h-11 border-[#E5E7EB] bg-white text-sm shadow-sm focus:border-[#FF6B6B] focus:ring-[#FF6B6B]/20"
            />
            <Button
              onClick={handleSearch}
              disabled={!keyword.trim() || isProcessing}
              className="h-11 bg-[#FF6B6B] px-6 text-sm font-medium text-white shadow-sm hover:bg-[#FF5252] active:scale-95 transition-all"
            >
              {stepStatus === "searching" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-4 w-4" />
              )}
              {stepStatus === "searching" ? "搜索中" : "搜索"}
            </Button>
          </div>
        </section>

        {/* Error Message */}
        {errorMessage && (
          <div className="mx-auto max-w-xl mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Step Progress */}
        {(isProcessing || stepStatus === "done") && (
          <div className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4">
              <StepIndicator
                step={1}
                status={
                  stepStatus === "searching"
                    ? "active"
                    : stepStatus === "done" ||
                      stepStatus === "fetching" ||
                      stepStatus === "analyzing"
                    ? "done"
                    : "pending"
                }
                label="搜索小红书笔记"
              />
              <StepIndicator
                step={2}
                status={
                  stepStatus === "fetching"
                    ? "active"
                    : stepStatus === "searching"
                    ? "pending"
                    : stepStatus === "analyzing" || stepStatus === "done"
                    ? "done"
                    : "pending"
                }
                label="抓取笔记内容与评论"
              />
              <StepIndicator
                step={3}
                status={
                  stepStatus === "analyzing"
                    ? "active"
                    : stepStatus === "done"
                    ? "done"
                    : "pending"
                }
                label="AI 分析用户痛点"
              />
            </div>
            {stepStatus === "analyzing" && (
              <div className="mt-4 flex items-center gap-2 text-xs text-[#6B7280]">
                <Loader2 className="h-3 w-3 animate-spin" />
                正在深度分析评论内容...
              </div>
            )}
          </div>
        )}

        {/* Search Results - XHS Note Cards */}
        {posts.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#1A1A2E]">
                小红书笔记
                <span className="ml-2 text-xs font-normal text-[#6B7280]">
                  找到 {posts.length} 条相关笔记
                </span>
              </h3>
              {!isProcessing && stepStatus !== "done" && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                    <span>分析笔记数:</span>
                    {[1, 3, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setAnalyzeCount(n)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                          analyzeCount === n
                            ? "bg-[#FF6B6B] text-white"
                            : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="text-[10px] text-[#9CA3AF]">越多越准, 费用越高</span>
                  </div>
                  <Button
                    onClick={handleAnalyze}
                    className="bg-[#FF6B6B] text-white shadow-sm hover:bg-[#FF5252] active:scale-95 transition-all"
                    size="sm"
                  >
                    开始分析
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-3">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="border-[#E5E7EB] bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer overflow-hidden"
                  onClick={() =>
                    setExpandedPost(expandedPost === post.id ? null : post.id)
                  }
                >
                  <div className="flex">
                    {/* Cover Image */}
                    <div className="w-28 h-28 shrink-0">
                      <NoteCover src={post.coverUrl} alt={post.title} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-sm font-semibold text-[#1A1A2E] leading-snug line-clamp-2">
                          {post.title}
                        </CardTitle>
                        <CardDescription className="text-xs text-[#6B7280] mt-1 flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          {post.nickname}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 pt-0">
                        {/* Interaction stats */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                            <span className="flex items-center gap-0.5">
                              <Heart className="h-3 w-3" />
                              {post.likedCount}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Bookmark className="h-3 w-3" />
                              {post.collectedCount}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <MessageSquare className="h-3 w-3" />
                              {post.commentCount}
                            </span>
                          </div>
                          <a
                            href={`https://www.xiaohongshu.com/explore/${post.noteId}?xsec_token=${post.xsecToken}&xsec_source=pc_search`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-[#FF6B6B] hover:text-[#E85555] transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            小红书
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>

                        {/* Tags */}
                        {post.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {post.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-[#FF6B6B]"
                              >
                                #{tag}
                              </span>
                            ))}
                            {post.tags.length > 3 && (
                              <span className="text-[10px] text-[#6B7280]">
                                +{post.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {expandedPost === post.id && (
                    <div className="border-t border-[#E5E7EB] px-4 py-3 bg-[#FAFAFA]">
                      {post.desc && (
                        <p className="text-xs text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
                          {post.desc}
                        </p>
                      )}
                      {!post.desc && (
                        <p className="text-xs text-[#6B7280] italic">该笔记无文字描述</p>
                      )}
                      <a
                        href={`https://www.xiaohongshu.com/explore/${post.noteId}?xsec_token=${post.xsecToken}&xsec_source=pc_search`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-[#FF6B6B] hover:text-[#E85555] hover:underline transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        在小红书中查看
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Analysis Streaming */}
        {(stepStatus === "analyzing" || analysisText) && !analysisResult && (
          <section className="mb-10">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-4">
              痛点分析
              {stepStatus === "analyzing" && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-[#FF6B6B]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  分析中
                </span>
              )}
            </h3>
            <Card className="border-[#E5E7EB] bg-white shadow-sm">
              <CardContent className="p-5">
                <pre className="text-xs text-[#1A1A2E] leading-relaxed whitespace-pre-wrap font-sans">
                  {analysisText}
                  {stepStatus === "analyzing" && (
                    <span className="inline-block w-1.5 h-4 bg-[#FF6B6B] animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </pre>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Analysis Result */}
        {analysisResult && (
          <section className="mb-10">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-4 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                ✓
              </span>
              痛点分析报告
            </h3>

            {/* Overview */}
            <Card className="border-[#E5E7EB] bg-white shadow-sm mb-4">
              <CardContent className="p-5">
                <p className="text-sm text-[#1A1A2E] leading-relaxed">
                  {analysisResult.overview}
                </p>
              </CardContent>
            </Card>

            {/* Pain Points */}
            <div className="space-y-3 mb-6">
              {analysisResult.painPoints?.map((point, idx) => (
                <Card
                  key={idx}
                  className="border-[#E5E7EB] bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium border ${severityColor(point.severity)}`}
                      >
                        {severityIcon(point.severity)}
                        <span className="ml-1">{severityLabel(point.severity)}</span>
                      </Badge>
                      <Badge variant="outline" className="text-xs text-[#6B7280] border-[#E5E7EB]">
                        {point.frequency}
                      </Badge>
                      <span className="text-xs font-semibold text-[#1A1A2E]">
                        {point.category}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <p className="text-sm text-[#1A1A2E] leading-relaxed">
                      {point.description}
                    </p>
                    {point.evidence && (
                      <div className="mt-3 rounded-lg bg-gray-50 border border-[#E5E7EB] p-3">
                        <span className="text-xs font-medium text-[#6B7280]">
                          用户原话：
                        </span>
                        <p className="text-xs text-[#6B7280] mt-1 leading-relaxed italic">
                          「{point.evidence}」
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Suggestions */}
            {analysisResult.suggestions && analysisResult.suggestions.length > 0 && (
              <Card className="border-[#E5E7EB] bg-white shadow-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-[#1A1A2E] flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-[#F59E0B]" />
                    创作建议
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <ul className="space-y-2">
                    {analysisResult.suggestions.map((suggestion, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm text-[#1A1A2E] leading-relaxed"
                      >
                        <span className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-600">
                          {idx + 1}
                        </span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* Loading Skeletons */}
        {stepStatus === "searching" && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-[#E5E7EB] bg-white overflow-hidden">
                  <div className="flex">
                    <Skeleton className="w-28 h-28 rounded-none" />
                    <div className="flex-1 p-4">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4 mt-2" />
                      <Skeleton className="h-3 w-1/2 mt-3" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {posts.length === 0 && stepStatus === "idle" && !errorMessage && (
          <section className="py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <Search className="h-7 w-7 text-gray-400" />
            </div>
            <p className="mt-4 text-sm text-[#6B7280]">
              输入关键词搜索小红书笔记
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["护肤品", "租房", "减肥", "职场", "健身"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setKeyword(tag);
                  }}
                  className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-xs text-[#6B7280] transition-colors hover:border-[#FF6B6B] hover:text-[#FF6B6B]"
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
