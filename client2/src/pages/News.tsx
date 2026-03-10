import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarIcon, ExternalLinkIcon, SearchIcon } from "lucide-react";

// 格式化日期 - 使用客户端本地时间
function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

// 新闻类型定义
type NewsArticle = {
  id: number;
  title: string;
  url: string;
  summary: string | null;
  source: string | null;
  publishedAt: string;
  fetchedAt: string;
};

const NewsPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const limit = 50; // 每页50条新闻，最多8页显示所有400条
  
  // 获取新闻数据
  const { data, isLoading, error } = useQuery<{data: NewsArticle[], total: number}>({
    queryKey: ['/api/news', page, limit],
    queryFn: () => fetch(`/api/news?page=${page}&limit=${limit}`).then(res => res.json()),
    placeholderData: (prevData) => prevData // This replaces keepPreviousData in v5
  });
  
  // 过滤新闻
  const filteredNews = data?.data?.filter((article: NewsArticle) => {
    // 先根据搜索词过滤
    const matchesSearch = search === "" || 
      article.title.toLowerCase().includes(search.toLowerCase()) ||
      (article.summary && article.summary.toLowerCase().includes(search.toLowerCase()));
    
    // 然后根据选项卡过滤
    if (activeTab === "all") return matchesSearch;
    if (activeTab === "bitcoin") return matchesSearch && article.title.toLowerCase().includes("bitcoin");
    if (activeTab === "ethereum") return matchesSearch && article.title.toLowerCase().includes("ethereum");
    if (activeTab === "defi") return matchesSearch && article.title.toLowerCase().includes("defi");
    
    return matchesSearch;
  });
  
  const totalPages = data?.total ? Math.ceil(data.total / limit) : 0;
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
        加密货币新闻中心
      </h1>
      <p className="text-gray-500 mb-6">
        获取最新的加密货币市场新闻、更新和深度分析
      </p>
      
      <div className="flex items-center space-x-4 mb-6">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="搜索新闻..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
        >
          刷新
        </Button>
      </div>
      
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid grid-cols-4 md:w-[400px]">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="bitcoin">比特币</TabsTrigger>
          <TabsTrigger value="ethereum">以太坊</TabsTrigger>
          <TabsTrigger value="defi">DeFi</TabsTrigger>
        </TabsList>
      </Tabs>
      
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="w-full mb-4 shadow-md">
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <div className="text-center p-6 bg-red-50 rounded-lg">
          <p className="text-red-500">获取新闻时出错。请稍后再试。</p>
        </div>
      ) : filteredNews && filteredNews.length > 0 ? (
        <div className="space-y-4">
          {filteredNews.map((article: NewsArticle) => (
            <Card key={article.id} className="w-full mb-4 shadow-md hover:shadow-lg transition-all duration-200">
              <CardHeader>
                <CardTitle className="text-xl font-bold cursor-pointer hover:text-blue-600">
                  <a href={article.url} target="_blank" rel="noopener noreferrer">
                    {article.title}
                  </a>
                </CardTitle>
                <CardDescription className="flex items-center text-sm text-gray-500">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {formatDate(article.publishedAt)}
                  {article.source && (
                    <span className="ml-4 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">
                      {article.source}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {article.summary && <p className="text-gray-700">{article.summary}</p>}
              </CardContent>
              <CardFooter className="pt-0 justify-end">
                <a 
                  href={article.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
                >
                  阅读全文 <ExternalLinkIcon className="h-4 w-4 ml-1" />
                </a>
              </CardFooter>
            </Card>
          ))}
          
          {totalPages > 1 && data && (
            <div className="my-8">
              <div className="text-center mb-4 text-gray-600">
                显示 {((page - 1) * limit) + 1} - {Math.min(page * limit, data?.total || 0)} 条，共 {data?.total || 0} 条新闻
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        if (page > 1) setPage(page - 1);
                      }} 
                    />
                  </PaginationItem>
                  
                  {/* 分页逻辑支持多达6页 */}
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const pageNum = i + 1;
                    const isCurrentPage = page === pageNum;
                    const isFirstPage = pageNum === 1;
                    const isLastPage = pageNum === totalPages;
                    const isNearCurrentPage = Math.abs(pageNum - page) <= 1;
                    
                    if (isCurrentPage || isFirstPage || isLastPage || isNearCurrentPage) {
                      return (
                        <PaginationItem key={i}>
                          <PaginationLink 
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              setPage(pageNum);
                            }}
                            isActive={isCurrentPage}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }
                    
                    if ((pageNum === 2 && page > 3) || (pageNum === totalPages - 1 && page < totalPages - 2)) {
                      return (
                        <PaginationItem key={i}>
                          <span className="px-3 py-2">...</span>
                        </PaginationItem>
                      );
                    }
                    
                    return null;
                  })}
                  
                  <PaginationItem>
                    <PaginationNext 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        if (page < totalPages) setPage(page + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center p-10 bg-gray-50 rounded-lg">
          <p className="text-gray-500">暂无新闻。请稍后再试。</p>
        </div>
      )}
    </div>
  );
};

export default NewsPage;