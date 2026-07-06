const API_URL = "https://dept-qa-bot.gmo-k-watanabe.workers.dev";
const CATEGORY_OPTIONS = ["業務", "商品サービス", "販売方法", "利益計算", "人事評価", "その他"];

let adminPass = "";
let pendingCache = [];
let knowledgeCache = [];

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

// ローディング用ヘルパー
function setLoading(el) {
  el.innerHTML = "<p class='loading'>読み込み中...</p>";
}

// ===== タブ切り替え =====
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).style.display = "block";
  });
});

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
    loadStats();
    loadPending();
    loadKnowledge();
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

// ===== 統計ダッシュボード =====
async function loadStats() {
  const grid = document.getElementById("stats-grid");
  setLoading(grid);
  try {
    const data = await adminFetch("/admin/stats", {});
    grid.innerHTML = "";
    const cards = [
      { label: "蓄積ナレッジ件数", value: data.knowledgeTotal },
      { label: "確定待ち質問", value: data.pendingTotal },
      { label: "役に立った 👍", value: data.feedbackUp },
      { label: "役に立たなかった 👎", value: data.feedbackDown },
    ];
    cards.forEach((c) => {
      const div = document.createElement("div");
      div.className = "stat-card";
      div.innerHTML = `<div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div>`;
      grid.appendChild(div);
    });

    const catDiv = document.createElement("div");
    catDiv.className = "stat-card stat-card-wide";
    const catLines = Object.entries(data.byCategory || {})
      .map(([k, v]) => `${k}: ${v}件`)
      .join(" ／ ");
    catDiv.innerHTML = `<div class="stat-label">カテゴリ別件数</div><div class="stat-sub">${catLines}</div>`;
    grid.appendChild(catDiv);
  } catch (err) {
    grid.innerHTML = `<p class='warning'>${err.message}</p>`;
  }
}

// ===== ① ナレッジ追加 =====
const knText = document.getElementById("kn-text");
const knMsg = document.getElementById("kn-msg");
document.getElementById("kn-add").addEventListener("click", async () => {
  const text = knText.value.trim();
  if (!text) return;
  knMsg.textContent = "登録中...";
  try {
    const data = await adminFetch("/admin/add-knowledge", { text });
    let msg = `登録しました（自動分類カテゴリ: ${data.category}）`;
    if (data.duplicateWarning) {
      msg += ` ／ 注意：類似度${data.duplicateScore}の既存ナレッジがあります。重複の可能性をご確認ください。`;
    }
    knMsg.textContent = msg;
    knText.value = "";
    loadKnowledge();
    loadStats();
  } catch (err) {
    knMsg.textContent = err.message;
  }
});

// ===== ② 質問ログの読み込み・確定 =====
const pendingList = document.getElementById("pending-list");
const pendingSearch = document.getElementById("pending-search");
const pendingFilter = document.getElementById("pending-filter");
document.getElementById("pending-reload").addEventListener("click", loadPending);
pendingSearch.addEventListener("input", () => renderPending());
pendingFilter.addEventListener("change", () => renderPending());

async function loadPending() {
  setLoading(pendingList);
  try {
    const data = await adminFetch("/admin/list-pending", {});
    pendingCache = data.items || [];
    renderPending();
  } catch (err) {
    pendingList.innerHTML = `<p class='warning'>${err.message}</p>`;
  }
}

function renderPending() {
  const keyword = pendingSearch.value.trim().toLowerCase();
  const cat = pendingFilter.value;
  const filtered = pendingCache.filter((item) => {
    const matchKeyword = !keyword || (item.question || "").toLowerCase().includes(keyword);
    const matchCat = !cat || item.category === cat;
    return matchKeyword && matchCat;
  });

  if (filtered.length === 0) {
    pendingList.innerHTML = "<p class='note'>該当する確定待ちの質問はありません。</p>";
    return;
  }
  pendingList.innerHTML = "";
  filtered.forEach((item) => {
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
      loadStats();
    });
    div.querySelector(".danger").addEventListener("click", async () => {
      await adminFetch("/admin/delete-pending", { id: item.id });
      loadPending();
      loadStats();
    });
    pendingList.appendChild(div);
  });
}

// ===== ③ 蓄積ナレッジ一覧 =====
const knList = document.getElementById("kn-list");
const knSearch = document.getElementById("kn-search");
const knFilter = document.getElementById("kn-filter");
document.getElementById("kn-reload").addEventListener("click", loadKnowledge);
knSearch.addEventListener("input", () => renderKnowledge());
knFilter.addEventListener("change", () => renderKnowledge());

async function loadKnowledge() {
  setLoading(knList);
  try {
    const data = await adminFetch("/admin/list-knowledge", {});
    knowledgeCache = data.items || [];
    renderKnowledge();
  } catch (err) {
    knList.innerHTML = `<p class='warning'>${err.message}</p>`;
  }
}

function renderKnowledge() {
  const keyword = knSearch.value.trim().toLowerCase();
  const cat = knFilter.value;
  const filtered = knowledgeCache.filter((item) => {
    const haystack = `${item.question || ""} ${item.answer || ""} ${item.text || ""}`.toLowerCase();
    const matchKeyword = !keyword || haystack.includes(keyword);
    const matchCat = !cat || item.category === cat;
    return matchKeyword && matchCat;
  });

  if (filtered.length === 0) {
    knList.innerHTML = "<p class='note'>該当するナレッジはありません。</p>";
    return;
  }
  knList.innerHTML = "";
  filtered.forEach((item) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const bodyText = item.answer || item.text || "";
    const categoryOptionsHtml = CATEGORY_OPTIONS.map(
      (c) => `<option value="${c}" ${c === item.category ? "selected" : ""}>${c}</option>`
    ).join("");

    div.innerHTML = `
      <div class="q">[${escapeHtml(item.category || "未分類")}] ${escapeHtml(item.question || "（記述ナレッジ）")}</div>
      <div class="a">${escapeHtml(bodyText)}</div>
      <div class="meta">登録: ${new Date(item.createdAt).toLocaleString()}</div>
      <textarea rows="4" class="edit-body">${escapeHtml(bodyText)}</textarea>
      <select class="edit-category">${categoryOptionsHtml}</select>
      <div class="btn-row">
        <button class="ok edit-save">更新</button>
        <button class="danger">削除</button>
      </div>
    `;
    const editBody = div.querySelector(".edit-body");
    const editCategory = div.querySelector(".edit-category");

    div.querySelector(".edit-save").addEventListener("click", async () => {
      const payload = { id: item.id, category: editCategory.value };
      if (item.question) {
        payload.question = item.question;
        payload.answer = editBody.value.trim();
      } else {
        payload.text = editBody.value.trim();
        payload.answer = editBody.value.trim();
      }
      await adminFetch("/admin/update-knowledge", payload);
      loadKnowledge();
      loadStats();
    });

    div.querySelector(".danger").addEventListener("click", async () => {
      await adminFetch("/admin/delete-knowledge", { id: item.id });
      loadKnowledge();
      loadStats();
    });
    knList.appendChild(div);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
