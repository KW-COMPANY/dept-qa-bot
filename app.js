const API_URL = "https://dept-qa-bot.gmo-k-watanabe.workers.dev";
const HISTORY_KEY = "ksbot_history_v1";
const MAX_CHARS = 500;
const HISTORY_LIMIT = 12; // 会話の保存件数上限

const chat = document.getElementById("chat");
const form = document.getElementById("form");
const questionEl = document.getElementById("question");
const sendBtn = document.getElementById("send");
const charCount = document.getElementById("char-count");
const clearBtn = document.getElementById("clear-btn");

let conversation = loadHistory();
let lastQuestion = "";

// ===== 起動時：保存済み会話を復元 =====
renderAll();

// ===== よく使う質問ボタン =====
document.querySelectorAll(".qq-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    questionEl.value = btn.dataset.text || "";
    updateCharCount();
    questionEl.focus();
  });
});

// ===== 会話クリア =====
clearBtn.addEventListener("click", () => {
  if (!confirm("これまでの会話をすべて削除します。よろしいですか？")) return;
  conversation = [];
  saveHistory();
  chat.innerHTML = "";
});

// ===== 文字数カウント =====
questionEl.addEventListener("input", updateCharCount);
function updateCharCount() {
  const len = questionEl.value.length;
  charCount.textContent = `${len}/${MAX_CHARS}`;
  charCount.classList.toggle("over", len >= MAX_CHARS);
}
updateCharCount();

// ===== Enterで送信、Shift+Enterで改行 =====
questionEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// ===== メッセージ描画 =====
function renderAll() {
  chat.innerHTML = "";
  conversation.forEach((msg) => renderMessage(msg, false));
  chat.scrollTop = chat.scrollHeight;
}

function renderMessage(msg, animate = true) {
  const div = document.createElement("div");
  div.className = "msg " + msg.role + (animate ? "" : " no-anim");

  const textDiv = document.createElement("div");
  textDiv.className = "msg-text";
  textDiv.textContent = msg.text;
  div.appendChild(textDiv);

  const timeSpan = document.createElement("span");
  timeSpan.className = "msg-time";
  timeSpan.textContent = formatTime(msg.time);
  div.appendChild(timeSpan);

  if (msg.role === "bot") {
    if (msg.source) {
      const srcSpan = document.createElement("span");
      srcSpan.className = "source";
      srcSpan.textContent = "参照: " + msg.source;
      div.appendChild(srcSpan);
    }

    const toolbar = document.createElement("div");
    toolbar.className = "msg-toolbar";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "コピー";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard?.writeText(msg.text).then(() => {
        copyBtn.textContent = "コピーしました";
        setTimeout(() => (copyBtn.textContent = "コピー"), 1500);
      });
    });
    toolbar.appendChild(copyBtn);

    if (!msg.isError) {
      const fbUp = document.createElement("button");
      fbUp.type = "button";
      fbUp.className = "fb-btn";
      fbUp.textContent = "👍";
      fbUp.title = "役に立った";

      const fbDown = document.createElement("button");
      fbDown.type = "button";
      fbDown.className = "fb-btn";
      fbDown.textContent = "👎";
      fbDown.title = "役に立たなかった";

      const sendFeedback = async (rating) => {
        fbUp.disabled = true;
        fbDown.disabled = true;
        try {
          await fetch(API_URL + "/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: msg.question || "",
              answer: msg.text,
              source: msg.source || "",
              category: msg.category || null,
              rating,
            }),
          });
        } catch (e) {
          console.error(e);
        }
        const note = document.createElement("span");
        note.className = "fb-thanks";
        note.textContent = "フィードバックありがとうございます";
        toolbar.appendChild(note);
      };

      fbUp.addEventListener("click", () => sendFeedback("up"));
      fbDown.addEventListener("click", () => sendFeedback("down"));
      toolbar.appendChild(fbUp);
      toolbar.appendChild(fbDown);
    } else {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "retry-btn";
      retryBtn.textContent = "再送信";
      retryBtn.addEventListener("click", () => {
        if (lastQuestion) submitQuestion(lastQuestion);
      });
      toolbar.appendChild(retryBtn);
    }

    div.appendChild(toolbar);
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function formatTime(ts) {
  const d = new Date(ts || Date.now());
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// ===== 履歴の保存・読み込み =====
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveHistory() {
  const trimmed = conversation.slice(-HISTORY_LIMIT * 2);
  conversation = trimmed;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error(e);
  }
}

// ===== 送信処理 =====
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = questionEl.value.trim();
  if (!question) return;
  questionEl.value = "";
  updateCharCount();
  submitQuestion(question);
});

async function submitQuestion(question) {
  lastQuestion = question;

  const userMsg = { role: "user", text: question, time: Date.now() };
  conversation.push(userMsg);
  saveHistory();
  renderMessage(userMsg);

  sendBtn.disabled = true;
  sendBtn.textContent = "考え中...";

  const loadingDiv = document.createElement("div");
  loadingDiv.className = "msg bot loading-bubble";
  loadingDiv.textContent = "回答を考えています…";
  chat.appendChild(loadingDiv);
  chat.scrollTop = chat.scrollHeight;

  try {
    const historyForApi = conversation
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, text: m.text }));

    const res = await fetch(API_URL + "/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: historyForApi }),
    });

    if (!res.ok) throw new Error("サーバーエラー: " + res.status);

    const data = await res.json();
    loadingDiv.remove();

    const src = data.category
      ? `${data.source}（推定カテゴリ: ${data.category}）`
      : data.source;

    const botMsg = {
      role: "bot",
      text: data.answer,
      source: src,
      category: data.category || null,
      question,
      time: Date.now(),
    };
    conversation.push(botMsg);
    saveHistory();
    renderMessage(botMsg);
  } catch (err) {
    loadingDiv.remove();
    const botMsg = {
      role: "bot",
      text: "エラーが発生しました。時間をおいて再度お試しください。",
      isError: true,
      time: Date.now(),
    };
    conversation.push(botMsg);
    saveHistory();
    renderMessage(botMsg);
    console.error(err);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "送信";
  }
}
