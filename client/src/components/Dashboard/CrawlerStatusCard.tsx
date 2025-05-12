import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const CrawlerStatusCard: React.FC = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/crawler-status"],
    refetchInterval: 60000, // Refetch every minute
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
      <h2 className="text-xl font-semibold mb-4">Crawler Status</h2>
      
      {isLoading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="flex items-center">
                <Skeleton className="h-3 w-3 rounded-full mr-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          </div>
        </div>
      ) : isError ? (
        <div className="text-red-500 text-center py-4">
          Error loading crawler status. Please try again later.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className={`h-3 w-3 rounded-full ${data?.webCrawlerActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'} mr-2`}></div>
              <span>Web Crawler</span>
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {data?.webCrawlerActive ? 'Active' : 'Idle'}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className={`h-3 w-3 rounded-full ${data?.aiProcessorActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'} mr-2`}></div>
              <span>AI Data Processor</span>
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {data?.aiProcessorActive ? 'Active' : 'Idle'}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className={`h-3 w-3 rounded-full ${
                data?.blockchainSyncActive ? 'bg-emerald-500' : 
                (data?.webCrawlerActive || data?.aiProcessorActive) ? 'bg-amber-500' : 
                'bg-slate-300 dark:bg-slate-600'
              } mr-2`}></div>
              <span>Blockchain Sync</span>
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {data?.blockchainSyncActive ? 'Active' : 
               (data?.webCrawlerActive || data?.aiProcessorActive) ? 'Syncing' : 'Idle'}
            </span>
          </div>
          
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">Last update</span>
              <span className="text-sm">{data?.lastUpdate ? formatTimeAgo(data.lastUpdate) : 'Never'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400">New entries today</span>
              <span className="text-sm">{data?.newEntriesCount || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrawlerStatusCard;
