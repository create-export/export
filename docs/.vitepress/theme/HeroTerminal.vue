<script setup>
import { ref, onMounted, onUnmounted } from "vue";

const el = ref(null);
const rotateX = ref(0);
const rotateY = ref(0);
const typedLines = ref([]);
const cursorVisible = ref(true);

const CODE_LINES = [
  { text: 'import { greet, Counter }', cls: 'kw' },
  { text: '  from "https://my-worker.dev/";\n', cls: 'str' },
  { text: '\n', cls: '' },
  { text: 'const msg = await greet("World");', cls: 'fn' },
  { text: '// "Hello, World!"\n', cls: 'cmt' },
  { text: '\n', cls: '' },
  { text: 'const counter = await new Counter(0);', cls: 'fn' },
  { text: 'await counter.increment();', cls: 'fn' },
  { text: '// 1\n', cls: 'cmt' },
  { text: 'await counter.increment();', cls: 'fn' },
  { text: '// 2\n', cls: 'cmt' },
];

let rafId = null;
let typeTimeout = null;

function onMouseMove(e) {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    rotateY.value = ((e.clientX - cx) / cx) * 12;
    rotateX.value = ((cy - e.clientY) / cy) * 8;
    rafId = null;
  });
}

function startTyping() {
  let lineIdx = 0;
  let charIdx = 0;
  typedLines.value = [{ text: "", cls: CODE_LINES[0].cls }];

  function typeNext() {
    if (lineIdx >= CODE_LINES.length) {
      // Loop after pause
      typeTimeout = setTimeout(() => {
        typedLines.value = [{ text: "", cls: CODE_LINES[0].cls }];
        lineIdx = 0;
        charIdx = 0;
        typeNext();
      }, 3000);
      return;
    }

    const line = CODE_LINES[lineIdx];
    if (charIdx < line.text.length) {
      typedLines.value[typedLines.value.length - 1].text += line.text[charIdx];
      charIdx++;
      const delay = line.text[charIdx - 1] === "\n" ? 400 : line.cls === "cmt" ? 25 : 45;
      typeTimeout = setTimeout(typeNext, delay);
    } else {
      lineIdx++;
      charIdx = 0;
      if (lineIdx < CODE_LINES.length) {
        typedLines.value.push({ text: "", cls: CODE_LINES[lineIdx].cls });
      }
      typeTimeout = setTimeout(typeNext, 80);
    }
  }

  typeNext();
}

onMounted(() => {
  window.addEventListener("mousemove", onMouseMove);
  startTyping();
  const blink = setInterval(() => { cursorVisible.value = !cursorVisible.value; }, 530);
  onUnmounted(() => {
    window.removeEventListener("mousemove", onMouseMove);
    clearInterval(blink);
    if (typeTimeout) clearTimeout(typeTimeout);
    if (rafId) cancelAnimationFrame(rafId);
  });
});
</script>

<template>
  <div class="hero-terminal-wrapper" ref="el">
    <div
      class="hero-terminal"
      :style="{
        transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      }"
    >
      <div class="terminal-bar">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
        <span class="terminal-title">client.js</span>
      </div>
      <div class="terminal-body">
        <div class="line-numbers">
          <span v-for="(_, i) in typedLines" :key="i">{{ i + 1 }}</span>
        </div>
        <pre class="code"><span
  v-for="(line, i) in typedLines"
  :key="i"
  :class="line.cls"
>{{ line.text }}</span><span class="cursor" :class="{ off: !cursorVisible }">|</span></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-terminal-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 0 1rem;
}

.hero-terminal {
  width: 100%;
  max-width: 520px;
  border-radius: 12px;
  overflow: hidden;
  background: #0d0d0d;
  border: 1px solid #222;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 20px 60px rgba(0, 0, 0, 0.6),
    0 0 40px rgba(255, 255, 255, 0.015);
  transition: transform 0.1s ease-out;
  will-change: transform;
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: #161616;
  border-bottom: 1px solid #1e1e1e;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot.red { background: #ff5f57; }
.dot.yellow { background: #febc2e; }
.dot.green { background: #28c840; }

.terminal-title {
  flex: 1;
  text-align: center;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: #555;
  margin-right: 42px;
}

.terminal-body {
  display: flex;
  padding: 16px 0;
  min-height: 280px;
}

.line-numbers {
  display: flex;
  flex-direction: column;
  padding: 0 12px 0 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.7;
  color: #333;
  user-select: none;
  text-align: right;
  min-width: 36px;
}

.code {
  flex: 1;
  margin: 0;
  padding: 0 16px 0 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.7;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: hidden;
  background: none;
}

.code .kw { color: #c586c0; }
.code .str { color: #ce9178; }
.code .fn { color: #d4d4d4; }
.code .cmt { color: #6a9955; }

.cursor {
  color: #d4d4d4;
  font-weight: 100;
  animation: none;
}
.cursor.off {
  opacity: 0;
}

@media (max-width: 768px) {
  .hero-terminal {
    max-width: 100%;
  }
  .terminal-body {
    min-height: 240px;
  }
  .code {
    font-size: 11px;
  }
  .line-numbers {
    font-size: 11px;
  }
}
</style>
