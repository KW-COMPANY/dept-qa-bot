const API_URL = "https://dept-qa-bot.gmo-k-watanabe.workers.dev";

let adminPass = "";

const loginSection = document.getElementById("login-section");
const panel = document.getElementById("panel");
const loginBtn = document.getElementById("login-btn");
const loginMsg = document.getElementById("login-msg");
const passInput = document.getElementById("admin-pass");

// 共通：管理者APIを叩く（パスワードをヘッダーに付与）
async function adminFetch(path, body) {
  const res = await fetch(API_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Pass": adminPass,
    },
    body: JSON.stringify(body || {}),
  });
  if (res.status === 401) {
    throw new Error("認証エラー：パスワードが違います");
  }
  if (!res.ok) {
    throw new Error("サーバーエラー: " + res.status);
  }
  return res.json();
}

// ===== ログイン =====
loginBtn.addEventListener("click", async () => {
  adminPass = passInput.value.trim();
  if (!adminPass) {
    loginMsg.textContent = "パスワードを入力してください";
    return;
  }
  try {
    await adminFetch("/admin/verify", {});
    loginSection.style.display = "none";
    panel.style.display = "block";
    loadPending();
    loadKnowledge();
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

// ===== ① ナレッジ追加 =====
const knText = document.getElementById("kn-text");
const knMsg = document.getElementById("kn-msg");
document.getElementById("kn-add").addEventListener("click", async () => {
  const text = knText.value.trim();
  if (!text) return;
  knMsg.textContent = "登録中...";
  try {
    const data = await adminFetch("/admin/add-knowledge", { text });
    knMsg.textContent = `登録しました（自動分類カテゴリ: ${data.category}）`;
    knText.value = "";
    loadKnowledge();
  } catch (err) {
    knMsg.textContent = err.message;
  }
});

// ===== ② 質問ログの読み込み・確定 =====
const pendingList = document.getElementById("pending-list");
document.getElementById("pending-reload").addEventListener("click", loadPending);

async function loadPending() {
  pendingList.innerHTML = "読み込み中...";
  try {
    const data = await adminFetch("/admin/list-pending", {});
    if (!data.items || data.items.length === 0) {
      pendingList.innerHTML = "<p class='note'>確定待ちの質問はありません。</p>";
      return;
    }
    pendingList.innerHTML = "";
    data.items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        <div class="q">Q: ${escapeHtml(item.question)}</div>
        <div class="meta">推定カテゴリ: ${escapeHtml(item.category || "未分類")} ／ AI暫定回答:</div>
        <div class="a">${escapeHtml(item.answer || "")}</div>
        <textarea rows="4">${escapeHtml(item.answer || "")}</textarea>
        <button class="ok">この内容でナレッジ確定</button>
        <button class="danger">削除</button>
      `;
      const textarea = div.querySelector("textarea");
      div.querySelector(".ok").addEventListener("click", async () => {
        await adminFetch("/admin/confirm", {
          id: item.id,
          question: item.question,
          answer: textarea.value.trim(),
        });
        loadPending();
        loadKnowledge();
      });
      div.querySelector(".danger").addEventListener("click", async () => {
        await adminFetch("/admin/delete-pending", { id: item.id });
        loadPending();
      });
      pendingList.appendChild(div);
    });
  } catch (err) {
    pendingList.innerHTML = `<p class='warning'>${err.message}</p>`;
  }
}

// ===== ③ 蓄積ナレッジ一覧 =====
const knList = document.getElementById("kn-list");
document.getElementById("kn-reload").addEventListener("click", loadKnowledge);

async function loadKnowledge() {
  knList.innerHTML = "読み込み中...";
  try {
    const data = await adminFetch("/admin/list-knowledge", {});
    if (!data.items || data.items.length === 0) {
      knList.innerHTML = "<p class='note'>ナレッジはまだありません。</p>";
      return;
    }
    knList.innerHTML = "";
    data.items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        <div class="q">[${escapeHtml(item.category || "未分類")}] ${escapeHtml(item.question || "（記述ナレッジ）")}</div>
        <div class="a">${escapeHtml(item.answer || item.text || "")}</div>
        <div class="meta">登録: ${new Date(item.createdAt).toLocaleString()}</div>
        <button class="danger">削除</button>
      `;
      div.querySelector(".danger").addEventListener("click", async () => {
        await adminFetch("/admin/delete-knowledge", { id: item.id });
        loadKnowledge();
      });
      knList.appendChild(div);
    });
  } catch (err) {
    knList.innerHTML = `<p class='warning'>${err.message}</p>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
