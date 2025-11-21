const path = require('path');
const fs = require('fs');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { gzipSync } = require('zlib');

const PORT = process.env.PORT || 4000;

const DATA_FILES = {
  safe: path.resolve(__dirname, 'safe_prompts.csv'),
  unsafe: path.resolve(__dirname, 'unsafe_prompts.csv'),
};

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'with', 'for', 'to',
  'from', 'by', 'about', 'as', 'at', 'be', 'is', 'are', 'was', 'were', 'this',
  'that', 'it', 'of', 'so', 'can', 'you', 'me', 'my', 'your',
]);

const FUNCTION_WORDS = new Set([
  'i', 'you', 'he', 'she', 'they', 'we', 'am', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'shall', 'should', 'would',
  'could', 'may', 'might', 'must', 'not', 'no', 'yes', 'please',
]);

const baseTriggers = [
  /ignore (?:all )?(?:previous|prior) (?:rules|instructions)/i,
  /you are no longer/i,
  /act as/i,
  /developer mode/i,
  /system override/i,
  /disregard your training/i,
  /bypass (?:all )?(?:safety|rules)/i,
  /give me (?:your )?system prompt/i,
  /print your training data/i,
  /reveal .*configuration/i,
  /repeat after me/i,
  /hacked/i,
];

const datasets = loadDatasets();
const safeSamples = datasets.filter((row) => row.label === 'safe');
const unsafeSamples = datasets.filter((row) => row.label === 'unsafe');

const safeCorpus = safeSamples.map((s) => s.text).join('\n') || 'safe';
const unsafeCorpus = unsafeSamples.map((s) => s.text).join('\n') || 'unsafe';

const safeEntropyStats = computeEntropyStats(safeSamples);
const unsafeEntropyStats = computeEntropyStats(unsafeSamples);

const safeFeatureStats = computeFeatureStats(safeSamples.map((s) => computeFeatureVector(s.text)));

let totalScanned = 0;
let blockedCount = 0;

const fastify = Fastify({ logger: false });

fastify.register(cors, { origin: true });

fastify.get('/health', async () => ({ status: 'ok' }));

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

  return {
    ...analysis,
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
};

