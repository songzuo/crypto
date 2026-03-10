import React from 'react';

const SimpleHome: React.FC = () => {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">简化测试页面</h1>
      <p className="text-gray-600 mb-6">
        如果你看到这个页面，说明React基础加载正常。
      </p>

      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">API测试结果</h2>

        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 bg-blue-100 text-blue-800 p-3 rounded-lg">
              <span className="text-2xl font-bold">✅</span>
            </div>
            <div>
              <h3 className="font-medium">主页面加载</h3>
              <p className="text-sm text-gray-600">HTML正常返回，显示"Loading CryptoScan Dashboard..."</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex-1 bg-green-100 text-green-800 p-3 rounded-lg">
              <span className="text-2xl font-bold">✅</span>
            </div>
            <div>
              <h3 className="font-medium">静态资源</h3>
              <p className="text-sm text-gray-600">CSS和JS文件正确引用</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex-1 bg-yellow-100 text-yellow-800 p-3 rounded-lg">
              <span className="text-2xl font-bold">⚠️</span>
            </div>
            <div>
              <h3 className="font-medium">JavaScript执行</h3>
              <p className="text-sm text-gray-600">可能仍有.map()错误</p>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">🔧 已修复的组件</h3>
          <ul className="list-disc list-inside space-y-2">
            <li>Dashboard.tsx - 统计数据处理</li>
            <li>CryptocurrencyTable.tsx - 加密货币表格</li>
            <li>AiInsightsCard.tsx - AI洞察卡片</li>
            <li>RecentExplorersCard.tsx - 最近探索器</li>
            <li>CrawlerStatusCard.tsx - 爬虫状态</li>
            <li>ComparisonTool.tsx - 比较工具</li>
            <li>News.tsx - 新闻页面</li>
            <li>AiInsights.tsx - AI洞察页面</li>
          </ul>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">📝 下一步建议</h3>
          <ol className="list-decimal space-y-2">
            <li>打开浏览器开发者工具 (F12)</li>
            <li>访问 /test 页面查看基础状态</li>
            <li>点击各个菜单项，查看哪个页面出现错误</li>
            <li>如果看到具体.map错误，告诉我错误信息</li>
            <li>我会针对性修复剩余的问题</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default SimpleHome;