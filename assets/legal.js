/* 法律条款页脚本：动态加载 Markdown 内容，提供语言与文档切换。
   无第三方依赖；内容与页面分离，全部通过 fetch 读取 content/ 下的文件。 */
(function () {
  'use strict';

  // 文档标识 -> 文件名前缀
  var DOCS = { privacy: 'privacy-policy', agreement: 'user-agreement' };
  var LANGS = ['zh', 'en'];

  // 界面文案（与正文内容分离）
  var UI = {
    zh: {
      brand: 'BabySleep',
      privacy: '隐私政策',
      agreement: '用户协议',
      switchTo: 'EN',
      loading: '正在加载…',
      error: '内容加载失败。请确认页面通过网络访问（例如 GitHub Pages），然后刷新重试。',
      updated: '最后更新：2026-09-11'
    },
    en: {
      brand: 'BabySleep',
      privacy: 'Privacy Policy',
      agreement: 'User Agreement',
      switchTo: '中文',
      loading: 'Loading…',
      error: 'Failed to load the content. Please make sure this page is served over the web (for example via GitHub Pages), then refresh and try again.',
      updated: 'Last updated: September 11, 2026'
    }
  };

  var docEl = document.getElementById('doc');
  var statusEl = document.getElementById('status');
  var tabsEl = document.getElementById('tabs');
  var langBtn = document.getElementById('langToggle');
  var brandEl = document.getElementById('brand');
  var footEl = document.getElementById('footNote');

  var state = {
    doc: readParam('doc', Object.keys(DOCS), 'privacy'),
    lang: readParam('lang', LANGS, detectLang())
  };

  function readParam(name, allowed, fallback) {
    var value = null;
    try {
      value = new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      value = null;
    }
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function detectLang() {
    return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  }

  function syncUrl() {
    try {
      var url = window.location.pathname + '?doc=' + state.doc + '&lang=' + state.lang;
      window.history.replaceState(null, '', url);
    } catch (e) {
      /* 忽略：某些环境不支持 replaceState */
    }
  }

  function renderChrome() {
    var t = UI[state.lang];
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t[state.doc] + ' · ' + t.brand;

    brandEl.textContent = t.brand;
    langBtn.textContent = t.switchTo;
    footEl.textContent = t.updated;

    tabsEl.querySelectorAll('.tab').forEach(function (tab) {
      var key = tab.getAttribute('data-doc');
      tab.textContent = t[key];
      tab.classList.toggle('is-active', key === state.doc);
    });
  }

  function load() {
    var t = UI[state.lang];
    statusEl.className = 'status';
    statusEl.textContent = t.loading;
    docEl.innerHTML = '';
    renderChrome();
    syncUrl();

    var file = 'content/' + DOCS[state.doc] + '.' + state.lang + '.md';
    fetch(file)
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.text();
      })
      .then(function (text) {
        docEl.innerHTML = mdToHtml(text);
        statusEl.textContent = '';
      })
      .catch(function () {
        statusEl.className = 'status is-error';
        statusEl.textContent = UI[state.lang].error;
      });
  }

  // ---- 交互 ----

  tabsEl.addEventListener('click', function (event) {
    var tab = event.target.closest('.tab');
    if (!tab) {
      return;
    }
    var key = tab.getAttribute('data-doc');
    if (key !== state.doc) {
      state.doc = key;
      load();
    }
  });

  langBtn.addEventListener('click', function () {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    load();
  });

  // ---- 极简 Markdown 渲染 ----
  // 仅支持本项目文档用到的语法：标题、段落、有序/无序列表（含一级嵌套）、
  // 引用、表格、水平线、**加粗**、`行内代码`、[链接](url)。

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inline(text) {
    var html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, function (_, code) {
      return '<code>' + code + '</code>';
    });
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return html;
  }

  function isTableRow(line) {
    return /^\s*\|.*\|\s*$/.test(line);
  }

  function isListRow(line) {
    return /^\s*([-*+]|\d+\.)\s+/.test(line);
  }

  function isBlockStart(line) {
    return (
      /^#{1,6}\s+/.test(line) ||
      /^\s*---+\s*$/.test(line) ||
      /^\s*>\s?/.test(line) ||
      isTableRow(line) ||
      isListRow(line)
    );
  }

  function renderTable(rows) {
    function splitCells(row) {
      return row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(function (cell) {
          return cell.trim();
        });
    }

    var head = splitCells(rows[0]);
    var bodyStart = 1;
    if (rows[1] && /^\s*\|[\s:|-]+\|\s*$/.test(rows[1])) {
      bodyStart = 2;
    }

    var html = '<table><thead><tr>';
    head.forEach(function (cell) {
      html += '<th>' + inline(cell) + '</th>';
    });
    html += '</tr></thead><tbody>';
    for (var i = bodyStart; i < rows.length; i++) {
      html += '<tr>';
      splitCells(rows[i]).forEach(function (cell) {
        html += '<td>' + inline(cell) + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function mdToHtml(source) {
    var lines = source.replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var stack = []; // 列表栈：{ type, indent }
    var openLi = false;
    var i = 0;

    function closeLi() {
      if (openLi) {
        out.push('</li>');
        openLi = false;
      }
    }

    function popList() {
      closeLi();
      var top = stack.pop();
      out.push('</' + top.type + '>');
      if (stack.length) {
        // 该列表嵌在上一级 li 内，需一并关闭该 li
        out.push('</li>');
        openLi = false;
      }
    }

    function closeAllLists() {
      while (stack.length) {
        popList();
      }
    }

    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) {
        closeAllLists();
        i++;
        continue;
      }

      if (/^\s*---+\s*$/.test(line)) {
        closeAllLists();
        out.push('<hr>');
        i++;
        continue;
      }

      var heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        closeAllLists();
        var level = heading[1].length;
        out.push('<h' + level + '>' + inline(heading[2].trim()) + '</h' + level + '>');
        i++;
        continue;
      }

      if (isTableRow(line)) {
        closeAllLists();
        var rows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(lines[i]);
          i++;
        }
        out.push(renderTable(rows));
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        closeAllLists();
        var quoted = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push(
          '<blockquote>' +
            quoted
              .map(function (text) {
                return '<p>' + inline(text) + '</p>';
              })
              .join('') +
            '</blockquote>'
        );
        continue;
      }

      var item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (item) {
        var indent = item[1].length;
        var type = /\d/.test(item[2]) ? 'ol' : 'ul';

        if (!stack.length) {
          out.push('<' + type + '>');
          stack.push({ type: type, indent: indent });
        } else {
          while (stack.length && indent < stack[stack.length - 1].indent) {
            popList();
          }
          if (!stack.length) {
            out.push('<' + type + '>');
            stack.push({ type: type, indent: indent });
          } else {
            var top = stack[stack.length - 1];
            if (indent > top.indent) {
              out.push('<' + type + '>');
              stack.push({ type: type, indent: indent });
            } else if (type !== top.type) {
              popList();
              out.push('<' + type + '>');
              stack.push({ type: type, indent: indent });
            } else {
              closeLi();
            }
          }
        }

        out.push('<li>' + inline(item[3]));
        openLi = true;
        i++;
        continue;
      }

      closeAllLists();
      var paragraph = [line.trim()];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
        paragraph.push(lines[i].trim());
        i++;
      }
      out.push('<p>' + inline(paragraph.join(' ')) + '</p>');
    }

    closeAllLists();
    return out.join('\n');
  }

  load();
})();
