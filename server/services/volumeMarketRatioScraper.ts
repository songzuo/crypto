/**
 * 交易量市值比率爬虫（旧）
 * 
 * 此文件内容已被服务器/服务/ratioAnalyzer.ts取代
 * 保留此文件仅为向后兼容现有引用
 */

import { log } from '../vite';
import { analyzeVolumeToMarketCapRatios as analyzeRatios } from './ratioAnalyzer';

// 导出正确功能的新函数
export const analyzeVolumeToMarketCapRatios = analyzeRatios;