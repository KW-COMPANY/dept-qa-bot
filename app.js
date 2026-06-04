const API_URL = "https://dept-qa-bot.gmo-k-watanabe.workers.dev";

const chat = document.getElementById("chat");
const form = document.getElementById("form");
const questionEl = document.getElementById("question");
const sendBtn = document.getElementById("send");

function addMessage(text, role, source) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  if (source) {
    const span = document.createElement("span");
    span.className = "source";
    span.textContent = "参照: " + source;
    div.appendChild(span);
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = questionEl.value.trim();
  if (!question) return;

  addMessage(question, "user");
  questionEl.value = "";
  sendBtn.disabled = true;
  sendBtn.textContent = "考え中...";

  try {
    const res = await fetch(API_URL + "/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!res.ok) throw new Error("サーバーエラー: " + res.status);

    const data = await res.json();
    const src = data.category
      ? `${data.source}（推定カテゴリ: ${data.category}）`
      : data.source;
    addMessage(data.answer, "bot", src);
  } catch (err) {
    addMessage("エラーが発生しました。時間をおいて再度お試しください。", "bot");
    console.error(err);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "送信";
  }
});
