/* ============================================================
 * 编辑页 PAT 门禁（§190，2026-11-11）
 * ------------------------------------------------------------
 * 背景：§168 的编辑模式只做了「未解锁不注入侧栏编辑导航」——编辑页本身是公开的
 *   静态文件，直连 URL（回放浮层的「配置视频源」、收藏、分享链接）照样能打开整张
 *   表格。用户要求：进入编辑页必须有 PAT 校验。
 *
 * 用法：编辑页在 yj-util.js 之后、editor*.js 之前引入本脚本（同步执行）。
 *   - 已解锁（本机存有本站 PAT）→ 立即 return，零成本、零 DOM 改动。
 *   - 未解锁 → html 打 data-yj-locked（CSS 立刻隐藏 body，防表格闪一下），
 *     DOMContentLoaded 后换成「需要 PAT」卡片：粘贴 → GitHub 真实验证
 *     （YJ.util.verifyPat，与外壳 logo 三连点同一套判定）→ 通过写 gh.token → 重载本页。
 *
 * ⚠ 定位：这是**前台可见性门禁**，不是安全边界。编辑页是公开静态文件，改 JS 即可绕；
 *   真正把守写权限的仍是 GitHub PAT（无 PAT 提交必失败，§104 原子 commit）。
 *   收益 = 公网访客看不到编辑界面、不会误入，且与侧栏编辑入口的语义一致。
 * ============================================================ */
(function () {
  "use strict";
  var U = window.YJ && YJ.util;
  if (!U || typeof U.editUnlocked !== "function" || typeof U.verifyPat !== "function") return;  /* 依赖缺失：不锁死页面 */
  if (U.editUnlocked()) return;                                                               /* 已解锁：放行 */

  /* ① 先锁可见性：body 仍在解析中，用 html 级属性 + 内联样式（不依赖 Tailwind 是否已编译到） */
  try { document.documentElement.setAttribute("data-yj-locked", "1"); } catch (e) {}
  var st = document.createElement("style");
  st.textContent = "html[data-yj-locked] body{visibility:hidden!important}" +
    "html[data-yj-locked] body #yj-gate{visibility:visible!important}" +
    "html[data-yj-locked] body{overflow:hidden!important}";
  (document.head || document.documentElement).appendChild(st);

  /* ② DOM 就绪后把 body 换成门禁卡片（编辑 UI 与数据面板不再呈现给访客） */
  document.addEventListener("DOMContentLoaded", function () {
    var box = document.createElement("div");
    box.id = "yj-gate";
    box.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4";
    box.innerHTML =
      '<div class="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">' +
        '<div class="mb-1 text-[15px] font-semibold">编辑页 · 需要 PAT</div>' +
        '<p class="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">' +
          "本页是本站的编辑后台，需先验证本站仓库的 fine-grained PAT（仅 " +
          '<span class="font-medium text-foreground">' + U.esc(U.GH_REPO) + "</span>" +
          " · Contents 读写）。令牌只保存在本机浏览器，不会发往 GitHub 以外的任何地方。" +
        "</p>" +
        '<input id="yjgToken" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"' +
          ' class="mb-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none transition focus:border-ring">' +
        '<div id="yjgMsg" class="mb-3 hidden text-[12px] leading-relaxed"></div>' +
        '<div class="flex items-center justify-end gap-2">' +
          '<a href="../index.html" class="mr-auto rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">返回站点</a>' +
          '<button id="yjgGo" type="button" class="rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">验证并进入</button>' +
        "</div>" +
      "</div>";
    var body = document.body;
    while (body.firstChild) body.removeChild(body.firstChild);
    body.appendChild(box);

    var input = box.querySelector("#yjgToken"),
        msg = box.querySelector("#yjgMsg"),
        go = box.querySelector("#yjgGo");
    function say(text, bad) {
      msg.textContent = text;
      msg.className = "mb-3 text-[12px] leading-relaxed " + (bad ? "text-destructive" : "text-muted-foreground");
    }
    function submit() {
      var t = (input.value || "").trim();
      if (!t) { say("请先粘贴 PAT。", true); return; }
      go.disabled = true; say("正在向 GitHub 验证…");
      U.verifyPat(t).then(function (r) {
        if (r.ok) {
          try { localStorage.setItem(U.storeKey("gh.token"), r.token || t); } catch (e) {}
          say("验证通过，正在进入编辑页…");
          location.reload();
          return;
        }
        say(r.msg || "验证失败，请重试。", true);
      }).then(function () { go.disabled = false; });
    }
    go.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    setTimeout(function () { input.focus(); }, 0);
  });
})();
