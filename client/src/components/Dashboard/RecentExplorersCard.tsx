import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const RecentExplorersCard: React.FC = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/recent-explorers"],
  });

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
      <h2 className="text-xl font-semibold mb-4">Recently Added Explorers</h2>
      
      {isLoading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center">
                <Skeleton className="w-10 h-10 rounded-full mr-3" />
                <div>
                  <Skeleton className="h-4 w-28 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-red-500 text-center py-4">
          Error loading recent explorers. Please try again later.
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-center py-4 text-slate-500 dark:text-slate-400">
          No blockchain explorers have been added yet.
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((explorer: any) => (
            <a 
              key={explorer.id}
              href={explorer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center mr-3">
                  <i className="ri-radar-line text-gray-500 dark:text-slate-400"></i>
                </div>
                <div>
                  <div className="font-medium">{explorer.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Added {formatTimeAgo(explorer.lastFetched)}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
      
      <Link href="/explorer">
        <Button variant="link" className="w-full mt-4 py-2 text-sm text-primary hover:underline">
          View all explorers
        </Button>
      </Link>
    </div>
  );
};

export default RecentExplorersCard;
