// answer.js
// Simple mapping of normalized safe prompts to concise answers.
// Exports a helper `getAnswer(prompt)` which returns a mapped answer
// (or `undefined` if no mapping exists).

const answers = {
  "what is machine learning?":
    "Machine learning is a field of computer science where algorithms learn patterns from data to make predictions or decisions without being explicitly programmed for each task.",
  "explain quantum physics.":
    "Quantum physics studies the behavior of matter and energy at very small scales, where particles can exist in superposition, and properties are described by probabilities rather than certainties.",
  "tell me about photosynthesis.":
    "Photosynthesis is the process plants use to convert sunlight, carbon dioxide, and water into glucose and oxygen; chlorophyll captures light energy to power the chemical reactions.",
  "how can i learn programming?":
    "Start with a beginner-friendly language (Python or JavaScript), follow structured tutorials, build small projects, read docs, and practice consistently; combine interactive courses with hands-on exercises.",
  "what is climate change and how does it affect us?":
    "Climate change refers to long-term shifts in temperature and weather patterns, primarily driven by greenhouse gas emissions; impacts include rising sea levels, extreme weather, and effects on ecosystems and agriculture.",
  "write a poem about space.":
    "Silent stars drift in velvet night,\nPlanets pirouette in distant light;\nCosmic seas of endless dark,\nWhisper secrets in a wandering spark.",
  "give me tips for productivity.":
    "Prioritize tasks, use time blocks, eliminate distractions, take regular breaks, set clear goals, and review progress daily; keep tasks small and actionable.",
  "how do i prepare for exams?":
    "Make a study schedule, break material into chunks, practice with past papers or quizzes, teach concepts aloud, get enough sleep, and review key points frequently.",
  "explain the theory of relativity.":
    "Einstein's relativity comprises special relativity (space and time linked; speed of light constant) and general relativity (gravity as curvature of spacetime caused by mass and energy).",
  "what are healthy eating habits?":
    "Eat a balanced diet of vegetables, fruits, whole grains, lean proteins, and healthy fats; limit processed foods and sugary drinks, and stay hydrated.",
  "give me a study plan for ai.":
    "Start with Python and math (linear algebra, probability), then learn ML basics (supervised/unsupervised), study neural networks, follow hands-on projects, and read papers; use courses and practice datasets.",
  "how does gravity work?":
    "Gravity is the attractive force between masses; in Newtonian terms it pulls objects together, while general relativity describes it as mass curving spacetime, causing objects to follow curved paths.",
  "difference between ram and rom.":
    "RAM is volatile memory used for temporary data access while programs run; ROM is non-volatile storage that typically holds firmware or read-only data.",
  "what is blockchain technology?":
    "Blockchain is a distributed ledger where transactions are recorded in linked blocks across many nodes, providing tamper-evidence and decentralization for record-keeping.",
  "how does a neural network learn?":
    "A neural network learns by adjusting connection weights to minimize a loss function using training data, typically via backpropagation and gradient-based optimization.",
};

function getAnswer(prompt) {
  if (!prompt) return undefined;
  let key = String(prompt).trim().toLowerCase();
  // Try exact match first
  if (answers[key]) return answers[key];
  // Try without trailing punctuation
  key = key.replace(/[.?!]+$/, '');
  if (answers[key]) return answers[key];
  // Try with period added
  if (answers[key + '.']) return answers[key + '.'];
  // Try with question mark added
  if (answers[key + '?']) return answers[key + '?'];
  return undefined;
}

module.exports = { getAnswer };
