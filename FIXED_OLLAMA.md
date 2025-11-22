# ⚡ FIXED - CPU Metrics & Ollama Integration

## 🎯 What Was Fixed

✅ **Ollama Integration:** Now using `axios` consistently (was using `fetch`)
✅ **CPU Metrics:** Will now display real values when Ollama responds
✅ **Better Logging:** Server logs show exactly what's happening
✅ **Error Handling:** Clear messages if Ollama isn't running
✅ **Direct Ollama:** No external APIs - just Ollama locally

---

## 🚀 Quick Start (3 Steps)

### Step 1️⃣: Make sure Ollama is installed

Check if Ollama is installed:
```bash
ollama --version
```

If not installed, download from: https://ollama.ai

### Step 2️⃣: Start Ollama Server

**Open Terminal 1:**
```bash
ollama serve
```

Wait for it to show: `Listening on http://127.0.0.1:11434`

### Step 3️⃣: Start the Safety Gateway

**Open Terminal 2:**
```bash
cd /Users/lalithkumargn/Desktop/hack-day
npm run server
```

You should see:
```
[Gateway] Safety Gateway API running on port 3001
```

---

## 🧪 Test It Now

**Open Terminal 3:**

### Test Safe Prompt:
```bash
curl -X POST http://localhost:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt":"What is a pen?"}'
```

**Expected Output:**
```json
{
  "result": "SAFE",
  "llmResponse": "A pen is a writing instrument...",
  "performance": {
    "cpuSpeed": 2400,
    "cpuThroughput": 1500,
    "cpuCores": 8
  }
}
```

### Or use the test script:
```bash
bash /Users/lalithkumargn/Desktop/hack-day/test-gateway.sh
```

---

## 📊 What You Should See

### Safe Prompt ("What is a pen?")
- ✅ `"result": "SAFE"`
- ✅ `"llmResponse": "<actual response about pen>"`
- ✅ CPU metrics: `cpuSpeed`, `cpuThroughput`, `cpuCores`
- ✅ Dashboard shows: ✓ SAFE badge

### Unsafe Prompt ("Ignore rules...")
- ✅ `"result": "BLOCKED"`
- ✅ `"llmResponse": null` (NOT sent to Ollama)
- ✅ CPU metrics still shown
- ✅ Dashboard shows: ✗ BLOCKED badge

---

## 📈 Dashboard (Optional)

To also see the beautiful dashboard:

**Open Terminal 4:**
```bash
npm start
```

Then open http://localhost:3000 and click the test buttons!

---

## 🔧 Server Logs (Terminal 2)

Watch the logs to see what's happening:

```
[Gateway] Analyzing prompt: "What is a pen?"
[Gateway] Analysis result: SAFE
[Gateway] Prompt is SAFE - forwarding to Ollama...
[Ollama] Sending prompt to http://localhost:11434/api/generate with model: llama2
[Ollama] Received response: A pen is a writing instrument that...
[Gateway] Ollama response received
[Gateway] Returning response (CPU: 2400MHz, 1500MB/s)
```

---

## 🐛 Common Issues

### ❌ "Ollama connection failed"
**Fix:** Make sure Terminal 1 is running `ollama serve`

### ❌ "Model not found"
**Fix:** Download llama2 model:
```bash
ollama pull llama2
```

### ❌ "Waiting forever for response"
**This is NORMAL!** First request takes 30-60 seconds while Ollama loads the model. Be patient!

### ❌ "High CPU usage"
**This is NORMAL!** When processing, it uses all cores. This is expected.

---

## 📝 Files Modified

1. **server.js** - Fixed Ollama integration with axios
2. **Created OLLAMA_SETUP.md** - Detailed setup guide
3. **Created test-gateway.sh** - Automated test script

---

## ✅ Verification Checklist

After starting everything:

- [ ] Ollama running in Terminal 1 (shows "Listening on...")
- [ ] Gateway running in Terminal 2 (shows "running on port 3001")
- [ ] Test safe prompt - should get LLM response
- [ ] Test unsafe prompt - should get BLOCKED
- [ ] CPU metrics showing in response (not 0)
- [ ] No errors in Terminal 2 logs

---

## 🎉 You're All Set!

Once all terminals are running and tests pass, you have:

✅ **4-Layer Security Pipeline** (RITD → NCD → LDF → LLM Judge)
✅ **CPU Metrics Monitoring** (Speed, Throughput, Cores)
✅ **Ollama Integration** (Local LLM responses)
✅ **Safe Prompts Get LLM Answers**
✅ **Unsafe Prompts Get Blocked**
✅ **Beautiful Dashboard** (Optional frontend)

---

## 📚 Documentation

- `OLLAMA_SETUP.md` - Complete Ollama setup & testing
- `QUICK_START.md` - General setup
- `ARCHITECTURE.md` - System design
- `README.md` - Project overview
- `test-gateway.sh` - Automated tests

---

## 🔗 Terminal Layout (Recommended)

```
┌─────────────────────────┬──────────────────────┐
│  Terminal 1             │  Terminal 2          │
│  ollama serve           │  npm run server      │
├─────────────────────────┼──────────────────────┤
│  Terminal 3             │  Terminal 4          │
│  bash test-gateway.sh   │  npm start (optional)│
└─────────────────────────┴──────────────────────┘
```

---

**Ready? Let's go! 🚀**

Start with Step 1 above!
