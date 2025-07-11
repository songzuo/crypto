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
- Implemented complete volatility analysis with strict data validation
- Added proper data point requirements: 8 for 7-day, 31 for 30-day analysis
- Enhanced system to process all available cryptocurrencies before database storage
- Fixed database schema issues (timestamp vs created_at columns)
- System now correctly rejects insufficient data instead of saving partial calculations

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