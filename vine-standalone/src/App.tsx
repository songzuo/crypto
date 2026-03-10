import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VINEHistoricalData from './components/VINEHistoricalData'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              VINE历史数据采集系统
            </h1>
            <p className="text-lg text-gray-600">
              24小时不间断采集、AI验证、实时监控
            </p>
          </div>
          
          <VINEHistoricalData />
        </div>
      </div>
    </QueryClientProvider>
  )
}

export default App