"use client";

import { useState, useCallback, useRef } from "react";
import {
  Search,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  ArrowRight,
  RefreshCw,
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
  url: string | undefined;
  snippet: string;
  summary: string | undefined;
  publishTime: string | undefined;
  siteName: string | undefined;
  rankScore: number | undefined;
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

// Main page component
export default function HomePage() {
  const [keyword, setKeyword] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [stepStatus, setStepStatus] = useState<StepStatus>("idle");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Step 1: Search for posts
  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) return;

    // Reset states
    setPosts([]);
    setAnalysisText("");
    setAnalysisResult(null);
    setErrorMessage("");
    setStepStatus("searching");

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "搜索失败");
      }

      const data = await res.json();

      if (!data.success) {
        setErrorMessage(data.error || "搜索服务暂时不可用");
        setStepStatus("error");
        return;
      }

      if (!data.posts || data.posts.length === 0) {
        setErrorMessage(`未找到「${keyword.trim()}」相关的小红书帖子，请尝试其他关键词`);
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
      // Step 2: Fetch comments from all posts (only valid post URLs)
      const validUrls = posts
        .filter((p) => p.url && p.url !== "https://xiaohongshu.com/" && p.url !== "https://www.xiaohongshu.com/")
        .map((p) => p.url!);

      let allContent = "";

      // Only call fetch-comments if we have valid URLs to fetch
      if (validUrls.length > 0) {
        const fetchRes = await fetch("/api/fetch-comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: validUrls }),
          signal: abortController.signal,
        });

        if (!fetchRes.ok) {
          const err = await fetchRes.json();
          throw new Error(err.error || "抓取评论失败");
        }

        const fetchData = await fetchRes.json();

        // Combine all content from fetched results
        if (fetchData.results && fetchData.fetched > 0) {
          allContent = fetchData.results
            .filter((r: { status: string; content: string }) => r.status === "success" && r.content)
            .map((r: { title: string; content: string; url: string }) => {
              let text = `【${r.title || "帖子"}】\n${r.content}`;
              const matchingPost = posts.find((p) => p.url === r.url);
              if (matchingPost?.summary) {
                text += `\n摘要：${matchingPost.summary}`;
              }
              return text;
            })
            .join("\n---\n");
        }
      }

      // Fallback: use search snippets and summaries if fetch failed
      if (!allContent.trim()) {
        allContent = posts
          .map((p) => {
            let text = `【${p.title}】\n`;
            if (p.snippet) text += p.snippet + "\n";
            if (p.summary) text += "摘要：" + p.summary + "\n";
            return text;
          })
          .join("\n---\n");
      }

      if (!allContent.trim()) {
        throw new Error("无法获取有效的帖子内容");
      }

      // Step 3: Analyze with LLM (streaming)
      setStepStatus("analyzing");

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        // Extract JSON from the response (may contain markdown code blocks)
        const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/) ||
          fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          const parsed = JSON.parse(jsonStr);
          setAnalysisResult(parsed);
        }
      } catch {
        // If JSON parsing fails, keep the raw text display
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
          {stepStatus !== "idle" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="ml-auto text-xs text-gray-500 hover:text-[#1A1A2E]"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              重新开始
            </Button>
          )}
        </div>
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
                label="搜索相关内容"
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
                label="抓取详细内容"
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

        {/* Search Results */}
        {posts.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#1A1A2E]">
                搜索结果
                <span className="ml-2 text-xs font-normal text-[#6B7280]">
                  找到 {posts.length} 条相关内容
                </span>
              </h3>
              {!isProcessing && stepStatus !== "done" && (
                <Button
                  onClick={handleAnalyze}
                  className="bg-[#FF6B6B] text-white shadow-sm hover:bg-[#FF5252] active:scale-95 transition-all"
                  size="sm"
                >
                  开始分析
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="grid gap-3">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="border-[#E5E7EB] bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                  onClick={() =>
                    setExpandedPost(expandedPost === post.id ? null : post.id)
                  }
                >
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-sm font-semibold text-[#1A1A2E] leading-snug line-clamp-2">
                        {post.title}
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        {post.url && (
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="rounded p-1 text-gray-400 hover:text-[#FF6B6B] hover:bg-red-50 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {expandedPost === post.id ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                    {post.publishTime && (
                      <CardDescription className="text-xs text-[#6B7280] mt-1 flex items-center gap-2">
                        {post.siteName && (
                          <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-[#6B7280]">
                            {post.siteName}
                          </span>
                        )}
                        {post.publishTime}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <p className="text-xs text-[#6B7280] leading-relaxed line-clamp-2">
                      {post.snippet}
                    </p>
                    {expandedPost === post.id && (
                      <div className="mt-3 space-y-2">
                        <Separator />
                        {post.summary && (
                          <div>
                            <span className="text-xs font-medium text-[#1A1A2E]">
                              AI 摘要：
                            </span>
                            <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                              {post.summary}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
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
                    改进建议
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
                <Card key={i} className="border-[#E5E7EB] bg-white">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4 mt-2" />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3 mt-2" />
                  </CardContent>
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
              输入关键词开始搜索小红书帖子
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
