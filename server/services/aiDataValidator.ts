import axios from 'axios';

// 智谱AI配置
const ZHIPU_API_KEY = 'f5e44c5c0001420598434ca9ff50a0df.LC9gVloXbGexZeBa';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// AI验证结果接口
interface AIValidationResult {
  isValid: boolean;
  confidence: number; // 0-1
  issues: string[];
  suggestions: string[];
  correctedData?: any;
}

// 调用智谱AI进行数据验证
async function callZhipuAI(messages: any[], model: string = 'glm-4.6'): Promise<any> {
  try {
    const response = await axios.post(ZHIPU_API_URL, {
      model: model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 2048
    }, {
      headers: {
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return response.data;
  } catch (error: any) {
    console.error('❌ 智谱AI调用失败:', error.message);
    throw error;
  }
}

// 验证单条历史数据
export async function validateHistoricalDataWithAI(data: any): Promise<AIValidationResult> {
  const prompt = `
请验证以下加密货币历史数据的合理性：

数据详情：
- 币种: ${data.symbol}
- 日期: ${data.date}
- 开盘价: ${data.open}
- 最高价: ${data.high}
- 最低价: ${data.low}
- 收盘价: ${data.close}
- 成交量: ${data.volume}
- 市值: ${data.marketCap || 'N/A'}
- 数据来源: ${data.source}

请分析：
1. 价格数据是否合理（开盘价、最高价、最低价、收盘价的关系）
2. 成交量是否与价格波动匹配
3. 是否存在异常值或可疑数据
4. 数据是否符合该币种的历史表现特征

请给出验证结果和建议。
`;

  try {
    const aiResponse = await callZhipuAI([
      {
        role: 'system',
        content: '你是一个专业的加密货币数据分析专家，擅长验证历史数据的合理性和准确性。'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);

    const aiContent = aiResponse.choices[0].message.content;
    
    // 解析AI响应
    return parseAIValidationResponse(aiContent, data);
    
  } catch (error) {
    // AI调用失败时使用基础验证
    return performBasicValidation(data);
  }
}

// 解析AI验证响应
function parseAIValidationResponse(aiContent: string, originalData: any): AIValidationResult {
  // 基础验证结果
  const basicResult = performBasicValidation(originalData);
  
  // 从AI响应中提取信息
  const isValid = !aiContent.toLowerCase().includes('异常') && 
                  !aiContent.toLowerCase().includes('可疑') &&
                  !aiContent.toLowerCase().includes('不合理');
  
  const confidence = isValid ? 0.8 : 0.3;
  
  // 提取问题和建议
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // 简单的关键词提取
  if (aiContent.toLowerCase().includes('价格异常')) {
    issues.push('价格数据可能存在异常');
  }
  if (aiContent.toLowerCase().includes('成交量异常')) {
    issues.push('成交量数据可能存在异常');
  }
  if (aiContent.toLowerCase().includes('建议')) {
    suggestions.push('AI建议进一步验证数据准确性');
  }
  
  return {
    isValid: isValid && basicResult.isValid,
    confidence: Math.max(confidence, basicResult.confidence),
    issues: [...basicResult.issues, ...issues],
    suggestions: [...basicResult.suggestions, ...suggestions],
    correctedData: basicResult.correctedData
  };
}

// 基础验证逻辑
function performBasicValidation(data: any): AIValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // 价格关系验证
  if (data.high < data.low) {
    issues.push('最高价低于最低价');
  }
  if (data.open <= 0 || data.high <= 0 || data.low <= 0 || data.close <= 0) {
    issues.push('价格数据包含非正值');
  }
  if (data.volume < 0) {
    issues.push('成交量为负值');
  }
  
  // 价格范围验证
  if (data.open > data.high || data.open < data.low) {
    issues.push('开盘价超出当日价格范围');
  }
  if (data.close > data.high || data.close < data.low) {
    issues.push('收盘价超出当日价格范围');
  }
  
  const isValid = issues.length === 0;
  
  return {
    isValid,
    confidence: isValid ? 0.9 : 0.2,
    issues,
    suggestions: isValid ? ['数据通过基础验证'] : ['建议检查数据源准确性']
  };
}

// 批量验证数据
export async function validateBatchDataWithAI(data: any[]): Promise<{
  validData: any[];
  invalidData: any[];
  validationResults: AIValidationResult[];
}> {
  const validData: any[] = [];
  const invalidData: any[] = [];
  const validationResults: AIValidationResult[] = [];
  
  for (const item of data) {
    try {
      const result = await validateHistoricalDataWithAI(item);
      validationResults.push(result);
      
      if (result.isValid && result.confidence > 0.6) {
        validData.push(item);
      } else {
        invalidData.push(item);
      }
    } catch (error) {
      // AI验证失败时使用基础验证
      const basicResult = performBasicValidation(item);
      validationResults.push(basicResult);
      
      if (basicResult.isValid) {
        validData.push(item);
      } else {
        invalidData.push(item);
      }
    }
  }
  
  return { validData, invalidData, validationResults };
}

// 数据增强 - 使用AI补充缺失数据
export async function enhanceDataWithAI(data: any): Promise<any> {
  const prompt = `
请分析以下加密货币历史数据，并补充可能缺失的信息：

原始数据：
- 币种: ${data.symbol}
- 日期: ${data.date}
- 开盘价: ${data.open}
- 最高价: ${data.high}
- 最低价: ${data.low}
- 收盘价: ${data.close}
- 成交量: ${data.volume}
- 市值: ${data.marketCap || 'N/A'}

请基于该币种的历史表现和市场特征，补充以下信息：
1. 价格波动分析
2. 成交量与价格的关系
3. 市场情绪分析
4. 技术指标建议

请以JSON格式返回增强后的数据。
`;

  try {
    const aiResponse = await callZhipuAI([
      {
        role: 'system',
        content: '你是一个专业的加密货币数据分析师，擅长基于历史数据补充市场分析信息。请以JSON格式返回结果。'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);
    
    const aiContent = aiResponse.choices[0].message.content;
    
    // 尝试解析JSON响应
    try {
      const enhancedInfo = JSON.parse(aiContent);
      return {
        ...data,
        enhancedInfo,
        aiAnalysis: true
      };
    } catch (parseError) {
      // 如果JSON解析失败，返回文本分析
      return {
        ...data,
        aiAnalysis: aiContent,
        enhancedInfo: { analysis: aiContent }
      };
    }
    
  } catch (error) {
    console.error('❌ AI数据增强失败:', error);
    return data; // 返回原始数据
  }
}

// 多源数据对比验证
export async function compareMultipleSourcesWithAI(dataFromMultipleSources: any[]): Promise<{
  consensusData: any;
  confidence: number;
  discrepancies: string[];
}> {
  if (dataFromMultipleSources.length === 0) {
    return {
      consensusData: null,
      confidence: 0,
      discrepancies: ['无数据可对比']
    };
  }
  
  if (dataFromMultipleSources.length === 1) {
    return {
      consensusData: dataFromMultipleSources[0],
      confidence: 0.7,
      discrepancies: ['只有一个数据源']
    };
  }
  
  // 使用AI进行多源数据对比
  const prompt = `
请对比以下来自不同数据源的加密货币历史数据：

${dataFromMultipleSources.map((data, index) => `
数据源 ${index + 1}:
- 来源: ${data.source}
- 开盘价: ${data.open}
- 最高价: ${data.high}
- 最低价: ${data.low}
- 收盘价: ${data.close}
- 成交量: ${data.volume}
`).join('
')}

请分析：
1. 各数据源之间的一致性
2. 识别可能的异常数据
3. 推荐最可靠的数据值
4. 指出数据差异和原因

请以JSON格式返回分析结果。
`;

  try {
    const aiResponse = await callZhipuAI([
      {
        role: 'system',
        content: '你是一个专业的加密货币数据验证专家，擅长多源数据对比分析。请以JSON格式返回结果。'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);
    
    const aiContent = aiResponse.choices[0].message.content;
    
    try {
      const comparisonResult = JSON.parse(aiContent);
      return comparisonResult;
    } catch (parseError) {
      // 默认返回第一个数据源
      return {
        consensusData: dataFromMultipleSources[0],
        confidence: 0.5,
        discrepancies: ['AI分析结果解析失败']
      };
    }
    
  } catch (error) {
    // AI调用失败时使用简单对比逻辑
    return performSimpleComparison(dataFromMultipleSources);
  }
}

// 简单对比逻辑
function performSimpleComparison(dataFromMultipleSources: any[]): {
  consensusData: any;
  confidence: number;
  discrepancies: string[];
} {
  const discrepancies: string[] = [];
  
  // 计算价格平均值
  const avgOpen = dataFromMultipleSources.reduce((sum, data) => sum + data.open, 0) / dataFromMultipleSources.length;
  const avgHigh = dataFromMultipleSources.reduce((sum, data) => sum + data.high, 0) / dataFromMultipleSources.length;
  const avgLow = dataFromMultipleSources.reduce((sum, data) => sum + data.low, 0) / dataFromMultipleSources.length;
  const avgClose = dataFromMultipleSources.reduce((sum, data) => sum + data.close, 0) / dataFromMultipleSources.length;
  const avgVolume = dataFromMultipleSources.reduce((sum, data) => sum + data.volume, 0) / dataFromMultipleSources.length;
  
  // 检查数据差异
  const priceTolerance = 0.1; // 10%的价格容忍度
  
  dataFromMultipleSources.forEach((data, index) => {
    const openDiff = Math.abs(data.open - avgOpen) / avgOpen;
    const highDiff = Math.abs(data.high - avgHigh) / avgHigh;
    const lowDiff = Math.abs(data.low - avgLow) / avgLow;
    const closeDiff = Math.abs(data.close - avgClose) / avgClose;
    
    if (openDiff > priceTolerance || highDiff > priceTolerance || 
        lowDiff > priceTolerance || closeDiff > priceTolerance) {
      discrepancies.push(`数据源 ${index + 1} (${data.source}) 价格差异较大`);
    }
  });
  
  // 构建共识数据
  const consensusData = {
    ...dataFromMultipleSources[0],
    open: avgOpen,
    high: avgHigh,
    low: avgLow,
    close: avgClose,
    volume: avgVolume,
    source: '多源共识',
    verified: true
  };
  
  const confidence = discrepancies.length === 0 ? 0.9 : 0.6;
  
  return {
    consensusData,
    confidence,
    discrepancies
  };
}
  const suggestions: string[] = [];
  
  if (aiContent.includes('问题') || aiContent.includes('异常')) {
    issues.push('AI检测到数据可能存在异常');
  }
  
  if (aiContent.includes('建议')) {
    suggestions.push('AI建议进一步验证数据准确性');
  }
  
  return {
    isValid: basicResult.isValid && isValid,
    confidence: Math.max(basicResult.confidence, confidence),
    issues: [...basicResult.issues, ...issues],
    suggestions: [...basicResult.suggestions, ...suggestions],
    correctedData: originalData
  };
}

// 基础数据验证
function performBasicValidation(data: any): AIValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // 检查价格合理性
  if (data.high < data.low) {
    issues.push('最高价低于最低价');
  }
  
  if (data.open <= 0 || data.high <= 0 || data.low <= 0 || data.close <= 0) {
    issues.push('价格数据包含非正值');
  }
  
  if (data.volume < 0) {
    issues.push('成交量为负值');
  }
  
  // 检查价格范围合理性
  const priceRange = data.high - data.low;
  if (priceRange > data.close * 0.5) { // 日内波动超过50%
    issues.push('日内价格波动异常大');
  }
  
  // 检查市值合理性（如果存在）
  if (data.marketCap && data.marketCap > 0) {
    const impliedPrice = data.marketCap / 1000000000; // 假设10亿流通量
    if (Math.abs(data.close - impliedPrice) / data.close > 10) {
      issues.push('市值与价格不匹配');
    }
  }
  
  const isValid = issues.length === 0;
  const confidence = isValid ? 0.9 : 0.4;
  
  return {
    isValid,
    confidence,
    issues,
    suggestions
  };
}

// 批量验证数据
export async function validateBatchDataWithAI(dataArray: any[]): Promise<{
  validData: any[];
  invalidData: any[];
  validationResults: AIValidationResult[];
}> {
  const validData: any[] = [];
  const invalidData: any[] = [];
  const validationResults: AIValidationResult[] = [];
  
  for (const data of dataArray) {
    try {
      const result = await validateHistoricalDataWithAI(data);
      validationResults.push(result);
      
      if (result.isValid && result.confidence > 0.6) {
        validData.push(data);
      } else {
        invalidData.push(data);
      }
    } catch (error) {
      // 验证失败时使用基础验证
      const basicResult = performBasicValidation(data);
      validationResults.push(basicResult);
      
      if (basicResult.isValid) {
        validData.push(data);
      } else {
        invalidData.push(data);
      }
    }
  }
  
  return {
    validData,
    invalidData,
    validationResults
  };
}

// 数据补充和修正
export async function enhanceDataWithAI(incompleteData: any): Promise<any> {
  const prompt = `
请基于以下不完整的加密货币数据，补充缺失的信息并进行合理性修正：

原始数据：
${JSON.stringify(incompleteData, null, 2)}

需要补充的信息：
1. 如果价格数据缺失，请基于历史趋势进行合理估算
2. 如果成交量异常，请进行修正
3. 如果市值数据缺失，请基于价格和流通量进行估算
4. 确保所有补充数据符合该币种的历史特征

请返回完整的、修正后的数据。
`;

  try {
    const aiResponse = await callZhipuAI([
      {
        role: 'system',
        content: '你是一个专业的加密货币数据分析专家，擅长基于不完整数据进行合理补充和修正。'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);

    const aiContent = aiResponse.choices[0].message.content;
    
    // 尝试解析AI返回的JSON数据
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.log('❌ 无法解析AI返回的JSON数据');
    }
    
    // 如果无法解析JSON，返回原始数据
    return incompleteData;
    
  } catch (error) {
    console.log('❌ AI数据补充失败，返回原始数据');
    return incompleteData;
  }
}

// 数据源可信度评估
export async function evaluateDataSourceCredibility(source: string, data: any[]): Promise<{
  credibility: number; // 0-1
  reliability: string; // 'high' | 'medium' | 'low'
  issues: string[];
  recommendations: string[];
}> {
  const prompt = `
请评估以下加密货币数据源的可信度：

数据源: ${source}
数据样本: ${JSON.stringify(data.slice(0, 5), null, 2)}
数据总量: ${data.length} 条

请分析：
1. 该数据源的历史准确性
2. 数据的一致性和完整性
3. 是否存在系统性偏差
4. 与其他数据源的对比情况

请给出可信度评分（0-1）和建议。
`;

  try {
    const aiResponse = await callZhipuAI([
      {
        role: 'system',
        content: '你是一个专业的加密货币数据质量评估专家，擅长评估不同数据源的可信度和可靠性。'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);

    const aiContent = aiResponse.choices[0].message.content;
    
    // 解析AI响应
    return parseDataSourceEvaluation(aiContent, source);
    
  } catch (error) {
    // AI调用失败时返回中等可信度
    return {
      credibility: 0.5,
      reliability: 'medium',
      issues: ['无法通过AI评估数据源可信度'],
      recommendations: ['建议手动验证数据准确性']
    };
  }
}

// 解析数据源评估结果
function parseDataSourceEvaluation(aiContent: string, source: string): {
  credibility: number;
  reliability: string;
  issues: string[];
  recommendations: string[];
} {
  // 从AI响应中提取可信度评分
  let credibility = 0.7; // 默认中等可信度
  
  const credibilityMatch = aiContent.match(/可信度[：:]?\s*([0-9.]+)/);
  if (credibilityMatch) {
    credibility = parseFloat(credibilityMatch[1]);
  }
  
  // 确定可靠性等级
  let reliability: 'high' | 'medium' | 'low' = 'medium';
  if (credibility >= 0.8) reliability = 'high';
  else if (credibility <= 0.4) reliability = 'low';
  
  // 提取问题和建议
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  if (aiContent.includes('问题') || aiContent.includes('异常')) {
    issues.push('AI检测到数据源可能存在系统性问题');
  }
  
  if (aiContent.includes('建议')) {
    recommendations.push('AI建议与其他数据源交叉验证');
  }
  
  return {
    credibility,
    reliability,
    issues,
    recommendations
  };
}