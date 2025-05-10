import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

const AiInsightsCard: React.FC = () => {
  const { data: insights, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/ai-insights"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <i className="ri-robot-line mr-2 text-secondary"></i>
          AI Insights
        </h2>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-primary hover:text-primary-dark"
          onClick={() => refetch()}
        >
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 border-l-4 border-secondary animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full mb-2"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
        </div>
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border-l-4 border-red-500">
          <p className="text-red-600 dark:text-red-400">
            Error loading AI insights. Please try again later.
          </p>
        </div>
      ) : insights && insights.length > 0 ? (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border-l-4 border-secondary">
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            {insights[0].content}
          </p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Generated {formatTimeAgo(insights[0].createdAt)}
            </span>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" className="text-xs">
                More Details
              </Button>
              <Button variant="outline" size="sm" className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border-none">
                Analysis
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border-l-4 border-secondary">
          <p className="text-slate-600 dark:text-slate-300">
            No AI insights available at the moment. Check back later.
          </p>
        </div>
      )}
    </div>
  );
};

export default AiInsightsCard;
