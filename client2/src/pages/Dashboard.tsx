import React from "react";
import { Link } from "wouter";
import StatsCard from "@/components/Dashboard/StatsCard";
import AiInsightsCard from "@/components/Dashboard/AiInsightsCard";
import CryptocurrencyTable from "@/components/Dashboard/CryptocurrencyTable";
import CrawlerStatusCard from "@/components/Dashboard/CrawlerStatusCard";
import RecentExplorersCard from "@/components/Dashboard/RecentExplorersCard";
import ComparisonTool from "@/components/Comparison/ComparisonTool";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const Dashboard: React.FC = () => {
  // Get summary stats
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ["/api/stats"],
  });

  return (
    <div className="p-6">
      {/* Page Title */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cryptocurrency Analytics Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Track and analyze blockchain data for top cryptocurrencies
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link href="/basic-data-collection">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <i className="ri-database-line mr-2"></i>
              基础数据采集
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatsCard
          title="Total Market Cap"
          value={statsData?.totalMarketCap || "$1.26T"}
          change={statsData?.marketCapChange || "2.4%"}
          changeType={
            !statsData?.marketCapChange ? "neutral" :
            parseFloat(statsData.marketCapChange) >= 0 ? "increase" : "decrease"
          }
          icon="ri-coin-line"
          iconBgColor="bg-blue-50 dark:bg-blue-900/20"
          iconColor="text-primary"
        />

        <StatsCard
          title="24h Trading Volume"
          value={statsData?.tradingVolume || "$48.7B"}
          change={statsData?.volumeChange || "1.3%"}
          changeType={
            !statsData?.volumeChange ? "neutral" :
            parseFloat(statsData.volumeChange) >= 0 ? "increase" : "decrease"
          }
          icon="ri-exchange-line"
          iconBgColor="bg-violet-50 dark:bg-violet-900/20"
          iconColor="text-secondary"
        />

        <StatsCard
          title="Active Blockchains"
          value={statsData?.activeBlockchains || "84"}
          change={statsData?.lastUpdated || "Last updated 3min ago"}
          changeType="neutral"
          icon="ri-link-m"
          iconBgColor="bg-amber-50 dark:bg-amber-900/20"
          iconColor="text-accent"
        />

        <StatsCard
          title="Tracked Assets"
          value={statsData?.trackedAssets || "578"}
          change={statsData?.newAssets || "12 new today"}
          changeType="increase"
          icon="ri-database-2-line"
          iconBgColor="bg-emerald-50 dark:bg-emerald-900/20"
          iconColor="text-emerald-500"
        />
      </div>

      {/* AI Insights Section */}
      <AiInsightsCard />

      {/* Main Content Sections */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Top Cryptocurrencies Table */}
        <CryptocurrencyTable />

        {/* Blockchain Explorer & Source Status */}
        <div className="space-y-6">
          <CrawlerStatusCard />
          <RecentExplorersCard />
        </div>
      </div>

      {/* Comparison Tool */}
      <ComparisonTool />
    </div>
  );
};

export default Dashboard;
