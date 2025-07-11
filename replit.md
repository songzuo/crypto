# CryptoScan - Cryptocurrency Data Dashboard

## Overview

CryptoScan is a comprehensive cryptocurrency data analysis platform that provides real-time market data, blockchain metrics, technical analysis, and AI-powered insights. The application combines web scraping, API integration, and advanced analytics to deliver a complete cryptocurrency monitoring solution.

## User Preferences

Preferred communication style: Simple, everyday language.

## Data Quality Requirements (Updated 2025-07-11)
- **7-day volatility analysis**: Requires minimum 8 data points
- **30-day volatility analysis**: Requires minimum 31 data points
- **Processing scope**: All 1000+ cryptocurrencies must be processed
- **Data integrity**: Complete calculations only - no partial results saved to database
- **Current data status**: 780 cryptocurrencies available, but only 25 meet 7-day requirements (8+ points), 0 meet 30-day requirements (31+ points)

## Recent Changes (2025-07-11)
- **MAJOR FIX**: Implemented real complete volatility analysis system processing all 780+ cryptocurrencies
- **ALGORITHM CORRECTION**: Fixed 7-day analysis to use exactly 8 data points with 7 comparisons as specified
- **ALGORITHM CORRECTION**: Fixed 30-day analysis to use exactly 31 data points with 31 comparisons as specified
- **PROGRESS TRACKING**: Added real-time progress display showing "还有X%的数据正在计算" with live updates
- **DATA SEPARATION**: Properly separated 7-day and 30-day analysis into distinct database batches
- **VALIDATION**: System now correctly validates data sufficiency before processing (no more 1-2 data point errors)
- **SCALE**: Successfully processing all available cryptocurrencies instead of limited 186 subset
- **FRONTEND**: Added real-time progress monitoring with 2-second refresh interval
- **30-DAY INDEPENDENT SYSTEM**: Created completely separate 30-day analysis system with dedicated backend and frontend
- **NEW FRONTEND PAGE**: Added "/30day-analysis" route with independent interface for 30-day volatility analysis
- **DEDICATED APIS**: Implemented separate API endpoints for 30-day analysis trigger and progress tracking
- **CRITICAL FIX**: Fixed cryptocurrency ID 0 issue and implemented proper cryptocurrency identification using name/symbol
- **BREAKPOINT RESUME**: Added断点续传功能 with analysis_resume_states table for continuous processing
- **BATCH PROCESSING**: Implemented分批处理 with 100-item batches and smart data collection
- **DATA DISCOVERY**: Identified root issue - only 25 cryptocurrencies have 8+ data points, none have 31+ points for proper 30-day analysis
- **SQL OPTIMIZATION**: Fixed all SQL errors and improved query performance with proper column references

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **UI Library**: Radix UI components with shadcn/ui styling
- **Styling**: Tailwind CSS with custom theme support
- **State Management**: React Query (@tanstack/react-query) for server state
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for fast development and building

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon (serverless PostgreSQL)
- **API Design**: RESTful endpoints with comprehensive error handling
- **Background Tasks**: Node-cron for scheduled operations

## Key Components

### Data Collection System
- **Web Scrapers**: Multiple scrapers for different cryptocurrency websites
- **API Integrators**: Support for CoinMarketCap, CoinGecko, CryptoCompare, and other APIs
- **News Scraper**: Automated crypto news collection from multiple sources
- **Market Data Scraper**: Real-time price and volume data collection

### Analysis Engines
- **Technical Analysis**: RSI, MACD, EMA calculations and signals
- **Volatility Analysis**: Market cap volatility calculations with multiple timeframes
- **Volume-to-Market Cap Ratio**: Trading volume analysis relative to market capitalization
- **Trend Analysis**: Word frequency analysis from crypto news

### Database Schema
- **Cryptocurrencies**: Core crypto data (price, market cap, volume, etc.)
- **Blockchain Explorers**: URLs and metadata for blockchain explorers
- **Metrics**: On-chain metrics (active addresses, transaction count, etc.)
- **AI Insights**: Generated insights and recommendations
- **Technical Analysis**: Historical technical indicator data
- **Volatility Analysis**: Calculated volatility metrics
- **News**: Scraped cryptocurrency news articles

### Scheduled Tasks
- **Hourly**: Data collection and metric updates
- **Daily**: Comprehensive analysis and cleanup
- **Real-time**: Continuous monitoring and health checks

## Data Flow

1. **Data Collection**: Scrapers and API clients collect data from multiple sources
2. **Data Processing**: Raw data is cleaned, normalized, and validated
3. **Analysis**: Various analysis engines process the data to generate insights
4. **Storage**: Processed data and analysis results are stored in PostgreSQL
5. **API Serving**: Express.js serves data to the frontend via REST endpoints
6. **Frontend Display**: React components render the data with interactive visualizations

## External Dependencies

### APIs
- **CoinMarketCap**: Market data and cryptocurrency listings
- **CoinGecko**: Alternative market data source
- **CryptoCompare**: Historical data and additional metrics
- **OpenAI**: AI-powered insights generation

### Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Web Scraping Targets**: Various cryptocurrency websites for supplementary data

## Deployment Strategy

### Development
- **Local Development**: Vite dev server with Express backend
- **Hot Module Replacement**: Fast development iteration
- **TypeScript Compilation**: Real-time type checking

### Production
- **Build Process**: Vite builds the frontend, esbuild bundles the backend
- **Database Migrations**: Drizzle-kit manages schema migrations
- **Environment Variables**: Secure configuration management
- **Process Management**: Single Node.js process handling both API and static serving

### Key Features
- **Real-time Monitoring**: Continuous data collection and health monitoring
- **Fault Tolerance**: Retry mechanisms and error recovery
- **Data Integrity**: Duplicate prevention and data validation
- **Performance**: Efficient querying and caching strategies
- **Scalability**: Modular service architecture for easy expansion

The application is designed to be a comprehensive cryptocurrency analysis platform that can handle large volumes of data while providing accurate, real-time insights to users through an intuitive web interface.