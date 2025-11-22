# LLM Safety Gateway - Architecture & CPU Metrics Flow

## Complete Request/Response Cycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE (React)                           │
│  [Input] → [Safe Test] [Jailbreak] [Fuzzing] [Abnormal Syntax]         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
                    POST /analyze
              ┌──────────────────────┐
              │  { prompt: "..." }   │
              └──────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SECURITY GATEWAY (Node.js/Fastify)                   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 1: RITD (Role-Inversion Trap Detector)                  │   │
│  │  ├─ Check: "ignore", "forget", "override"                     │   │
│  │  ├─ Check: "act as", "pretend", "behave"                      │   │
│  │  ├─ Check: "system", "admin", "root"                          │   │
│  │  └─ Result: SAFE or DANGER ✓/✗                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                    IF BLOCKED: Return Error                             │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 2: NCD (Math-First Entropy / Normalization Complexity)   │   │
│  │  ├─ Compute: GZIP compression ratio                            │   │
│  │  ├─ Analyze: Text entropy scores                               │   │
│  │  ├─ Compare: Safe vs Unsafe baseline statistics                │   │
│  │  └─ Result: SAFE or DANGER ✓/✗                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                    IF BLOCKED: Return Error                             │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 3: LDF (Linguistic DNA Fingerprint)                      │   │
│  │  ├─ Extract: Feature vectors (length, stopwords, etc.)         │   │
│  │  ├─ Analyze: Statistical deviation from baseline               │   │
│  │  ├─ Score: Linguistic DNA similarity                           │   │
│  │  └─ Result: SAFE or DANGER ✓/✗                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                    IF BLOCKED: Return Error                             │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 4: LLM Judge (Final Gate)                                │   │
│  │  ├─ Final boolean: isSafe = true/false                         │   │
│  │  ├─ handleFilteredPrompt() triggered if SAFE                   │   │
│  │  └─ Result: Allow or Block ✓/✗                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                    IF SAFE: Proceed to Ollama                           │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ CPU METRICS COLLECTION                                          │   │
│  │  ├─ calculateCpuSpeed(): os.cpus().speed × cores              │   │
│  │  ├─ calculateCpuThroughput(): process.cpuUsage()              │   │
│  │  └─ Available Cores: os.cpus().length                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ IF SAFE: Forward to Ollama (CPU-Optimized)                     │   │
│  │  ├─ POST /api/generate                                         │   │
│  │  ├─ model: llama3.1                                            │   │
│  │  ├─ prompt: original text                                      │   │
│  │  ├─ stream: false (CPU-based)                                  │   │
│  │  └─ keep_alive: 5m (reduce cold starts)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ BUILD RESPONSE OBJECT                                           │   │
│  │  ├─ analysis: {result, layers, metrics}                        │   │
│  │ ┌─ UNSAFE: llmResponse = null                                  │   │
│  │ └─ SAFE: llmResponse = <Ollama output>                         │   │
│  │  ├─ counters: {totalScanned, blockedCount}                     │   │
│  │  ├─ performance: {cpuSpeed, cpuThroughput, cpuCores}  ◄─ NEW  │   │
│  │  └─ logs: [...array of debug messages]                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
                    JSON Response
              ┌──────────────────────────────┐
              │ {                            │
              │   result: "SAFE" | "BLOCKED" │
              │   layers: {...}              │
              │   counters: {...}            │
              │   llmResponse: "..." or null │
              │   performance: {             │
              │     cpuSpeed: 2400,          │
              │     cpuThroughput: 1500,     │
              │     cpuCores: 8              │
              │   }                          │
              │ }                            │
              └──────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FRONTEND DASHBOARD (React)                           │
│                                                                           │
│  ┌─ Metrics Updated ─┐                                                 │
│  │ • Linguistic Entropy                                                │
│  │ • Structural Deviation                                              │
│  │ • CPU Speed (MHz) ◄─────────────────────── NEW DISPLAY             │
│  │ • Gateway Status                                                    │
│  │ • CPU Throughput (MB/s) ◄──────────────── NEW DISPLAY             │
│  │ • CPU Cores Available ◄─────────────────── NEW DISPLAY             │
│  └───────────────────┘                                                 │
│                                                                           │
│  ┌─ Pipeline Visualization ─┐                                          │
│  │  [RITD] → [NCD] → [LDF] → [LLM]                                    │
│  │   ↓        ↓       ↓       ↓                                        │
│  │  ✓/✗     ✓/✗     ✓/✗     ✓/✗                                      │
│  └───────────────────────────┘                                         │
│                                                                           │
│  ┌─ Result Banner ───────────────────────────┐                         │
│  │ ✓ PROMPT SAFE & PROCESSED                 │                         │
│  │ or                                         │                         │
│  │ ✗ THREAT NEUTRALIZED                      │                         │
│  └────────────────────────────────────────────┘                         │
│                                                                           │
│  ┌─ System Logs ──────────────────────────────┐                         │
│  │ [SYSTEM] Gateway received prompt...         │                         │
│  │ [SUCCESS] RITD → Clean                     │                         │
│  │ [SUCCESS] NCD → Δ 0.23, entropy 3.5       │                         │
│  │ [SUCCESS] LDF → Deviation score 0.12      │                         │
│  │ [SUCCESS] Prompt cleared all defenses.     │                         │
│  │ [SYSTEM] CPU metrics: 2400MHz, 1500MB/s   │ ◄─ NEW                  │
│  └────────────────────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Safe vs Unsafe Prompt

### SAFE PROMPT PATH
```
User Input
    ↓
RITD ✓ (No triggers found)
    ↓
NCD ✓ (Normal entropy range)
    ↓
LDF ✓ (Normal linguistic pattern)
    ↓
LLM Judge: isSafe = true
    ↓
handleFilteredPrompt() EXECUTES
    ↓
POST to Ollama/api/generate
    ↓
Get LLM Response
    ↓
Collect CPU Metrics ◄─ NEW
    ↓
Return: { result: "SAFE", llmResponse: "...", performance: {...} }
```

### UNSAFE PROMPT PATH
```
User Input
    ↓
RITD ✗ (Trigger: "ignore previous")
    ↓
BLOCKED - Return Error
    ↓
Collect CPU Metrics ◄─ NEW (Still collected for monitoring)
    ↓
Return: { result: "BLOCKED", llmResponse: null, performance: {...} }

ALTERNATIVELY:

RITD ✓ → NCD ✗ (High entropy)
    ↓
    BLOCKED

OR:

RITD ✓ → NCD ✓ → LDF ✗ (Abnormal pattern)
    ↓
    BLOCKED
```

## CPU Metrics Collection Points

```javascript
// In /analyze route handler:

// 1. WHEN SAFE - Forward and collect metrics
if (analysis.result === 'SAFE') {
  llmResponse = await forwardToOllama(prompt);
  // CPU metrics calculated here
}

// 2. ALWAYS - Regardless of safe/unsafe
performance: {
  cpuSpeed: calculateCpuSpeed(),        // MHz
  cpuThroughput: calculateCpuThroughput(),  // MB/s  
  cpuCores: os.cpus().length            // count
}

// 3. Returned in response
return {
  ...analysis,
  llmResponse,
  counters: {...},
  performance: {...}  ◄─ NEW
};
```

## Key Improvements

### Before (GPU-Heavy)
- ❌ GPU load not monitored
- ❌ CPU utilization invisible
- ❌ No performance insights
- ❌ Scalability unclear

### After (CPU-Optimized)
- ✅ CPU Speed visible
- ✅ Throughput monitored
- ✅ Core availability tracked
- ✅ Better scaling decisions
- ✅ Real-time performance data
- ✅ Non-GPU deployments viable

## Integration Points

### Backend Integration
```javascript
// In server.js
const os = require('os');
const axios = require('axios');

function calculateCpuSpeed() { ... }
function calculateCpuThroughput() { ... }

fastify.post('/analyze', async (request, reply) => {
  // ... security checks ...
  return {
    // ... existing fields ...
    performance: {
      cpuSpeed: calculateCpuSpeed(),
      cpuThroughput: calculateCpuThroughput(),
      cpuCores: os.cpus().length
    }
  };
});
```

### Frontend Integration
```jsx
// In SafetyGateway.jsx
const [metrics, setMetrics] = useState({
  // ... existing ...
  cpuSpeed: 0,
  cpuThroughput: 0,
  cpuCores: 0
});

// In response handler
setMetrics(prev => ({
  ...prev,
  cpuSpeed: data?.performance?.cpuSpeed ?? prev.cpuSpeed,
  cpuThroughput: data?.performance?.cpuThroughput ?? prev.cpuThroughput,
  cpuCores: data?.performance?.cpuCores ?? prev.cpuCores
}));

// In render
<MetricCard label="CPU Speed (MHz)" value={metrics.cpuSpeed} active={true} />
<MetricCard label="CPU Throughput (MB/s)" value={metrics.cpuThroughput} active={true} />
<MetricCard label="CPU Cores Available" value={metrics.cpuCores} active={true} />
```
