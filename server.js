const fastify = require('fastify')({ logger: true });
const fs = require('fs');
const { gzipSync } = require('zlib');
const path = require('path');

// Register CORS
fastify.register(require('@fastify/cors'), {
  origin: true
});

const PORT = process.env.PORT || 3001;

// Data files
const DATA_FILES = {
  safe: path.join(__dirname, 'safe_prompts.csv'),
  unsafe: path.join(__dirname, 'unsafe_prompts.csv'),
};

// Stopwords and function words for linguistic analysis
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
]);

const FUNCTION_WORDS = new Set([
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'during', 'except', 'from', 'into', 'near', 'over', 'through', 'toward', 'under', 'until', 'upon', 'within', 'without'
]);

// Role inversion detection patterns
const baseTriggers = [
  /(?:ignore|forget|disregard).{0,20}(?:previous|above|prior|earlier)/i,
  /(?:act|behave|pretend).{0,20}(?:as|like).{0,20}(?:different|another|new)/i,
  /(?:system|admin|root|developer).{0,20}(?:mode|access|override|bypass)/i,
  /(?:reveal|show|tell|give).{0,20}(?:secret|hidden|confidential|private)/i,
];

// Global variables for statistics
let totalScanned = 0;
let blockedCount = 0;

// Load and process datasets
const datasets = loadDatasets();
const safeData = datasets.filter(row => row.label === 'safe');
const unsafeData = datasets.filter(row => row.label === 'unsafe');

// Compute baseline statistics
const safeEntropyStats = computeEntropyStats(safeData);
const unsafeEntropyStats = computeEntropyStats(unsafeData);

const safeFeatureVectors = safeData.map(row => computeFeatureVector(row.text));
const safeFeatureStats = computeFeatureStats(safeFeatureVectors);

// Create corpus for NCD analysis
const safeCorpus = safeData.slice(0, 100).map(row => row.text).join('\n');
const unsafeCorpus = unsafeData.slice(0, 100).map(row => row.text).join('\n');

// Forward to Ollama
async function forwardToOllama(prompt) {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
    
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.response || 'No response from LLM';
  } catch (err) {
    console.error('Ollama forwarding failed:', err);
    return `Fallback: LLM unavailable (ensure 'ollama serve' is running). Error: ${err.message}`;
  }
}

fastify.post('/analyze', async (request, reply) => {
  const { prompt } = request.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return reply.code(400).send({ error: 'Prompt text is required' });
  }

  const analysis = analyzePrompt(prompt);
  totalScanned += 1;
  if (analysis.result === 'BLOCKED') {
    blockedCount += 1;
  }

  // Forward to Ollama if safe
  let llmResponse = null;
  if (analysis.result === 'SAFE') {
    llmResponse = await forwardToOllama(prompt);
  }

  return {
    ...analysis,
    llmResponse,  // Only populated if SAFE
    counters: {
      totalScanned,
      blockedCount,
    },
  };
});

async function startServer() {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Safety Gateway API running on port ${PORT}`);
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

function loadDatasets() {
  const rows = [];
  Object.entries(DATA_FILES).forEach(([key, filePath]) => {
    const fileContents = fs.readFileSync(filePath, 'utf-8').trim();
    const lines = fileContents.split('\n').slice(1); // remove header
    lines.forEach((line) => {
      if (!line) return;
      const [textRaw, labelRaw] = splitCsvLine(line);
      const label = labelRaw?.trim() === '1' ? 'unsafe' : 'safe';
      rows.push({
        text: textRaw.trim(),
        label: label || key,
      });
    });
  });
  return rows;
}

function splitCsvLine(line) {
  if (!line.includes(',')) {
    return [line, ''];
  }
  const firstCommaIndex = line.indexOf(',');
  const text = line.slice(0, firstCommaIndex);
  const label = line.slice(firstCommaIndex + 1);
  return [stripQuotes(text), label];
}

function stripQuotes(value = '') {
  return value.replace(/^"(.*)"$/, '$1');
}

function computeEntropyStats(samples) {
  const scores = samples.map((row) => computeEntropyScore(row.text));
  return summarize(scores);
}

function computeEntropyScore(text) {
  if (!text) return 0;
  const buffer = Buffer.from(text, 'utf-8');
  if (buffer.length === 0) return 0;
  const compressed = gzipSync(buffer);
  return compressed.length / buffer.length;
}

function computeFeatureStats(featureVectors) {
  if (featureVectors.length === 0) return {};
  const keys = Object.keys(featureVectors[0]);
  return keys.reduce((acc, key) => {
    const values = featureVectors.map((vec) => vec[key]);
    acc[key] = summarize(values);
    return acc;
  }, {});
}

function summarize(values) {
  if (!values.length) {
    return { mean: 0, std: 0 };
  }
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) || 0.0001 };
}

function computeFeatureVector(text) {
  const sanitized = text || '';
  const length = sanitized.length || 1;
  const tokens = sanitized.toLowerCase().match(/\b[\w']+\b/g) || [];
  const tokenCount = tokens.length || 1;
  const uniqueTokens = new Set(tokens);
  const uppercaseCount = (sanitized.match(/[A-Z]/g) || []).length;
  const digitCount = (sanitized.match(/\d/g) || []).length;
  const punctuationCount = (sanitized.match(/[^\w\s]/g) || []).length;
  const whitespaceCount = (sanitized.match(/\s/g) || []).length;
  const longestRun = longestRepeatingRun(sanitized);

  const stopwordHits = tokens.filter((token) => STOPWORDS.has(token)).length;
  const functionWordHits = tokens.filter((token) => FUNCTION_WORDS.has(token)).length;
  const avgTokenLength = tokens.reduce((sum, token) => sum + token.length, 0) / tokenCount;

  return {
    tokenCount,
    avgTokenLength,
    stopwordRatio: stopwordHits / tokenCount,
    functionWordRatio: functionWordHits / tokenCount,
    uppercaseRatio: uppercaseCount / length,
    digitRatio: digitCount / length,
    punctuationRatio: punctuationCount / length,
    uniqueTokenRatio: uniqueTokens.size / tokenCount,
    longestRunRatio: longestRun / length,
    whitespaceRatio: whitespaceCount / length,
  };
}

function longestRepeatingRun(text) {
  if (!text) return 0;
  let maxRun = 1;
  let currentRun = 1;
  for (let i = 1; i < text.length; i += 1) {
    if (text[i] === text[i - 1]) {
      currentRun += 1;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }
  return maxRun;
}

function detectRoleInversion(prompt) {
  const matches = [];
  baseTriggers.forEach((pattern) => {
    if (pattern.test(prompt)) {
      matches.push(pattern.source.replace(/\(\?:|\)/g, '').slice(0, 60));
    }
  });
  return matches;
}

function computeNcd(sample, corpus) {
  const sampleBuffer = Buffer.from(sample, 'utf-8');
  const corpusBuffer = Buffer.from(corpus, 'utf-8');
  if (!sampleBuffer.length || !corpusBuffer.length) {
    return 1;
  }
  const cSample = gzipSync(sampleBuffer).length;
  const cCorpus = gzipSync(corpusBuffer).length;
  const cCombined = gzipSync(Buffer.concat([sampleBuffer, Buffer.from('\n'), corpusBuffer])).length;
  const numerator = cCombined - Math.min(cSample, cCorpus);
  const denominator = Math.max(cSample, cCorpus);
  if (!denominator) return 1;
  return Number((numerator / denominator).toFixed(4));
}

function computeDeviation(featureVector, baselineStats) {
  const deviations = Object.entries(featureVector).map(([key, value]) => {
    const stats = baselineStats[key] || { mean: 0, std: 1 };
    if (!stats.std) return 0;
    return Math.abs((value - stats.mean) / stats.std);
  });

  const averageDeviation = deviations.reduce((sum, val) => sum + val, 0) / deviations.length;
  return Number(averageDeviation.toFixed(2));
}

function normalizeEntropy(entropyScore) {
  const range = unsafeEntropyStats.mean - safeEntropyStats.mean || 0.0001;
  const normalized = (entropyScore - safeEntropyStats.mean) / range;
  return Math.max(0, Math.min(1, normalized));
}

function analyzePrompt(prompt) {
  const cleanedPrompt = prompt.trim();

  const ritdHits = detectRoleInversion(cleanedPrompt);
  const entropyScore = computeEntropyScore(cleanedPrompt);
  const normalizedEntropy = normalizeEntropy(entropyScore);
  const ncdSafe = computeNcd(cleanedPrompt, safeCorpus);
  const ncdUnsafe = computeNcd(cleanedPrompt, unsafeCorpus);
  const ncdDelta = Number((ncdSafe - ncdUnsafe).toFixed(4));

  const featureVector = computeFeatureVector(cleanedPrompt);
  const deviationScore = computeDeviation(featureVector, safeFeatureStats);

  const ritdBlocked = ritdHits.length > 0;
  const entropyThresholdHigh = safeEntropyStats.mean + safeEntropyStats.std * 2.2;
  const entropyThresholdLow = Math.max(0, safeEntropyStats.mean - safeEntropyStats.std * 2.2);
  const entropyAnomaly = entropyScore > entropyThresholdHigh || entropyScore < entropyThresholdLow;
  const ncdAnomaly = ncdDelta > 0.025;
  const ldfBlocked = deviationScore > 2.8;

  const ncdBlocked = entropyAnomaly || ncdAnomaly;

  const result = ritdBlocked || ncdBlocked || ldfBlocked ? 'BLOCKED' : 'SAFE';

  const layerSummaries = {
    RITD: {
      status: ritdBlocked ? 'danger' : 'safe',
      reason: ritdBlocked ? 'Role inversion / guardrail bypass attempt detected.' : 'No role inversion patterns detected.',
      hits: ritdHits,
    },
    NCD: {
      status: ncdBlocked ? 'danger' : 'safe',
      reason: ncdBlocked
        ? 'Entropy or compression profile deviates from safe baseline.'
        : 'Compression profile aligned with safe prompts.',
      entropyScore: Number(entropyScore.toFixed(3)),
      normalizedEntropy: Number(normalizedEntropy.toFixed(3)),
      ncdSafe,
      ncdUnsafe,
      ncdDelta,
    },
    LDF: {
      status: ldfBlocked ? 'danger' : 'safe',
      reason: ldfBlocked
        ? 'Structural fingerprint deviates significantly from safe corpus.'
        : 'Linguistic fingerprint within safe bounds.',
      deviationScore,
      vector: featureVector,
    },
  };

  const logs = [
    { type: 'system', msg: `Gateway received prompt (${cleanedPrompt.length} chars).` },
    {
      type: layerSummaries.RITD.status === 'danger' ? 'error' : 'success',
      msg: `RITD → ${layerSummaries.RITD.reason}`,
    },
    {
      type: layerSummaries.NCD.status === 'danger' ? 'error' : 'success',
      msg: `NCD → Δ ${ncdDelta}, entropy ${layerSummaries.NCD.entropyScore}`,
    },
    {
      type: layerSummaries.LDF.status === 'danger' ? 'error' : 'success',
      msg: `LDF → deviation score ${deviationScore}`,
    },
  ];

  logs.push({
    type: result === 'SAFE' ? 'success' : 'error',
    msg: result === 'SAFE' ? 'Prompt cleared all layers.' : 'Prompt quarantined before LLM.',
  });

  return {
    result,
    layers: layerSummaries,
    metrics: {
      ncdScore: Number(layerSummaries.NCD.entropyScore.toFixed(2)),
      ldfScore: deviationScore,
    },
    logs,
  };
}

module.exports = {
  fastify,
  analyzePrompt,
  forwardToOllama,
};