/* =========================================================
   排版小动物 × 创作者合作计划
   内容灵感：从 ./assets/inspirations.json 动态渲染
   无外部依赖 · 语义化 · 可访问
   ========================================================= */
(function () {
  "use strict";

  var DATA_URL = "./assets/inspirations.json";
  var KNOWN_GROUPS = ["硬广口播", "手帐演示", "学习演示", "其他场景"];

  var grid = document.getElementById("idea-grid");
  var statusEl = document.getElementById("tab-status");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));

  var ideas = [];        // 已加载的灵感数据
  var loaded = false;    // 是否加载成功
  var activeGroup = "硬广口播";

  /* ---------- 工具 ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function isEmpty(v) {
    return v === undefined || v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);
  }

  function safeUrl(u) {
    var s = String(u || "").trim();
    return /^(https?:)?\/\//i.test(s) ? s : null;
  }

  /* ---------- 渲染单张灵感卡 ---------- */

  function buildCard(item, index) {
    var card = el("article", "idea-card");
    card.id = "idea-" + (item.id != null ? String(item.id) : index);

    /* 头部：icon + 标题 + 分组标签 */
    var head = el("div", "idea-card-head");
    var emoji = el("span", "idea-emoji", isEmpty(item.icon) ? "🐾" : item.icon);
    emoji.setAttribute("aria-hidden", "true");
    head.appendChild(emoji);
    head.appendChild(el("h3", "idea-title", isEmpty(item.title) ? "（未命名选题）" : item.title));
    head.appendChild(el("span", "idea-group-tag", isEmpty(item.group) ? "灵感" : item.group));
    var mascotByGroup = {"硬广口播":"tsuki", "手帐演示":"ralph", "学习演示":"kaka", "其他场景":"liangliang"};
    var mascot = el("img", "idea-mascot");
    mascot.src = "./assets/ip-" + (mascotByGroup[item.group] || "tsuki") + ".webp";
    mascot.alt = "";
    mascot.setAttribute("aria-hidden", "true");
    mascot.loading = "lazy";
    head.appendChild(mascot);
    card.appendChild(head);
    if (!isEmpty(item.angle)) card.appendChild(el("p", "idea-angle", "口播切入：" + item.angle));

    if (!isEmpty(item.hook)) {
      var hook = el("div", "idea-hook");
      hook.appendChild(el("span", "idea-hook-label", "开场示例"));
      hook.appendChild(el("blockquote", null, item.hook));
      card.appendChild(hook);
    }
    if (Array.isArray(item.keywords) && item.keywords.length) {
      var keywords = el("div", "idea-keywords");
      keywords.setAttribute("aria-label", "选题关键词");
      keywords.appendChild(el("span", "idea-keywords-label", "选题词"));
      item.keywords.forEach(function (keyword) { keywords.appendChild(el("span", "idea-keyword", keyword)); });
      card.appendChild(keywords);
    }

    /* 字段一：人群 / 场景 */
    card.appendChild(buildField("人群 / 场景",
      isEmpty(item.audience) ? "待补充" : item.audience));

    /* 字段二：小动物解决的问题 */
    card.appendChild(buildField("小动物解决的问题",
      isEmpty(item.problem) ? "待补充" : item.problem));

    /* 案例以核心策略表「人群／场景」的整行为单位，保持原顺序。 */
    card.appendChild(buildCases(item.cases, item.sourceCategory + " · 参考案例"));

    /* 各类重点口播方向独立展开，并保留对应案例。 */
    var topics = Array.isArray(item.topics) ? item.topics : [];
    var featuredTopics = topics.filter(function (topic) { return topic.featured; });
    var otherTopics = topics.filter(function (topic) { return !topic.featured; });
    if (featuredTopics.length) {
      var featured = el("section", "featured-topics");
      featured.setAttribute("aria-label", item.sourceCategory + "的重点口播方向");
      featured.appendChild(el("h4", "featured-heading", "重点口播方向"));
      if (item.featuredIntro) featured.appendChild(el("p", "featured-intro", item.featuredIntro));
      featuredTopics.forEach(function (topic) {
        var details = el("details", "featured-topic");
        details.id = "topic-" + topic.id;
        var summary = el("summary");
        summary.appendChild(el("span", "featured-title", topic.focusTitle));
        summary.appendChild(el("span", "featured-count", topic.cases.length + " 条参考案例"));
        details.appendChild(summary);
        var body = el("div", "featured-body");
        body.appendChild(buildField("口播开场", topic.hook));
        body.appendChild(buildField("产品承接", topic.productFocus));
        body.appendChild(buildCases(topic.cases, topic.focusTitle + " · 选题参考"));
        body.appendChild(buildScript(topic, "查看口播提纲", true));
        details.appendChild(body);
        featured.appendChild(details);
      });
      card.appendChild(featured);
    }
    if (otherTopics.length) {
      var topicGroup = el("details", "idea-script idea-topics");
      topicGroup.appendChild(el("summary", null, (featuredTopics.length ? "其他选题与拍摄提纲 · " : "查看选题与拍摄提纲 · ") + otherTopics.length + " 个方向"));
      var topicBody = el("div", "idea-script-body");
      otherTopics.forEach(function (topic) {
        topicBody.appendChild(buildScript(topic, topic.title));
      });
      topicGroup.appendChild(topicBody);
      card.appendChild(topicGroup);
    } else if (!featuredTopics.length) {
      card.appendChild(buildScript(item, "查看拍摄提纲"));
    }

    /* 可选备注 */
    if (!isEmpty(item.note)) {
      card.appendChild(el("p", "idea-note", "📌 " + item.note));
    }

    /* 复制提纲 */
    var actions = el("div", "idea-actions");
    var copyBtn = el("button", "copy-btn", "复制提纲");
    copyBtn.type = "button";
    copyBtn.setAttribute("aria-label", "复制《" + (item.title || "选题") + "》提纲");
    copyBtn.dataset.ideaIndex = String(index);
    copyBtn.addEventListener("click", function () {
      copyText(buildOutline(item), copyBtn);
    });
    actions.appendChild(copyBtn);
    card.appendChild(actions);

    return card;
  }

  function buildCases(caseList, label) {
    var caseField = el("div", "idea-field");
    caseField.appendChild(el("p", "idea-label", label));
    var cases = Array.isArray(caseList) ? caseList.filter(function (c) {
      return c && !isEmpty(c.title) && !isEmpty(c.url);
    }) : [];
    if (cases.length) {
    var hint = "参考视频 " + cases.length + " 条 · 横向滑动浏览";
      caseField.appendChild(el("p", "case-scroll-hint", hint));
      var wrap = el("div", "idea-cases");
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", label + "，可横向滑动浏览");
      cases.forEach(function (c, caseIndex) {
        var href = safeUrl(c.url);
        var tile = href ? el("a", "idea-case-card") : el("div", "idea-case-card");
        if (href) {
          tile.href = href;
          tile.target = "_blank";
          tile.rel = "noopener noreferrer";
          tile.setAttribute("aria-label", "参考视频第 " + (caseIndex + 1) + " 条：" + (c.category || "安利视频") + "《" + (c.title || "查看笔记") + "》");
        }
        if (!isEmpty(c.cover)) {
          var imageWrap = el("div", "idea-case-cover-wrap");
          var cover = el("img", "idea-case-cover");
          cover.src = c.cover;
          cover.alt = "视频封面：" + (c.title || "推荐案例");
          cover.loading = "lazy";
          imageWrap.appendChild(cover);
          imageWrap.appendChild(el("span", "idea-case-badge", "参考 " + (caseIndex + 1)));
          tile.appendChild(imageWrap);
        }
        var caption = el("span", "idea-case-caption");
        caption.appendChild(el("span", "idea-case-title", c.title || "查看参考视频"));
        if (!isEmpty(c.takeaway)) caption.appendChild(el("span", "idea-case-takeaway", c.takeaway));
        var meta = el("span", "idea-case-meta");
        meta.appendChild(el("span", "idea-case-category", c.category || "视频"));
        meta.appendChild(el("span", "idea-case-score", "参考 " + (caseIndex + 1)));
        caption.appendChild(meta);
        tile.appendChild(caption);
        wrap.appendChild(tile);
      });
      caseField.appendChild(wrap);
      cases.forEach(function (c) {
        if (!isEmpty(c.caseNote)) caseField.appendChild(el("p", "idea-case-warning", "⚠ " + c.caseNote));
      });
    } else {
      caseField.appendChild(el("p", "idea-case-none", "该场景暂无可验证的安利视频案例"));
    }
    return caseField;
  }

  function buildField(labelText, valueText) {
    var f = el("div", "idea-field");
    f.appendChild(el("p", "idea-label", labelText));
    f.appendChild(el("p", "idea-value", valueText));
    return f;
  }

  function buildScript(item, title, omitIntro) {
    var details = el("details", "idea-script");
    details.appendChild(el("summary", null, title));
    var body = el("div", "idea-script-body");
    if (!omitIntro && !isEmpty(item.hook)) body.appendChild(buildField("开场示例", item.hook));
    if (!omitIntro && Array.isArray(item.keywords) && item.keywords.length) body.appendChild(buildField("选题关键词", item.keywords.join(" / ")));
    if (Array.isArray(item.structure) && item.structure.length) {
      var ol = el("ol", "idea-steps");
      item.structure.forEach(function (step) { ol.appendChild(el("li", null, step)); });
      body.appendChild(ol);
    }
    if (!isEmpty(item.visual)) body.appendChild(buildField("画面建议", item.visual));
    details.appendChild(body);
    return details;
  }

  /* ---------- 提纲文本 ---------- */

  function buildOutline(item) {
    var lines = [];
    lines.push("【" + (item.title || "未命名选题") + "】" + (item.group ? " · " + item.group : ""));
    if (!isEmpty(item.angle)) lines.push("口播切入：" + item.angle);
    lines.push("合作要求：视频硬广；前 25 秒内露出产品；70% 产品介绍、30% 真实场景。");
    lines.push("案例分类：核心策略表 · 人群／场景 · " + item.sourceCategory);
    if (!isEmpty(item.hook)) lines.push("开场示例：" + item.hook);
    if (Array.isArray(item.keywords) && item.keywords.length) lines.push("选题关键词：" + item.keywords.join(" / "));
    lines.push("人群 / 场景：" + (isEmpty(item.audience) ? "待补充" : item.audience));
    lines.push("小动物解决的问题：" + (isEmpty(item.problem) ? "待补充" : item.problem));

    if (Array.isArray(item.structure) && item.structure.length) {
      lines.push("内容结构：");
      item.structure.forEach(function (s, i) {
        lines.push("  " + (i + 1) + ". " + s);
      });
    } else {
      lines.push("内容结构：待补充");
    }
    if (!isEmpty(item.visual)) lines.push("画面建议：" + item.visual);

    if (Array.isArray(item.topics) && item.topics.length) {
      lines.push("可选选题方向：");
      item.topics.forEach(function (topic) {
        lines.push("【" + topic.title + "】");
        if (!isEmpty(topic.productFocus)) lines.push("产品承接：" + topic.productFocus);
        if (!isEmpty(topic.hook)) lines.push("开场示例：" + topic.hook);
        if (Array.isArray(topic.keywords) && topic.keywords.length) lines.push("选题关键词：" + topic.keywords.join(" / "));
        if (Array.isArray(topic.structure)) topic.structure.forEach(function (step, i) { lines.push("  " + (i + 1) + ". " + step); });
        if (!isEmpty(topic.visual)) lines.push("画面建议：" + topic.visual);
        if (Array.isArray(topic.cases) && topic.cases.length) {
          lines.push("该方向的选题参考" + (topic.sourceSection ? "（" + topic.sourceSection + "）" : "") + "：");
          topic.cases.forEach(function (c) { lines.push("  - " + c.title + "（" + c.url + "）"); });
        }
      });
    }

    var cases = Array.isArray(item.cases) ? item.cases.filter(function (c) {
      return c && !isEmpty(c.title) && !isEmpty(c.url);
    }) : [];
    if (cases.length) {
      lines.push("参考案例：");
      cases.forEach(function (c) {
        lines.push("  - 参考 " + (cases.indexOf(c) + 1) + "｜" + (c.category || "视频") + "｜" + (c.title || "") + "（" + c.url + "）");
        if (!isEmpty(c.takeaway)) lines.push("    借鉴点：" + c.takeaway);
        if (!isEmpty(c.caseNote)) lines.push("    备注：" + c.caseNote);
      });
    } else {
      lines.push("参考案例：原文未提供该方向独立案例");
    }

    if (!isEmpty(item.note)) lines.push("备注：" + item.note);
    return lines.join("\n");
  }

  /* ---------- 剪贴板（无依赖，含降级） ---------- */

  function copyText(text, btn) {
    function done(ok) {
      if (!btn) return;
      var original = "复制提纲";
      btn.textContent = ok ? "已复制 ✓" : "复制失败，请手动选择";
      btn.classList.add("is-copied");
      window.setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove("is-copied");
      }, 1800);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(legacyCopy(text)); }
      );
    } else {
      done(legacyCopy(text));
    }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 渲染与筛选 ---------- */

  function render() {
    grid.textContent = ""; // 清空

    var list = activeGroup === "全部"
      ? ideas
      : ideas.filter(function (it) { return it && it.group === activeGroup; });

    if (!list.length) {
      var msg = loaded
        ? "该分组暂无灵感内容，看看其他分组吧。"
        : "灵感内容整理中，稍后刷新即可查看。";
      grid.appendChild(el("p", "idea-empty", msg));
      if (statusEl) statusEl.textContent = loaded ? "共 0 条灵感" : "";
      return;
    }

    var frag = document.createDocumentFragment();
    list.forEach(function (item) {
      frag.appendChild(buildCard(item, ideas.indexOf(item)));
    });
    grid.appendChild(frag);

    if (statusEl) {
      var caseCount = list.reduce(function (count, item) {
        return count + item.cases.length + (item.topics || []).reduce(function (total, topic) {
          return total + (topic.cases || []).length;
        }, 0);
      }, 0);
      statusEl.textContent = (activeGroup === "全部" ? "全部分组" : activeGroup) +
        " · " + list.length + " 类 · " + caseCount + " 条参考案例";
    }
  }

  function bindTabs() {
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        activeGroup = tab.dataset.group || "全部";
        render();
      });
    });

    /* 左右方向键切换 tab */
    var bar = document.querySelector(".tabs");
    if (bar) {
      bar.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        var idx = tabs.findIndex(function (t) {
          return t.classList.contains("is-active");
        });
        if (idx < 0) idx = 0;
        var next = e.key === "ArrowRight"
          ? (idx + 1) % tabs.length
          : (idx - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
        tabs[next].click();
        e.preventDefault();
      });
    }
  }

  /* ---------- 数据加载 ---------- */

  function loadData() {
    // 案例随 HTML 一起加载，避免额外数据请求失败时整块内容为空。
    var embedded = document.getElementById("inspirations-data");
    if (embedded) {
      try {
        var initialData = JSON.parse(embedded.textContent);
        if (!Array.isArray(initialData)) throw new Error("格式应为 JSON 数组");
        ideas = initialData;
        loaded = true;
        render();
        return;
      } catch (e) {
        // 内嵌数据不可用时，仍可尝试独立数据文件。
      }
    }
    fetch(DATA_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("格式应为 JSON 数组");
        ideas = data;
        loaded = true;
        render();
      })
      .catch(function () {
        /* 明确区分加载失败与内容尚未准备好。 */
        ideas = [];
        loaded = false;
        render();
        grid.textContent = "";
        grid.appendChild(el("p", "idea-empty", "案例加载失败，请刷新页面重试。"));
      });
  }

  /* ---------- IP 角色翻面卡（背面内容取自官方角色介绍截图） ---------- */

  var IP_ROSTER = [
    {key:'tsuki', name:'tsuki', line:'独居京都的', bubble:'#ccd8d5', role:'独居京都的 tsuki', skill:'擅长日系风格的小猫', desc:'爱独处，也喜欢安静\n空闲时喜欢坐在鸭川边\n看着流水梳理思绪\n偶尔会在深夜\n想一想宇宙的意义'},
    {key:'liangliang', name:'亮亮', line:'活在童年的', bubble:'#f7d2dd', role:'活在童年的小象亮亮', skill:'活在千禧年的世界', desc:'亮亮的房间像时光机\n摆满了小时候的回忆\n喜欢把珍藏的糖纸折成小花\n可以的话\n愿意一辈子活在童年的世界'},
    {key:'kaka', name:'卡卡 kaka', line:'爱开小差的小学生', bubble:'#cfe7fb', role:'爱开小差的小学生 kaka', skill:'擅长在本子上乱涂乱画', desc:'「鱼为什么要生活在水里呢」\n爱在课上思考些无关紧要的问题\n美术老师教 kaka 用画笔记录\n于是作业本上满是奇思妙想'},
    {key:'miles', name:'迈尔斯', line:'热爱长跑的杂志社主编', bubble:'#eef0a6', role:'爱长跑的杂志社主编', skill:'持续更新的杂志风格', desc:'热爱长跑\n喜欢所有长期的事物\n比起速度\n更在乎马拉松式的重复和坚持'},
    {key:'ralph', name:'拉尔夫', line:'建筑系在读小狗', bubble:'#d9d9d9', role:'建筑系在读小狗 拉尔夫', skill:'擅长严谨的北欧风格', desc:'理性冷静，崇尚简洁\n生活里最介意的事，是电视机没有和墙面平行对齐\n拉尔夫的生活像设计风格一样\n极简且充满秩序'},
    {key:'laoshi', name:'老师傅', line:'编辑部里的', bubble:'#c9b491', role:'编辑部里的老师傅', skill:'擅长古老的风格', desc:'在编辑部干了一辈子的老学究\n喜欢一切足够老的东西\n年代久远的文集\n翻了一遍又一遍'},
    {key:'zhuren', name:'主任', line:'重大时刻才出现的', bubble:'#c9e6e2', role:'重大时刻才出现的教导主任', skill:'重要的事交给主任', desc:'说话简短\n走路时喜欢双手背在身后\n虽然只在重要时刻出现\n但内心似乎不像外表一样严厉'},
    {key:'luyi', name:'路易', line:'环球旅行家', bubble:'#fbeea6', role:'环球旅行家 路易', skill:'收集了各地的明信片', desc:'总是在路上的小信鸽「路易」\n每到新的地方都会收藏当地的明信片\n热衷于分享新鲜见闻\n世界对路易来说\n是个蕴含无限可能的快乐星球'}
  ];

  function buildIpGrid() {
    var ipGrid = document.getElementById("ip-grid");
    if (!ipGrid) return;
    IP_ROSTER.forEach(function (ip) {
      var cardEl = el("div", "ip-card");
      cardEl.style.setProperty("--bubble", ip.bubble);

      var btn = el("button", "ip-flip");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "点击翻面，查看 " + ip.name + " 的 IP 性格与适用场景");

      var inner = el("span", "ip-inner");

      var front = el("span", "ip-face ip-front");
      var img = el("img");
      img.src = "./assets/ip-" + ip.key + ".webp";
      img.alt = ip.name + " 角色形象";
      img.loading = "lazy";
      front.appendChild(img);
      front.appendChild(el("b", "ip-name", ip.name));
      front.appendChild(el("small", "ip-line", ip.line));
      front.appendChild(el("span", "ip-tap", "点击查看 ›"));
      inner.appendChild(front);

      var back = el("span", "ip-face ip-back");
      back.appendChild(el("span", "ip-bubble", ip.role));
      back.appendChild(el("span", "ip-skill", ip.skill));
      var desc = el("span", "ip-desc");
      ip.desc.split("\n").forEach(function (t, ti) {
        if (ti > 0) desc.appendChild(el("br"));
        desc.appendChild(document.createTextNode(t));
      });
      back.appendChild(desc);
      back.appendChild(el("span", "ip-turn", "再点一下翻回"));
      inner.appendChild(back);

      btn.appendChild(inner);
      cardEl.appendChild(btn);
      btn.addEventListener("click", function () {
        var on = cardEl.classList.toggle("is-flipped");
        btn.setAttribute("aria-expanded", on ? "true" : "false");
      });
      ipGrid.appendChild(cardEl);
    });
  }

  /* ---------- 启动 ---------- */

  if (grid) {
    bindTabs();
    render();      // 先展示占位
    loadData();   // 再尝试加载灵感数据
  }
  buildIpGrid();

  /* 未知分组提示（仅控制台，便于维护者发现数据问题） */
  if (typeof console !== "undefined" && console.log) {
    // 数据加载后如有分组不在 tab 列表中，会在 render 的「全部」里正常展示；
    // 这里仅记录一次检查回调。
  }
  window.addEventListener("load", function () {
    if (!loaded) return;
    var unknown = ideas
      .map(function (i) { return i && i.group; })
      .filter(function (g) { return g && KNOWN_GROUPS.indexOf(g) < 0; });
    if (unknown.length) {
      console.log("[inspirations] 存在未在 tab 中定义的分组（仍会在「全部」中展示）：",
        Array.from(new Set(unknown)));
    }
  });
})();
