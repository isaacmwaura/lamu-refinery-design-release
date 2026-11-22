/* The process flow sheet viewer. Each sheet's drawing and its cards come from data/<sheet>.js,
   loaded by a script tag so the page also works opened from disk. The cards were read from the sheet's DEXPI 2.0.1
   file when the site was built. Independent; not affiliated with Dangote Group; illustrative, not a design for
   construction. */
(function () {
  'use strict';
  var INDEX = window.LAMU_PFD_INDEX || [];
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var byId = Object.create(null);
  INDEX.forEach(function (s, k) { byId[s.id] = k; });
  var stage = document.getElementById('stage'), card = document.getElementById('card'), msg = document.getElementById('msg');
  var tabsEl = document.getElementById('tabs'), areasEl = document.getElementById('areas');
  var tabOf = Object.create(null), areaBtn = Object.create(null);
  var loaded = Object.create(null), want = null, cur = null, svg = null, base = null, view = null, selected = null;

  window.LAMU_PFD = { add: function (d) { loaded[d.id] = d; if (want && want.id === d.id) { show(d.id, want.sel); } } };

  // ---- the plant tabs: one button per plant area, and every sheet as a tab, grouped and coloured by area
  var groupEl = Object.create(null);
  INDEX.forEach(function (s) {
    if (!groupEl[s.code]) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = s.code + ' ' + s.areaShort; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { open(s.id, null); });
      areasEl.appendChild(b); areaBtn[s.code] = b;
      var g = document.createElement('div'); g.className = 'group';
      var c = document.createElement('span'); c.className = 'code'; c.textContent = s.code; c.style.color = s.color;
      g.appendChild(c); tabsEl.appendChild(g); groupEl[s.code] = g;
    }
    var t = document.createElement('button');
    t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', 'false');
    t.title = s.id + ' ' + s.title;
    var n = document.createElement('b'); n.textContent = s.id; n.style.color = s.color;
    t.appendChild(n); t.appendChild(document.createTextNode(s.tab));
    t.addEventListener('click', function () { open(s.id, null); });
    groupEl[s.code].appendChild(t); tabOf[s.id] = t;
  });
  // left and right arrow keys move along the tabs when a tab has the keyboard
  tabsEl.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') { return; }
    ev.preventDefault(); ev.stopPropagation();
    step(ev.key === 'ArrowLeft' ? -1 : 1);       // markTabs moves the keyboard to the new tab once the sheet is shown
  });

  function markTabs(id) {
    var s = INDEX[byId[id]];
    var keyboardOnTabs = tabsEl.contains(document.activeElement);
    INDEX.forEach(function (x) {
      var on = x.id === id;
      tabOf[x.id].setAttribute('aria-selected', on ? 'true' : 'false');
      tabOf[x.id].tabIndex = on ? 0 : -1;
      tabOf[x.id].style.borderTopColor = on ? x.color : 'transparent';
    });
    Object.keys(areaBtn).forEach(function (code) {
      var on = code === s.code, b = areaBtn[code];
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.background = on ? s.color : '#fff'; b.style.borderColor = on ? s.color : '#D4D1C8';
    });
    // bring the open sheet's tab into view without moving the page
    var t = tabOf[id], box = tabsEl.getBoundingClientRect(), r = t.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) { tabsEl.scrollLeft += r.left - box.left - (box.width - r.width) / 2; }
    var a = areaBtn[s.code], abox = areasEl.getBoundingClientRect(), ar = a.getBoundingClientRect();
    if (ar.left < abox.left || ar.right > abox.right) { areasEl.scrollLeft += ar.left - abox.left - (abox.width - ar.width) / 2; }
    var where = document.getElementById('where');
    where.textContent = '';
    where.appendChild(document.createTextNode('Process flow sheets · '));
    var b = document.createElement('b'); b.textContent = 'Area ' + s.area; b.style.color = s.color; where.appendChild(b);
    where.appendChild(document.createTextNode(' · sheet ' + (byId[id] + 1) + ' of ' + INDEX.length));
    document.getElementById('sheettitle').textContent = s.id + ' ' + s.title;
    if (keyboardOnTabs) { tabOf[id].focus({ preventScroll: true }); }
  }
  document.getElementById('zin').addEventListener('click', function () { if (svg) { zoomAt(0.8); } });
  document.getElementById('zout').addEventListener('click', function () { if (svg) { zoomAt(1.25); } });
  document.getElementById('fit').addEventListener('click', function () { if (svg) { setView(base.slice()); } });

  function step(d) { var k = byId[cur] + d; if (k >= 0 && k < INDEX.length) { open(INDEX[k].id, null); } }

  function open(id, sel) {
    if (!(id in byId)) { id = INDEX[0].id; sel = null; }
    if (loaded[id]) { show(id, sel); return; }
    want = { id: id, sel: sel };
    say('Loading sheet ' + id + '…');
    var s = document.createElement('script');
    s.src = 'data/' + id + '.js';
    s.onerror = function () { say('Sheet ' + id + ' could not be loaded.'); };
    document.head.appendChild(s);
  }

  function say(text) { msg.textContent = text; msg.hidden = !text; }

  // ---- showing a sheet
  function show(id, sel) {
    var d = loaded[id];
    want = null;
    if (cur !== id) {
      cur = id; selected = null;
      stage.querySelectorAll('svg').forEach(function (n) { n.remove(); });
      var holder = document.createElement('div');
      holder.innerHTML = d.svg;
      svg = holder.querySelector('svg');
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('aria-hidden', 'true');
      stage.insertBefore(svg, msg);
      base = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      setView(base.slice());
      addTargets();
      markTabs(id);
      document.getElementById('dlx').href = 'dexpi/' + id + '.xml';
      document.getElementById('dls').href = 'svg/' + id + '.svg';
      document.title = 'Sheet ' + d.title + ' · Process flow sheets · Lamu refinery concept';
      say('');
    }
    if (sel && has(d.cards, sel)) { choose(sel); } else { unmark(); blank(d); remember(); }
  }

  // wide, invisible targets so a thin line or an open symbol is easy to select
  function addTargets() {
    var NS = 'http://www.w3.org/2000/svg';
    svg.querySelectorAll('path.stream[data-id]').forEach(function (p) {
      // the stream's number diamond and its number, drawn just after the line, select the stream too
      var n = p.nextElementSibling;
      if (n && n.matches('polygon.stream-number')) {
        n.setAttribute('data-id', p.getAttribute('data-id')); n.style.cursor = 'pointer';
        var t = n.nextElementSibling;
        if (t && t.tagName.toLowerCase() === 'text') { t.setAttribute('data-id', p.getAttribute('data-id')); t.style.cursor = 'pointer'; }
      }
      var h = document.createElementNS(NS, 'path');
      h.setAttribute('d', p.getAttribute('d')); h.setAttribute('class', 'hit'); h.setAttribute('data-id', p.getAttribute('data-id'));
      h.setAttribute('vector-effect', 'non-scaling-stroke');
      p.parentNode.insertBefore(h, p.nextSibling);
    });
    svg.querySelectorAll('g.equipment[data-body]').forEach(function (g) {
      var b = g.getAttribute('data-body').split(/\s+/).map(Number);
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', b[0]); r.setAttribute('y', b[1]); r.setAttribute('width', b[2]); r.setAttribute('height', b[3]);
      r.setAttribute('class', 'hitbox');
      g.appendChild(r);
    });
    // a control loop's bubble is small on the whole sheet: a wider invisible ring round each one
    svg.querySelectorAll('g.loop circle').forEach(function (c) {
      var h = document.createElementNS(NS, 'circle');
      h.setAttribute('cx', c.getAttribute('cx')); h.setAttribute('cy', c.getAttribute('cy'));
      h.setAttribute('r', String(Number(c.getAttribute('r') || 10) * 1.7));
      h.setAttribute('class', 'hitbox');
      c.parentNode.appendChild(h);
    });
  }

  // ---- zoom and move (the view is the SVG's viewBox)
  function setView(v) { view = v; svg.setAttribute('viewBox', v.join(' ')); }

  function toSheet(cx, cy) {
    var r = stage.getBoundingClientRect();
    var s = Math.max(view[2] / r.width, view[3] / r.height);
    var ox = (r.width * s - view[2]) / 2, oy = (r.height * s - view[3]) / 2;
    return [view[0] + (cx - r.left) * s - ox, view[1] + (cy - r.top) * s - oy, s];
  }

  function zoomAt(f, cx, cy) {
    var r = stage.getBoundingClientRect();
    if (cx === undefined) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    var p = toSheet(cx, cy);
    var w = Math.min(Math.max(view[2] * f, base[2] / 25), base[2] * 1.5);
    var k = w / view[2];
    setView([p[0] - (p[0] - view[0]) * k, p[1] - (p[1] - view[1]) * k, w, view[3] * k]);
  }

  stage.addEventListener('wheel', function (ev) {
    if (!svg) { return; }
    ev.preventDefault();
    zoomAt(ev.deltaY > 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY);
  }, { passive: false });

  // a double or triple click would start the browser's own word or line selection: stop it (the CSS above already
  // makes the drawing unselectable; this covers browsers that select on multi-click regardless)
  stage.addEventListener('mousedown', function (ev) { if (ev.detail > 1) { ev.preventDefault(); } });

  var pointers = {}, moved = 0, last = null, pinch = null;
  stage.addEventListener('pointerdown', function (ev) {
    if (!svg) { return; }
    pointers[ev.pointerId] = [ev.clientX, ev.clientY];
    stage.setPointerCapture(ev.pointerId);
    moved = 0; last = [ev.clientX, ev.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    }
  });
  stage.addEventListener('pointermove', function (ev) {
    if (!(ev.pointerId in pointers) || !svg) { return; }
    pointers[ev.pointerId] = [ev.clientX, ev.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2 && pinch) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > 0) { zoomAt(pinch.d / d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch.d = d; }
      moved += 10;
      return;
    }
    var dx = ev.clientX - last[0], dy = ev.clientY - last[1];
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4) {
      stage.classList.add('drag');
      var s = toSheet(0, 0)[2];
      setView([view[0] - dx * s, view[1] - dy * s, view[2], view[3]]);
    }
    last = [ev.clientX, ev.clientY];
  });
  function up(ev) {
    var wasTap = moved <= 4 && Object.keys(pointers).length === 1;
    delete pointers[ev.pointerId];
    var left = Object.keys(pointers);
    if (left.length < 2) { pinch = null; }
    if (left.length === 1) { last = pointers[left[0]].slice(); }   // a pinch ended: carry on from the finger still down
    stage.classList.remove('drag');
    if (wasTap && ev.type === 'pointerup') { pickAt(ev.clientX, ev.clientY); }
  }
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  function pickAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var hit = el && el.closest ? el.closest('[data-id], g.equipment, g.loop, g.off-sheet') : null;
    if (!hit || !svg.contains(hit)) { clear(); return; }
    if (hit.matches('g.off-sheet')) { follow(hit.getAttribute('data-sheet'), hit.textContent.trim()); return; }
    var id = hit.getAttribute('data-id') || hit.id;
    if (has(loaded[cur].cards, id)) { choose(id); } else { clear(); }
  }

  function follow(sheet, label) {
    if (sheet && sheet in byId) { open(sheet, null); return; }
    unmark(); selected = null;
    card.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = sheet ? 'Sheet ' + sheet : 'Edge of the plant';
    var p = document.createElement('p');
    p.textContent = sheet
      ? 'This line continues on sheet ' + sheet + ', which is not on this site: it holds later or not-confirmed items.'
      : 'This line ends at the edge of the plant (' + label + '). It is not drawn further.';
    card.appendChild(h); card.appendChild(p);
    remember();
  }

  // ---- selection and the card
  function marks(id) {
    var out = [];
    svg.querySelectorAll('path.stream, polygon.stream-number, g.equipment, g.loop').forEach(function (n) {
      if ((n.getAttribute('data-id') || n.id) === id) { out.push(n); }
    });
    return out;
  }

  function unmark() { if (selected && svg) { marks(selected).forEach(function (n) { n.classList.remove('sel'); }); } }

  function clear() {
    unmark();
    selected = null;
    blank(loaded[cur]);
    remember();
  }

  function choose(id) {
    unmark();
    selected = id;
    marks(id).forEach(function (n) { n.classList.add('sel'); });
    var narrow = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    var c = loaded[cur].cards[id];
    card.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = c.title; card.appendChild(h);
    var k = document.createElement('p'); k.className = 'kind'; k.textContent = c.kind;
    if (c.sure) {
      var chip = document.createElement('span'); chip.className = 'chip ' + c.sure; chip.textContent = 'how sure: ' + c.sure;
      k.appendChild(document.createTextNode(' ')); k.appendChild(chip);
    }
    card.appendChild(k);
    if (c.rows.length) {
      var t = document.createElement('table');
      c.rows.forEach(function (r) {
        var tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
        th.textContent = r[0]; td.textContent = r[1]; tr.appendChild(th); tr.appendChild(td); t.appendChild(tr);
      });
      card.appendChild(t);
    }
    var n = document.createElement('p'); n.className = 'note';
    n.textContent = 'From this sheet’s DEXPI 2.0.1 file. Early estimates for one illustrative operating case. ' +
      'Materials of construction are not worked out at this stage.';
    card.appendChild(n);
    var back = document.createElement('button'); back.type = 'button'; back.className = 'btn'; back.textContent = 'All items on this sheet';
    back.addEventListener('click', clear);
    card.appendChild(back);
    // on a phone the card is below the drawing: bring its top into view, unless the page is just opening
    if (narrow && document.readyState === 'complete' && card.getBoundingClientRect().top > window.innerHeight * 0.6) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    remember();
  }

  // the sheet's card: what to do, and every selectable item as a list (the way in by keyboard or screen reader)
  function blank(d) {
    card.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = 'Sheet ' + d.title; card.appendChild(h);
    var a = document.createElement('p'); a.className = 'kind'; a.textContent = 'Area ' + d.area; card.appendChild(a);
    var p = document.createElement('p');
    p.textContent = 'Select a stream, a piece of equipment or a control loop on the sheet, or in the list below, to see its details here.';
    card.appendChild(p);
    var det = document.createElement('details'); det.className = 'items'; det.open = true;
    var sum = document.createElement('summary'); sum.textContent = Object.keys(d.cards).length + ' items on this sheet';
    det.appendChild(sum);
    var ul = document.createElement('ul'); ul.id = 'list';
    var rank = function (id) { return id.indexOf('EQ-') === 0 ? 0 : id.indexOf('ST-') === 0 ? 1 : 2; };
    Object.keys(d.cards).sort(function (x, y) {
      return rank(x) - rank(y) || d.cards[x].title.localeCompare(d.cards[y].title, undefined, { numeric: true });
    }).forEach(function (id) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = d.cards[id].title;
      b.addEventListener('click', function () { choose(id); });
      li.appendChild(b); ul.appendChild(li);
    });
    det.appendChild(ul); card.appendChild(det);
    var n = document.createElement('p'); n.className = 'note';
    n.textContent = 'The stream table at the foot of the sheet lists every stream’s flow and conditions. ' +
      'The DEXPI 2.0.1 file holds the same sheet as data that engineering software can read.';
    card.appendChild(n);
  }

  // ---- the address: #<sheet> or #<sheet>:<item>, kept current; a changed address opens what it names
  function remember() {
    var h = '#' + cur + (selected ? ':' + selected : '');
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (err) { /* some browsers refuse this on a page opened from disk */ }
    }
  }

  function fromHash() {
    var raw = location.hash.slice(1), parts;
    try { parts = decodeURIComponent(raw).split(':'); } catch (err) { parts = []; }
    return { sheet: parts[0] || '', item: parts[1] || null };
  }

  window.addEventListener('hashchange', function () {
    var h = fromHash();
    if (h.sheet && (h.sheet !== cur || h.item !== selected)) { open(h.sheet, h.item); }
  });

  document.addEventListener('keydown', function (ev) {
    if (!svg || ev.ctrlKey || ev.metaKey || ev.altKey) { return; }        // the browser's own zoom and shortcuts
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'summary') { return; }
    var onStage = document.activeElement === stage;
    var s = view[2] / 10;
    if (ev.key === '+' || ev.key === '=') { zoomAt(0.8); }
    else if (ev.key === '-') { zoomAt(1.25); }
    else if (ev.key === '0') { setView(base.slice()); }
    else if (ev.key === 'Escape') { clear(); }
    else if (onStage && ev.key === 'ArrowLeft') { setView([view[0] - s, view[1], view[2], view[3]]); }
    else if (onStage && ev.key === 'ArrowRight') { setView([view[0] + s, view[1], view[2], view[3]]); }
    else if (onStage && ev.key === 'ArrowUp') { setView([view[0], view[1] - s, view[2], view[3]]); }
    else if (onStage && ev.key === 'ArrowDown') { setView([view[0], view[1] + s, view[2], view[3]]); }
    else { return; }
    ev.preventDefault();
  });

  var start = fromHash();
  if (INDEX.length) { open(start.sheet || INDEX[0].id, start.item); }
})();
