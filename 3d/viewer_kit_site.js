(function () {
  "use strict";
  var T = window.THREE;
  if (!T) { if (window.console) console.warn("viewer_kit_site.js: THREE is not loaded"); return; }
  var KIT = window.KIT = window.KIT || {kinds: {}};
  KIT.kinds = KIT.kinds || {};
  KIT.helpers = KIT.helpers || {};
  var STYLE = {ground: 0xd8cfbd, pad: 0xcfc5b0, road: 0x6e6e6e, sea: 0x7fb0d8, metal: 0xc9ccd0, metalDark: 0xa9adb3,
    steel: 0x5a5f66, rail: 0xb5b84a, concrete: 0xbdb7aa, building: 0xd9cdb4, edge: 0x3a3d42, stackBand: 0xb8413a,
    flame: 0xf2a33a};
  KIT.style = KIT.style || {};
  Object.keys(STYLE).forEach(function (k) { if (KIT.style[k] === undefined) KIT.style[k] = STYLE[k]; });
  var EXTRA = {deck: 0x8f949a, dark: 0x51565d, white: 0xedede8, tank: 0xe2e3df, roofDeck: 0x9da2a7, clad: 0xd2d5d2,
    chim: 0xdcdcd6, gravel: 0xc0b6a2, fence: 0x8a8f94, glass: 0x6f7b86, hull: 0x3d434a, boot: 0x8e3b30,
    shipDeck: 0x8b4c3e, rubber: 0x2c2c2d, buoy: 0xe0a92e, hose: 0x2f3032, arm: 0xe9e9e3, pile: 0x6f6c66,
    trafo: 0x7f8b88, insul: 0x9a6b4f, dome: 0xe6e4de, flameCore: 0xfff1b8, flameOut: 0xf2a33a, lifeboat: 0xe2742e, water: 0x7fb0d8,
    roadSurf: 0x77777a, pipeA: 0x9cab95, sterile: 0xd2c9b5, duct: 0x8c8172, furnace: 0x7d848c, hull2: 0x2f3439,
    swivel: 0x2c3e50, coupler: 0xd8a02a, seal: 0x2a2a2a, valve: 0x3f4a55,
    hivis: 0xf2661b, hat: 0xf4f1e6, skin: 0xb07a52, trousers: 0x2b3440, cab: 0x2f5d8a, tyre: 0x1f1f20};
  var PI = Math.PI, TAU = PI * 2, IDENT = new T.Matrix4();
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function getMat(ctx, name) {
    var mats = ctx.mats || (ctx.mats = {});
    var st = ctx.style || KIT.style;
    var key = (STYLE[name] !== undefined && name !== "edge") ? name : "site." + name;
    if (mats[key]) return mats[key];
    var two = name.length > 2 && name.slice(-2) === "DS", base = two ? name.slice(0, -2) : name;
    var col = (st && st[base] !== undefined) ? st[base] : (STYLE[base] !== undefined ? STYLE[base] :
      (EXTRA[base] !== undefined ? EXTRA[base] : 0xff00ff));
    var m;
    if (name === "edge") m = new T.LineBasicMaterial({color: col, transparent: true, opacity: 0.5});
    else if (name === "blob") m = new T.MeshBasicMaterial({color: 0x000000, vertexColors: true, transparent: true,
      depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    else if (name === "flame" || name === "flameCore") m = new T.MeshBasicMaterial({color: col});
    else if (name === "flameOut") m = new T.MeshBasicMaterial({color: col, transparent: true, opacity: 0.72, depthWrite: false});
    else if (name === "gravel" || name === "roadSurf" || name === "sterile") m = new T.MeshLambertMaterial({color: col});
    else m = new T.MeshLambertMaterial({color: col, side: two ? T.DoubleSide : T.FrontSide, polygonOffset: true,
      polygonOffsetFactor: 1, polygonOffsetUnits: 1});
    m.name = key;
    mats[key] = m;
    return m;
  }
  var GC = {}, EC = {};
  function segFor(r) { return r < 0.12 ? 6 : r < 0.35 ? 8 : r < 0.9 ? 12 : r < 2.5 ? 20 : r < 5 ? 32 : 48; }
  function gBox() { return GC.box || (GC.box = new T.BoxGeometry(1, 1, 1)); }
  function gTaper(seg, open, a, b) {
    a = r2(a); b = r2(b);
    var k = "t" + seg + (open ? "o" : "c") + a + "_" + b;
    return GC[k] || (GC[k] = new T.CylinderGeometry(a, b, 1, seg, 1, !!open));
  }
  function gHead(seg) {
    var k = "h" + seg;
    return GC[k] || (GC[k] = new T.SphereGeometry(1, seg, Math.max(3, Math.round(seg / 4)), 0, TAU, 0, PI / 2));
  }
  function gSphere(seg) { var k = "s" + seg; return GC[k] || (GC[k] = new T.SphereGeometry(1, seg, Math.max(3, seg >> 1))); }
  function gFrustum(kx, kz) {
    kx = r2(kx); kz = r2(kz);
    var k = "f" + kx + "_" + kz;
    if (GC[k]) return GC[k];
    var g = new T.BoxGeometry(1, 1, 1), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * kx); p.setZ(i, p.getZ(i) * kz); }
    g.computeVertexNormals();
    return (GC[k] = g);
  }
  function gCircle(seg) {
    var k = "c" + seg;
    if (GC[k]) return GC[k];
    var a = [];
    for (var i = 0; i < seg; i++) {
      var t0 = TAU * i / seg, t1 = TAU * (i + 1) / seg;
      a.push(Math.cos(t0), 0, Math.sin(t0), Math.cos(t1), 0, Math.sin(t1));
    }
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(a, 3));
    return (GC[k] = g);
  }
  function gEdges(g) { return EC[g.uuid] || (EC[g.uuid] = new T.EdgesGeometry(g, 30)); }
  var _q = new T.Quaternion(), _e = new T.Euler(), _up = new T.Vector3(0, 1, 0), _d = new T.Vector3(),
    _p = new T.Vector3(), _s = new T.Vector3();
  function mTRS(x, y, z, sx, sy, sz, ry, rx, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, "YXZ");
    _q.setFromEuler(_e);
    return new T.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  }
  function mDir(px, py, pz, dx, dy, dz, sx, sy, sz) {
    _d.set(dx, dy, dz);
    var L = _d.length();
    if (L < 1e-9) return null;
    _d.divideScalar(L);
    _q.setFromUnitVectors(_up, _d);
    return new T.Matrix4().compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
  }
  function mSeg(a, b, sx, sz) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-6) return null;
    return mDir((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, dx, dy, dz, sx, L, sz);
  }
  function P3(cx, cz, r, a, y) { return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)]; }
  function arcPts(cx, cz, r, a0, a1, full) {
    var n = Math.max(2, Math.ceil((a1 - a0) / (PI / 18))), out = [];
    for (var i = 0; i <= n; i++) {
      if (full && i === n) break;
      var a = a0 + (a1 - a0) * i / n;
      out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    return out;
  }
  function rng(seed) {
    var h = 2166136261 >>> 0, s = String(seed || "x");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h = (h + 0x6D2B79F5) | 0;
      var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mergeList(list) {
    var nv = 0, ni = 0, i, k;
    for (i = 0; i < list.length; i++) {
      var g0 = list[i].g, c0 = g0.attributes.position.count;
      nv += c0; ni += g0.index ? g0.index.count : c0;
    }
    var P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i].g, m = list[i].m, pa = g.attributes.position.array, na = g.attributes.normal.array,
        c = g.attributes.position.count;
      nm.getNormalMatrix(m);
      for (k = 0; k < c; k++) {
        v.set(pa[3 * k], pa[3 * k + 1], pa[3 * k + 2]).applyMatrix4(m);
        n.set(na[3 * k], na[3 * k + 1], na[3 * k + 2]).applyMatrix3(nm).normalize();
        var o = 3 * (vo + k);
        P[o] = v.x; P[o + 1] = v.y; P[o + 2] = v.z;
        N[o] = n.x; N[o + 1] = n.y; N[o + 2] = n.z;
      }
      var flip = m.determinant() < 0, idx = g.index ? g.index.array : null, cnt = idx ? idx.length : c;
      for (k = 0; k + 2 < cnt; k += 3) {
        var a = idx ? idx[k] : k, b = idx ? idx[k + 1] : k + 1, d = idx ? idx[k + 2] : k + 2;
        I[io++] = vo + a;
        if (flip) { I[io++] = vo + d; I[io++] = vo + b; } else { I[io++] = vo + b; I[io++] = vo + d; }
      }
      vo += c;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(P, 3));
    geo.setAttribute("normal", new T.BufferAttribute(N, 3));
    geo.setIndex(new T.BufferAttribute(I, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
  function mergeLines(list) {
    var n = 0;
    list.forEach(function (e) { n += e.g.attributes.position.count; });
    var P = new Float32Array(n * 3), o = 0, v = new T.Vector3();
    list.forEach(function (e) {
      var pa = e.g.attributes.position.array, c = e.g.attributes.position.count;
      for (var k = 0; k < c; k++) {
        v.set(pa[3 * k], pa[3 * k + 1], pa[3 * k + 2]).applyMatrix4(e.m);
        P[o++] = v.x; P[o++] = v.y; P[o++] = v.z;
      }
    });
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(P, 3));
    geo.computeBoundingSphere();
    return geo;
  }
  function blobGeom(list) {
    var pos = [], col = [], idx = [], base = 0, n = 40;
    list.forEach(function (bl) {
      var x = bl[0], z = bl[1], ax = bl[2] / 2, az = bl[3] / 2, p = bl[4];
      pos.push(x, 0.15, z); col.push(0, 0, 0, 0.2);
      [[0.9, 0.15], [1.3, 0.0]].forEach(function (rg) {
        for (var i = 0; i < n; i++) {
          var a = TAU * i / n, c = Math.cos(a), s = Math.sin(a);
          var k = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
          pos.push(x + ax * rg[0] * c * k, 0.15, z + az * rg[0] * s * k);
          col.push(0, 0, 0, rg[1]);
        }
      });
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        idx.push(base, base + 1 + j, base + 1 + i);
        idx.push(base + 1 + i, base + 1 + j, base + 1 + n + j);
        idx.push(base + 1 + i, base + 1 + n + j, base + 1 + n + i);
      }
      base += 1 + 2 * n;
    });
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  function Builder(ctx, kind) { this.ctx = ctx || {}; this.kind = kind; this.L = {}; this.E = []; this.blobs = []; }
  var BP = Builder.prototype;
  BP.put = function (layer, mat, g, m) {
    if (!m) return;
    var L = this.L[layer] || (this.L[layer] = {});
    (L[mat] || (L[mat] = [])).push({g: g, m: m});
  };
  BP.edge = function (g, m) { if (m) this.E.push({g: g, m: m}); };
  BP.box = function (layer, mat, x, y, z, sx, sy, sz, ry, edge) {
    var m = mTRS(x, y, z, sx, sy, sz, ry || 0);
    this.put(layer, mat, gBox(), m);
    if (edge) this.edge(gEdges(gBox()), m);
    return m;
  };
  BP.boxB = function (layer, mat, x, y0, z, sx, sy, sz, ry, edge) {
    return this.box(layer, mat, x, y0 + sy / 2, z, sx, sy, sz, ry, edge);
  };
  BP.frustum = function (layer, mat, x, y0, z, sxb, szb, sxt, szt, h, edge) {
    var g = gFrustum(sxt / sxb, szt / szb), m = mTRS(x, y0 + h / 2, z, sxb, h, szb, 0);
    this.put(layer, mat, g, m);
    if (edge) this.edge(gEdges(g), m);
  };
  BP.vcyl = function (layer, mat, x, y0, z, rb, h, o) {
    o = o || {};
    var rt = o.rTop == null ? rb : o.rTop, mm = Math.max(rb, rt, 1e-3), seg = o.seg || segFor(mm);
    var g = gTaper(seg, o.open, rt / mm, rb / mm), m = mTRS(x, y0 + h / 2, z, mm, h, mm, o.ry || 0);
    this.put(layer, mat, g, m);
    if (o.edge) this.edge(gEdges(g), m);
    return m;
  };
  BP.cyl2 = function (layer, mat, a, b, r, o) {
    o = o || {};
    var rt = o.rTop == null ? r : o.rTop, mm = Math.max(r, rt, 1e-3), seg = o.seg || segFor(mm);
    var g = gTaper(seg, o.open, rt / mm, r / mm), m = mSeg(a, b, mm, mm);
    this.put(layer, mat, g, m);
    if (o.edge) this.edge(gEdges(g), m);
    return m;
  };
  BP.bar = function (layer, mat, a, b, t) { this.put(layer, mat, gTaper(4, true, 1, 1), mSeg(a, b, t * 0.7071, t * 0.7071)); };
  BP.head = function (layer, mat, x, y, z, r, hr, down, seg) {
    this.put(layer, mat, gHead(seg || segFor(r)), mTRS(x, y, z, r, hr, r, 0, down ? PI : 0, 0));
  };
  BP.headDir = function (layer, mat, p, dir, r, hr, seg) {
    this.put(layer, mat, gHead(seg || segFor(r)), mDir(p[0], p[1], p[2], dir[0], dir[1], dir[2], r, hr, r));
  };
  BP.sphere = function (layer, mat, p, r, seg) { this.put(layer, mat, gSphere(seg || segFor(r)), mTRS(p[0], p[1], p[2], r, r, r)); };
  BP.pipe = function (layer, mat, pts, r, o) {
    o = o || {};
    var seg = o.seg || (r < 0.3 ? 8 : r < 0.8 ? 12 : 16);
    for (var i = 0; i + 1 < pts.length; i++) {
      this.cyl2(layer, mat, pts[i], pts[i + 1], r, {seg: seg});
      if (i > 0) this.sphere(layer, mat, pts[i], r, seg);
    }
  };
  BP.nozzle = function (layer, a, b, r) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var f = [b[0] - dx / L * Math.min(0.15, L * 0.3), b[1] - dy / L * Math.min(0.15, L * 0.3), b[2] - dz / L * Math.min(0.15, L * 0.3)];
    this.cyl2(layer, "metal", a, f, r, {seg: segFor(r)});
    this.cyl2(layer, "metalDark", f, b, r * 1.45, {seg: segFor(r)});
  };
  BP.ring = function (x, y, z, r, seg) { this.edge(gCircle(seg || 64), mTRS(x, y, z, r, 1, r)); };
  BP.ringDir = function (p, dir, r, seg) { this.edge(gCircle(seg || 48), mDir(p[0], p[1], p[2], dir[0], dir[1], dir[2], r, 1, r)); };
  BP.annulus = function (layer, mat, cx, cz, y0, r1, r2_, a0, a1, th, edge) {
    var full = a1 - a0 >= TAU - 1e-4, n = Math.max(4, Math.ceil((a1 - a0) / (PI / 24))), s = new T.Shape(), i, a;
    if (full) {
      for (i = 0; i < n; i++) { a = TAU * i / n; if (i) s.lineTo(r2_ * Math.cos(a), -r2_ * Math.sin(a)); else s.moveTo(r2_ * Math.cos(a), -r2_ * Math.sin(a)); }
      var hole = new T.Path();
      for (i = 0; i < n; i++) { a = TAU * i / n; if (i) hole.lineTo(r1 * Math.cos(a), -r1 * Math.sin(a)); else hole.moveTo(r1 * Math.cos(a), -r1 * Math.sin(a)); }
      s.holes.push(hole);
    } else {
      for (i = 0; i <= n; i++) { a = a0 + (a1 - a0) * i / n; if (i) s.lineTo(r2_ * Math.cos(a), -r2_ * Math.sin(a)); else s.moveTo(r2_ * Math.cos(a), -r2_ * Math.sin(a)); }
      for (i = n; i >= 0; i--) { a = a0 + (a1 - a0) * i / n; s.lineTo(r1 * Math.cos(a), -r1 * Math.sin(a)); }
    }
    var g = new T.ExtrudeGeometry(s, {depth: th, bevelEnabled: false, curveSegments: 1});
    g.rotateX(-PI / 2);
    g.translate(cx, y0, cz);
    this.put(layer, mat, g, IDENT);
    if (edge) this.edge(new T.EdgesGeometry(g, 30), IDENT);
  };
  BP.slab = function (layer, mat, x0, z0, x1, z1, y0, th, holes, edge) {
    var s = new T.Shape();
    s.moveTo(x0, -z0); s.lineTo(x1, -z0); s.lineTo(x1, -z1); s.lineTo(x0, -z1);
    (holes || []).forEach(function (hh) {
      var p = new T.Path(), n = 32;
      for (var i = 0; i < n; i++) {
        var a = TAU * i / n, u = hh[0] + hh[2] * Math.cos(a), v = -(hh[1] + hh[2] * Math.sin(a));
        if (i) p.lineTo(u, v); else p.moveTo(u, v);
      }
      s.holes.push(p);
    });
    var g = new T.ExtrudeGeometry(s, {depth: th, bevelEnabled: false, curveSegments: 1});
    g.rotateX(-PI / 2);
    g.translate(0, y0, 0);
    this.put(layer, mat, g, IDENT);
    if (edge) this.edge(new T.EdgesGeometry(g, 30), IDENT);
  };
  BP.prismX = function (layer, mat, xc, y0, zc, L, pts, edge) {
    var s = new T.Shape();
    pts.forEach(function (p, i) { if (i) s.lineTo(-p[0], p[1]); else s.moveTo(-p[0], p[1]); });
    var g = new T.ExtrudeGeometry(s, {depth: L, bevelEnabled: false, curveSegments: 1});
    g.rotateY(PI / 2);
    g.translate(xc - L / 2, y0, zc);
    this.put(layer, mat, g, IDENT);
    if (edge) this.edge(new T.EdgesGeometry(g, 30), IDENT);
  };
  BP.rail = function (pts, y, closed, o) {
    o = o || {};
    var t = o.t || 0.07, hg = o.h || 1.1, L = o.layer || "access", M = o.mat || "rail";
    var nseg = closed ? pts.length : pts.length - 1;
    for (var i = 0; i < nseg; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.05) continue;
      var n = Math.max(1, Math.ceil(len / 1.8));
      for (var k = 0; k < n; k++) {
        var px = a[0] + dx * k / n, pz = a[1] + dz * k / n;
        this.bar(L, M, [px, y, pz], [px, y + hg, pz], t);
      }
      this.bar(L, M, [a[0], y + hg, a[1]], [b[0], y + hg, b[1]], t);
      this.bar(L, M, [a[0], y + hg * 0.5, a[1]], [b[0], y + hg * 0.5, b[1]], t * 0.8);
    }
    if (!closed && pts.length > 1) { var e = pts[pts.length - 1]; this.bar(L, M, [e[0], y, e[1]], [e[0], y + hg, e[1]], t); }
  };
  BP.railRect = function (x0, z0, x1, z1, y, sides) {
    sides = sides || "nsew";
    if (sides.indexOf("s") >= 0) this.rail([[x0, z0], [x1, z0]], y);
    if (sides.indexOf("e") >= 0) this.rail([[x1, z0], [x1, z1]], y);
    if (sides.indexOf("n") >= 0) this.rail([[x1, z1], [x0, z1]], y);
    if (sides.indexOf("w") >= 0) this.rail([[x0, z1], [x0, z0]], y);
  };
  BP.platform = function (x0, z0, x1, z1, y, sides, edge) {
    this.box("deck", "deck", (x0 + x1) / 2, y - 0.125, (z0 + z1) / 2, x1 - x0, 0.25, z1 - z0, 0, edge !== false);
    if (sides !== "") this.railRect(x0, z0, x1, z1, y, sides);
  };
  BP.ladder = function (x, z, y0, y1, ox, oz, cageFrom) {
    var tx = -oz, tz = ox, hw = 0.23, L = "access", M = "rail";
    this.bar(L, M, [x + tx * hw, y0, z + tz * hw], [x + tx * hw, y1, z + tz * hw], 0.07);
    this.bar(L, M, [x - tx * hw, y0, z - tz * hw], [x - tx * hw, y1, z - tz * hw], 0.07);
    for (var y = y0 + 0.3; y < y1 - 1.0; y += 0.3) this.bar(L, M, [x - tx * hw, y, z - tz * hw], [x + tx * hw, y, z + tz * hw], 0.04);
    if (cageFrom != null && y1 - cageFrom > 0.6) {
      var R = 0.38, c0 = x + ox * 0.25, c1 = z + oz * 0.25, pts = [], j;
      for (j = 0; j <= 6; j++) {
        var th = -0.35 + (PI + 0.7) * j / 6;
        pts.push([c0 + (-tx * Math.cos(th) + ox * Math.sin(th)) * R, c1 + (-tz * Math.cos(th) + oz * Math.sin(th)) * R]);
      }
      var nh = Math.max(1, Math.round((y1 - cageFrom) / 0.9));
      for (var k = 0; k <= nh; k++) {
        var yy = cageFrom + (y1 - cageFrom) * k / nh;
        for (j = 0; j < 6; j++) this.bar(L, M, [pts[j][0], yy, pts[j][1]], [pts[j + 1][0], yy, pts[j + 1][1]], 0.05);
      }
      for (j = 1; j < 6; j++) this.bar(L, M, [pts[j][0], cageFrom, pts[j][1]], [pts[j][0], y1, pts[j][1]], 0.05);
    }
  };
  BP.flight = function (a, b, wf) {
    var dx = b[0] - a[0], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / L, uz = dz / L, vx = -uz, vz = ux;
    var rise = b[1] - a[1], m = Math.max(2, Math.round(rise / 0.2)), ry = Math.atan2(-uz, ux), self = this;
    [-1, 1].forEach(function (sd) {
      var ox = vx * sd * wf / 2, oz = vz * sd * wf / 2;
      self.bar("deck", "steel", [a[0] + ox, a[1] - 0.15, a[2] + oz], [b[0] + ox, b[1] - 0.15, b[2] + oz], 0.16);
      self.bar("access", "rail", [a[0] + ox, a[1] + 1.0, a[2] + oz], [b[0] + ox, b[1] + 1.0, b[2] + oz], 0.06);
      self.bar("access", "rail", [a[0] + ox, a[1] + 0.5, a[2] + oz], [b[0] + ox, b[1] + 0.5, b[2] + oz], 0.05);
      self.bar("access", "rail", [a[0] + ox, a[1], a[2] + oz], [a[0] + ox, a[1] + 1.0, a[2] + oz], 0.06);
    });
    for (var i = 1; i < m; i++) {
      var t = i / m;
      this.box("access", "deck", a[0] + dx * t, a[1] + rise * t, a[2] + dz * t, L / m, 0.05, wf, ry);
    }
  };
  BP.stairTower = function (x, z, y0, y1, ry, o) {
    o = o || {};
    var wf = o.wf || 1.0, tanA = Math.tan(40 * PI / 180);
    var n = Math.max(1, Math.ceil((y1 - y0) / (o.rise || 3.4) - 1e-6)), rise = (y1 - y0) / n, run = rise / tanA, ld = 1.3;
    var Lt = run + 2 * ld, Wt = 2 * wf + 0.3, c = Math.cos(ry || 0), s = Math.sin(ry || 0), self = this, k;
    function P(u, y, v) { return [x + u * c + v * s, y, z - u * s + v * c]; }
    function Pz(u, v) { var p = P(u, 0, v); return [p[0], p[2]]; }
    [[-Lt / 2, -Wt / 2], [Lt / 2, -Wt / 2], [Lt / 2, Wt / 2], [-Lt / 2, Wt / 2], [-run / 2, -Wt / 2], [run / 2, -Wt / 2],
      [-run / 2, Wt / 2], [run / 2, Wt / 2]].forEach(function (q) {
      self.bar("deck", "steel", P(q[0], y0, q[1]), P(q[0], y1 + 1.1, q[1]), 0.2);
    });
    var lands = [];
    for (k = 0; k <= n; k++) {
      var yk = y0 + k * rise;
      lands.push(yk);
      if (k === 0) continue;
      var end = (k % 2 === 0) ? -1 : 1, uc = end * (run / 2 + ld / 2), pc = P(uc, yk - 0.06, 0);
      this.box("deck", "deck", pc[0], pc[1], pc[2], ld, 0.12, Wt, ry || 0);
      var ue = end * Lt / 2, ui = end * run / 2;
      this.rail([Pz(ui, -Wt / 2), Pz(ue, -Wt / 2), Pz(ue, Wt / 2), Pz(ui, Wt / 2)], yk, false);
      this.bar("deck", "steel", P(-Lt / 2, yk - 0.15, -Wt / 2), P(Lt / 2, yk - 0.15, -Wt / 2), 0.16);
      this.bar("deck", "steel", P(-Lt / 2, yk - 0.15, Wt / 2), P(Lt / 2, yk - 0.15, Wt / 2), 0.16);
    }
    for (k = 0; k < n; k++) {
      var ya = y0 + k * rise, dir = (k % 2) ? -1 : 1, v = (k % 2 ? 1 : -1) * (wf / 2 + 0.075);
      this.flight(P(-dir * run / 2, ya, v), P(dir * run / 2, ya + rise, v), wf);
    }
    return {lands: lands, Lt: Lt, Wt: Wt, P: P, rise: rise, run: run};
  };
  BP.lattice = function (cx, cz, y0, h, wb, wt, levels, o) {
    o = o || {};
    var L = o.layer || "body", M = o.mat || "steel", tl = o.tl || 0.35, tb = o.tb || 0.16, i, k;
    function corner(i2, y) {
      var f = (y - y0) / h, w = (wb + (wt - wb) * f) / 2, sx = (i2 === 0 || i2 === 3) ? -1 : 1, sz = (i2 < 2) ? -1 : 1;
      return [cx + sx * w, y, cz + sz * w];
    }
    for (i = 0; i < 4; i++) this.bar(L, M, corner(i, y0), corner(i, y0 + h), tl);
    for (k = 0; k <= levels; k++) {
      var y = y0 + h * k / levels;
      for (i = 0; i < 4; i++) this.bar(L, M, corner(i, y), corner((i + 1) % 4, y), tb);
    }
    for (k = 0; k < levels; k++) {
      var ya = y0 + h * k / levels, yb = y0 + h * (k + 1) / levels;
      for (i = 0; i < 4; i++) {
        var j = (i + 1) % 4;
        this.bar(L, M, corner(i, ya), corner(j, yb), tb * 0.8);
        this.bar(L, M, corner(j, ya), corner(i, yb), tb * 0.8);
      }
    }
  };
  BP.blob = function (x, z, sx, sz, rect) { this.blobs.push([x, z, sx, sz, rect ? 6 : 2]); };
  var LAYERS = ["body", "deck", "detail", "access"];
  BP.finish = function () {
    var self = this, grp = new T.Group();
    grp.name = this.kind;
    grp.userData.kind = this.kind;
    grp.userData.kit = "site";
    LAYERS.forEach(function (ln) {
      var L = self.L[ln];
      if (!L) return;
      var lg = new T.Group();
      lg.name = ln;
      Object.keys(L).forEach(function (mn) {
        var mesh = new T.Mesh(mergeList(L[mn]), getMat(self.ctx, mn));
        mesh.name = ln + ":" + mn;
        lg.add(mesh);
      });
      grp.add(lg);
    });
    if (this.E.length) {
      var eg = new T.Group();
      eg.name = "edges";
      eg.add(new T.LineSegments(mergeLines(this.E), getMat(this.ctx, "edge")));
      grp.add(eg);
    }
    if (this.blobs.length) {
      var sg = new T.Group();
      sg.name = "shadow";
      var bm = new T.Mesh(blobGeom(this.blobs), getMat(this.ctx, "blob"));
      bm.renderOrder = -1;
      sg.add(bm);
      grp.add(sg);
    }
    return grp;
  };
  function lod(group, distance) {
    var ch = group.children;
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i], n = c.name;
      if (n === "access") c.visible = distance < 600;
      else if (n === "detail") c.visible = distance < 1200;
      else if (n === "deck") c.visible = distance < 1800;
      else if (n === "edges") c.visible = distance < 2500;
    }
  }
  function profR(prof, y) {
    if (y <= prof[0][0]) return prof[0][1];
    for (var i = 0; i + 1 < prof.length; i++) {
      var a = prof[i], b = prof[i + 1];
      if (y <= b[0]) return b[0] - a[0] < 1e-6 ? b[1] : a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    return prof[prof.length - 1][1];
  }
  function shell(b, layer, mat, cx, cz, prof, seam) {
    var rm = 0, i;
    for (i = 0; i < prof.length; i++) rm = Math.max(rm, prof[i][1]);
    var seg = segFor(rm) + 8;
    for (i = 0; i + 1 < prof.length; i++) {
      var a = prof[i], c = prof[i + 1];
      if (c[0] - a[0] < 1e-3) continue;
      b.vcyl(layer, mat, cx, a[0], cz, a[1], c[0] - a[0], {rTop: c[1], seg: seg, open: true});
      b.ring(cx, a[0], cz, a[1] * 1.003);
    }
    var top = prof[prof.length - 1];
    b.ring(cx, top[0], cz, top[1] * 1.003);
    if (seam) for (var y = prof[0][0] + seam; y < top[0] - seam * 0.5; y += seam) b.ring(cx, y, cz, profR(prof, y) * 1.003, 48);
  }
  function vesselAccess(b, rAt, levels, th0, o) {
    o = o || {};
    var cx = o.cx || 0, cz = o.cz || 0, n = levels.length, ths = [], rl = [], i, y;
    if (!n) return {ths: ths, rl: rl};
    for (i = 0; i < n; i++) {
      var ys = i ? levels[i - 1] : (o.y0 || 0), ye = levels[i], rm = 0;
      for (y = ys; y <= ye + 1.2; y += 0.5) rm = Math.max(rm, rAt(y));
      rl.push(rm + 0.3);
      ths.push(th0 + ((i % 2) ? 2.6 / (rm + 1) : 0));
    }
    for (i = 0; i < n; i++) {
      y = levels[i];
      var r = rAt(y), rIn = r + 0.12;
      var rOut = Math.max(rl[i], i + 1 < n ? rl[i + 1] : 0) + 1.25;
      if (rOut < rIn + 1.1) rOut = rIn + 1.1;
      var full = (o.topFull && i === n - 1) || o.allFull || (o.fullEvery && i % o.fullEvery === o.fullEvery - 1);
      var span = Math.max(o.minSpan || 1.05, 5.5 / rOut) + (o.vary && i % 3 === 1 ? 1.3 : 0);
      var aA = ths[i], aB = i + 1 < n ? ths[i + 1] : ths[i];
      var a0 = Math.min(aA, aB) - span / 2, a1 = Math.max(aA, aB) + span / 2;
      if (full) { a0 = th0 - PI; a1 = th0 + PI; }
      b.annulus("deck", "deck", cx, cz, y - 0.25, rIn, rOut, a0, a1, 0.25, true);
      b.rail(arcPts(cx, cz, rOut - 0.06, a0, a1, full), y, full);
      if (!full) {
        b.rail([[cx + (rIn + 0.05) * Math.cos(a0), cz + (rIn + 0.05) * Math.sin(a0)], [cx + (rOut - 0.06) * Math.cos(a0), cz + (rOut - 0.06) * Math.sin(a0)]], y, false);
        b.rail([[cx + (rIn + 0.05) * Math.cos(a1), cz + (rIn + 0.05) * Math.sin(a1)], [cx + (rOut - 0.06) * Math.cos(a1), cz + (rOut - 0.06) * Math.sin(a1)]], y, false);
      }
      var nbk = Math.max(2, Math.ceil((a1 - a0) * rOut / 3.4));
      for (var k = 0; k < nbk; k++) {
        var a = a0 + (a1 - a0) * (full ? k / nbk : (k + 0.5) / nbk), rb = rAt(y - 1.4);
        b.bar("deck", "deck", P3(cx, cz, rb, a, y - 1.3), P3(cx, cz, rOut - 0.2, a, y - 0.27), 0.1);
        b.bar("deck", "deck", P3(cx, cz, r, a, y - 0.32), P3(cx, cz, rOut - 0.05, a, y - 0.32), 0.16);
      }
      if (o.manways !== false) {
        var am = full ? th0 + PI * 0.5 : a1 - span * 0.3, ym = y + 1.0, rr = rAt(ym);
        b.nozzle("detail", P3(cx, cz, rr - 0.1, am, ym), P3(cx, cz, rr + 0.55, am, ym), clamp(r * 0.06, 0.3, 0.42));
      }
    }
    for (i = 0; i < n; i++) {
      var y0 = i ? levels[i - 1] : (o.y0 || 0), y1 = levels[i] + 1.1, th = ths[i];
      var cage = y1 - y0 > 3.5 ? y0 + (i ? 2.2 : 2.4) : null;
      b.ladder(cx + rl[i] * Math.cos(th), cz + rl[i] * Math.sin(th), y0, y1, Math.cos(th), Math.sin(th), cage);
    }
    return {ths: ths, rl: rl};
  }
  function levelsFrom(y0, yTop, sp) {
    if (yTop - y0 < sp * 0.5) return [yTop];
    var n = Math.max(1, Math.round((yTop - y0) / sp)), out = [];
    for (var i = 0; i <= n; i++) out.push(y0 + (yTop - y0) * i / n);
    return out;
  }
  function plinth(b, cx, cz, r, h) { b.vcyl("body", "concrete", cx, 0, cz, r, h, {seg: 8, ry: PI / 8, edge: true}); }
  function stackTopOf(sh, h, dflt) { sh = +sh; return sh > 0 ? (sh > h + 2 ? sh : h + sh) : h + dflt; }
  function stackBands(b, cx, cz, r, yTop, len) {
    b.vcyl("body", "dark", cx, yTop - Math.min(1.2, len * 0.04), cz, r * 1.022, Math.min(1.2, len * 0.04), {open: true});
    if (yTop < 45) return;
    var nb = 5, bh = Math.min(3.0, len * 0.35 / nb);
    for (var i = 0; i < nb; i++) b.vcyl("body", i % 2 ? "white" : "stackBand", cx, yTop - bh * (i + 1), cz, r * 1.012, bh, {open: true});
  }
  function ladderTurn(eq) {
    var id = String((eq && eq.id) || "");
    if (!id || id.indexOf("sample-") === 0) return 0.7;
    return 0.7 + (rng(id)() - 0.5) * 0.9;
  }
  function pick(eq, sample) {
    var d = {}, k, ed = (eq && eq.dims) || {}, sd = (sample && sample.dims) || {};
    for (k in sd) d[k] = sd[k];
    for (k in ed) if (isFinite(+ed[k]) && +ed[k] > 0) d[k] = +ed[k];
    return {d: d, o: (eq && eq.opts) || {}};
  }
  function reg(name, sample, note, fn) {
    KIT.kinds[name] = {
      kit: "site",
      sample: sample,
      sized_from: note,
      lod: lod,
      build: function (eq, ctx) {
        var p = pick(eq, sample);
        var b = new Builder(ctx || {THREE: T, style: KIT.style, mats: {}}, name);
        fn(b, p.d, p.o, eq || {});
        return b.finish();
      }
    };
  }
  function lift(p, dy) { return [p[0], p[1] + dy, p[2]]; }
  function lerp3(a, c, t) { return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t]; }
  function gLine() {
    if (GC.line) return GC.line;
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([0, -0.5, 0, 0, 0.5, 0], 3));
    return (GC.line = g);
  }
  BP.seg = function (a, c) { var m = mSeg(a, c, 1, 1); if (m) this.E.push({g: gLine(), m: m}); };
  BP.poly = function (pts, closed) {
    for (var i = 0; i + 1 < pts.length; i++) this.seg(pts[i], pts[i + 1]);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0]);
  };
  BP.boxR = function (layer, mat, x, y, z, sx, sy, sz, ry, rz, edge) {
    var m = mTRS(x, y, z, sx, sy, sz, ry || 0, 0, rz || 0);
    this.put(layer, mat, gBox(), m);
    if (edge) this.edge(gEdges(gBox()), m);
    return m;
  };
  BP.boxAB = function (layer, mat, a, c, sy, sz, edge) {
    var dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], Lh = Math.sqrt(dx * dx + dz * dz), L = Math.sqrt(Lh * Lh + dy * dy);
    if (L < 1e-4) return;
    return this.boxR(layer, mat, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, L, sy, sz,
      Math.atan2(-dz, dx), Math.atan2(dy, Lh || 1e-6), edge);
  };
  BP.prismY = function (layer, mat, pts, y0, th, edge) {
    var s = new T.Shape();
    pts.forEach(function (p, i) { if (i) s.lineTo(p[0], -p[1]); else s.moveTo(p[0], -p[1]); });
    var g = new T.ExtrudeGeometry(s, {depth: th, bevelEnabled: false, curveSegments: 1});
    g.rotateX(-PI / 2);
    g.translate(0, y0, 0);
    this.put(layer, mat, g, IDENT);
    if (edge) this.edge(new T.EdgesGeometry(g, 30), IDENT);
  };
  BP.cap = function (layer, mat, cx, y, cz, r, hc, seg) {
    var R = (r * r + hc * hc) / (2 * hc), th = Math.asin(Math.min(1, r / R)), k = "cap" + r2(th) + "_" + seg;
    var g = GC[k] || (GC[k] = new T.SphereGeometry(1, seg, Math.max(6, Math.round(seg / 6)), 0, TAU, 0, th));
    this.put(layer, mat, g, mTRS(cx, y + hc - R, cz, R, R, R));
    return {R: R, th: th, yc: y + hc - R};
  };
  BP.ellip = function (layer, mat, x, y, z, sx, sy, sz, p0, pl, t0, tl, seg, ry) {
    var k = "el" + r2(p0) + "_" + r2(pl) + "_" + r2(t0) + "_" + r2(tl) + "_" + seg;
    var g = GC[k] || (GC[k] = new T.SphereGeometry(1, seg, Math.max(4, seg >> 2), p0, pl, t0, tl));
    this.put(layer, mat, g, mTRS(x, y, z, sx, sy, sz, ry || 0));
  };
  function railLine(b, A, B, o) {
    o = o || {};
    var hg = o.h || 1.1, t = o.t || 0.07, M = o.mat || "rail", L = o.layer || "access";
    var dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.05) return;
    var n = Math.max(1, Math.ceil(len / (o.sp || 1.8)));
    for (var k = 0; k <= n; k++) {
      if ((k === 0 && o.noStart) || (k === n && o.noEnd)) continue;
      var p = [A[0] + dx * k / n, A[1] + dy * k / n, A[2] + dz * k / n];
      b.bar(L, M, p, [p[0], p[1] + hg, p[2]], t);
    }
    b.bar(L, M, lift(A, hg), lift(B, hg), t);
    if (!o.noKnee) b.bar(L, M, lift(A, hg * 0.5), lift(B, hg * 0.5), t * 0.8);
  }
  function arcRail(b, cx, cz, r, y, a0, a1, o) {
    o = o || {};
    var full = a1 - a0 >= TAU - 1e-4, step = o.step || PI / 18, n = Math.max(1, Math.ceil((a1 - a0) / step)), i;
    for (i = 0; i < n; i++) {
      var A = P3(cx, cz, r, a0 + (a1 - a0) * i / n, y), B = P3(cx, cz, r, a0 + (a1 - a0) * (i + 1) / n, y);
      railLine(b, A, B, {h: o.h, t: o.t, mat: o.mat, layer: o.layer, sp: o.sp, noEnd: full || i < n - 1, noKnee: o.noKnee});
    }
  }
  function trussWalk(b, A, B, wb, ht) {
    var dx = B[0] - A[0], dz = B[2] - A[2], L = Math.sqrt(dx * dx + dz * dz);
    if (L < 0.5) return;
    var ux = dx / L, uz = dz / L, vx = -uz, vz = ux, hw = wb / 2, n = Math.max(1, Math.round(L / 3.2)), i;
    ht = ht || 1.5;
    function Q(t, s, y) { return [A[0] + dx * t + vx * s * hw, A[1] + (B[1] - A[1]) * t + y, A[2] + dz * t + vz * s * hw]; }
    b.boxAB("deck", "deck", lift(A, -0.06), lift(B, -0.06), 0.12, wb, true);
    [-1, 1].forEach(function (s) {
      b.bar("deck", "steel", Q(0, s, -0.1), Q(1, s, -0.1), 0.22);
      b.bar("deck", "steel", Q(0, s, ht), Q(1, s, ht), 0.16);
      for (i = 0; i <= n; i++) b.bar("deck", "steel", Q(i / n, s, -0.1), Q(i / n, s, ht), 0.12);
      for (i = 0; i < n; i++) b.bar("deck", "steel", Q(i / n, s, i % 2 ? ht : -0.1), Q((i + 1) / n, s, i % 2 ? -0.1 : ht), 0.1);
      b.bar("access", "rail", Q(0, s, ht + 0.02), Q(1, s, ht + 0.02), 0.07);
      b.bar("access", "rail", Q(0, s, ht * 0.55), Q(1, s, ht * 0.55), 0.06);
    });
    for (i = 0; i <= n; i += 2) b.bar("deck", "steel", Q(i / n, -1, -0.15), Q(i / n, 1, -0.15), 0.14);
  }
  function helixStair(b, cx, cz, R, y0, y1, a0, dir, o) {
    o = o || {};
    var wf = o.wf || 0.9, ri = R + 0.12, ro = ri + wf, rc = ri + wf / 2, slope = Math.tan((o.ang || 40) * PI / 180);
    var rise = y1 - y0, run = rise / slope, span = run / rc * dir, i;
    var nT = Math.max(3, Math.round(rise / 0.22)), tl = run / nT * 1.12;
    for (i = 1; i < nT; i++) {
      var t = i / nT, a = a0 + span * t, p = P3(cx, cz, rc, a, y0 + rise * t - 0.03);
      b.box("access", "deck", p[0], p[1], p[2], wf, 0.05, tl, -a);
    }
    var ns = Math.max(4, Math.ceil(Math.abs(span) / (PI / 50))), inner = [], outer = [];
    for (i = 0; i <= ns; i++) {
      var t2 = i / ns, aa = a0 + span * t2, yy = y0 + rise * t2;
      inner.push(P3(cx, cz, ri, aa, yy)); outer.push(P3(cx, cz, ro, aa, yy));
    }
    for (i = 0; i < ns; i++) {
      b.bar("deck", "steel", lift(inner[i], -0.16), lift(inner[i + 1], -0.16), 0.2);
      b.bar("deck", "steel", lift(outer[i], -0.16), lift(outer[i + 1], -0.16), 0.2);
      b.bar("access", "rail", lift(outer[i], 1.0), lift(outer[i + 1], 1.0), 0.07);
      b.bar("access", "rail", lift(outer[i], 0.5), lift(outer[i + 1], 0.5), 0.055);
    }
    var len = Math.sqrt(run * run + rise * rise), np = Math.max(2, Math.round(len / 1.8));
    for (i = 0; i <= np; i++) {
      var t3 = i / np, a3 = a0 + span * t3, y3 = y0 + rise * t3, po = P3(cx, cz, ro, a3, y3);
      b.bar("access", "rail", po, lift(po, 1.0), 0.07);
      if (o.posts) {
        if (i % 3 === 1 && y3 > y0 + 1.0) [ri + 0.05, ro - 0.05].forEach(function (rq) { var pq = P3(cx, cz, rq, a3, y3 - 0.25); b.bar("deck", "steel", [pq[0], 0, pq[2]], pq, 0.16); });
      } else if (i % 2 === 1 && y3 > y0 + 1.2) b.bar("deck", "steel", P3(cx, cz, R, a3, y3 - 1.0), P3(cx, cz, ro, a3, y3 - 0.2), 0.13);
    }
    return a0 + span;
  }
  function seedOf(eq) { return rng(String((eq && eq.id) || "site")); }
  function isSample(eq) { var id = String((eq && eq.id) || ""); return !id || id.indexOf("sample-") === 0; }
  function tankSeg(r) { return r > 30 ? 96 : r > 15 ? 72 : r > 6 ? 48 : 32; }
  function tankShell(b, cx, cz, r, h, mat, seg) {
    b.vcyl("body", "concrete", cx, 0, cz, r + 0.6, 0.5, {seg: seg, edge: true});
    b.vcyl("body", mat, cx, 0.5, cz, r, h - 0.5, {seg: seg, open: true});
    var nc = Math.max(3, Math.round((h - 0.5) / 2.4));
    for (var i = 0; i <= nc; i++) b.ring(cx, 0.5 + (h - 0.5) * i / nc, cz, r * 1.002 + 0.01, seg);
  }
  function tankNozzles(b, cx, cz, r, a0, n, mixers) {
    var rp = clamp(r * 0.014, 0.2, 0.55), i;
    for (i = 0; i < n; i++) {
      var a = a0 + (i - (n - 1) / 2) * clamp(5 / r, 0.05, 0.4), y = 1.1 + rp;
      var A = P3(cx, cz, r - 0.1, a, y), C = P3(cx, cz, r + 3.5, a, y), E = P3(cx, cz, r + 3.5, a, 0.5 + rp), F = P3(cx, cz, r + 8, a, 0.5 + rp);
      b.pipe("body", "metalDark", [A, C, E, F], rp);
      b.cyl2("detail", "dark", P3(cx, cz, r + 1.0, a, y), P3(cx, cz, r + 1.6, a, y), rp * 1.6, {});
      b.box("detail", "dark", P3(cx, cz, r + 1.3, a, y)[0], y + rp * 1.6 + 0.25, P3(cx, cz, r + 1.3, a, y)[2], 0.15, 0.5, 0.15);
    }
    if (mixers) for (i = 0; i < 3; i++) {
      var am = a0 + PI * 0.7 + i * 0.12, M0 = P3(cx, cz, r - 0.05, am, 1.6), M1 = P3(cx, cz, r + 1.6, am, 1.6);
      b.cyl2("detail", "metalDark", M0, M1, 0.45, {});
      b.box("detail", "dark", P3(cx, cz, r + 2.3, am, 1.6)[0], 1.6, P3(cx, cz, r + 2.3, am, 1.6)[2], 1.4, 1.0, 1.0, -am);
    }
  }
  function stairHead(b, cx, cz, r, y, a, wf) {
    var w = 2.6 / (r + 1), a0 = a - w * 0.3, a1 = a + w * 0.7, ro = r + 0.12 + (wf || 0.9) + 0.35;
    b.annulus("deck", "deck", cx, cz, y - 0.2, r + 0.05, ro, a0, a1, 0.2, true);
    arcRail(b, cx, cz, ro - 0.05, y, a0 + 0.02, a1, {});
    railLine(b, P3(cx, cz, r + 0.1, a1, y), P3(cx, cz, ro - 0.05, a1, y), {});
  }
  function roofFittings(b, cx, cz, r, yAt, rnd, n) {
    for (var i = 0; i < n; i++) {
      var rr = r * (0.25 + 0.6 * rnd()), a = rnd() * TAU, p = P3(cx, cz, rr, a, yAt(rr)), s = 0.35 + rnd() * 0.35;
      if (i % 2) b.boxB("detail", "metalDark", p[0], p[1] - 0.1, p[2], s * 2, s * 1.4, s * 2, -a, false);
      else { b.vcyl("detail", "metalDark", p[0], p[1] - 0.1, p[2], s, s * 2.4, {seg: 10}); b.vcyl("detail", "dark", p[0], p[1] + s * 2.3, p[2], s * 1.35, 0.25, {seg: 10}); }
    }
  }
  function buildTank(b, cx, cz, D, O, eq, type) {
    var r = D.d / 2, h = D.h, seg = tankSeg(r), th0 = ladderTurn(eq), rnd = seedOf(eq), mat = O.insulated ? "metal" : "tank";
    var smallTank = r < 12;
    if (type === "floating") {
      tankShell(b, cx, cz, r, h, mat + "DS", seg);
    } else tankShell(b, cx, cz, r, h, mat, seg);
    tankNozzles(b, cx, cz, r, th0 + PI * 0.9, smallTank ? 2 : 4, !smallTank && O.mixers !== false && r > 25);
    var yTopStair = type === "floating" ? h + 0.3 : h, aTop;
    aTop = helixStair(b, cx, cz, r, 0, yTopStair, th0 - (yTopStair / Math.tan(40 * PI / 180)) / (r + 0.6), 1, {});
    if (type === "cone") {
      var slope = +O.slope > 0 ? +O.slope : 1 / 12, rise = Math.max(0.35, r * slope);
      var yAt = function (rr) { return h + rise * (1 - rr / (r + 0.15)); };
      b.vcyl("body", mat, cx, h, cz, r + 0.15, rise, {rTop: 0.45, seg: seg, open: true});
      b.ring(cx, h, cz, r + 0.16, seg);
      var nr = r > 20 ? 24 : r > 8 ? 18 : 12;
      for (var k = 0; k < nr; k++) {
        var ak = TAU * k / nr;
        b.seg(P3(cx, cz, r + 0.1, ak, yAt(r + 0.1) + 0.05), P3(cx, cz, 0.9, ak, yAt(0.9) + 0.05));
      }
      b.vcyl("detail", "metalDark", cx, h + rise - 0.2, cz, 0.7, 1.4, {seg: 12});
      b.vcyl("detail", "dark", cx, h + rise + 1.2, cz, 1.0, 0.3, {seg: 12});
      arcRail(b, cx, cz, r - 0.35, yAt(r - 0.35), 0, TAU, {step: r > 20 ? PI / 30 : PI / 18});
      var wA = P3(cx, cz, r - 0.2, aTop, yAt(r - 0.2) + 0.05), wB = P3(cx, cz, 2.0, aTop, yAt(2.0) + 0.05);
      b.boxAB("deck", "deck", wA, wB, 0.08, 0.8, false);
      var tx = -Math.sin(aTop) * 0.45, tz = Math.cos(aTop) * 0.45;
      railLine(b, [wA[0] + tx, wA[1], wA[2] + tz], [wB[0] + tx, wB[1], wB[2] + tz], {h: 1.0});
      railLine(b, [wA[0] - tx, wA[1], wA[2] - tz], [wB[0] - tx, wB[1], wB[2] - tz], {h: 1.0});
      roofFittings(b, cx, cz, r, yAt, rnd, smallTank ? 3 : 6);
      stairHead(b, cx, cz, r, h, aTop, 0.9);
    } else if (type === "dome") {
      var hc = +O.rise > 0 ? +O.rise : D.d * 0.12, cp = b.cap("body", "dome", cx, h, cz, r + 0.1, hc, seg);
      b.vcyl("detail", "rail", cx, h - 0.45, cz, r * 1.003 + 0.04, 0.45, {seg: seg, open: true});
      var NR = 5, nm = r > 20 ? 40 : 24, i2, j, ph0 = cp.th * 0.12;
      function dp(ph, a) { var sp = Math.sin(ph) * cp.R * 1.003; return [cx + sp * Math.cos(a), cp.yc + Math.cos(ph) * cp.R * 1.003 + 0.04, cz + sp * Math.sin(a)]; }
      for (i2 = 0; i2 <= NR; i2++) {
        var phr = ph0 + (cp.th - ph0) * i2 / NR, ring = [];
        for (j = 0; j < 96; j++) ring.push(dp(phr, TAU * j / 96));
        b.poly(ring, true);
      }
      for (j = 0; j < nm; j++) {
        var aj = TAU * j / nm, iTop = j % 2 ? 2 : 0;
        for (i2 = iTop; i2 < NR; i2++) b.seg(dp(ph0 + (cp.th - ph0) * i2 / NR, aj), dp(ph0 + (cp.th - ph0) * (i2 + 1) / NR, aj));
      }
      b.vcyl("detail", "metalDark", cx, cp.yc + cp.R - 0.25, cz, Math.max(1.2, r * 0.06), 0.6, {seg: 16});
      var nv = Math.max(6, Math.round(r / 3));
      for (var v = 0; v < nv; v++) {
        var av = TAU * (v + 0.5) / nv, pv = P3(cx, cz, r - 1.2, av, h + 0.15);
        b.boxB("detail", "metalDark", pv[0], pv[1], pv[2], 1.0, 0.7, 0.8, -av, false);
      }
      var hy = h + hc * 0.15, ph2 = P3(cx, cz, r * 0.8, aTop, 0);
      b.boxB("detail", "metalDark", ph2[0], cp.yc + Math.sqrt(cp.R * cp.R - (r * 0.8) * (r * 0.8)) - 0.2, ph2[2], 1.4, 0.6, 1.4, -aTop, false);
      stairHead(b, cx, cz, r, h, aTop, 0.9);
      arcRail(b, cx, cz, r - 0.4, h + 0.05, aTop - 8 / r, aTop + 8 / r, {});
      void hy;
    } else {
      var frac = +O.roof_level > 0 ? clamp(+O.roof_level, 0.12, 0.92) : (isSample(eq) ? 0.5 : 0.2 + 0.35 * rnd());
      var yd = Math.max(1.8, (h - 0.5) * frac + 0.5), rp = r - clamp(r * 0.03, 0.6, 1.4), pw = clamp(r * 0.1, 2.0, 4.0);
      b.vcyl("body", "roofDeck", cx, yd - 0.3, cz, rp, 0.3, {seg: seg});
      b.annulus("body", "metalDark", cx, cz, yd - 0.3, rp - pw, rp, 0, TAU, 0.95, true);
      b.annulus("body", "seal", cx, cz, yd + 0.35, rp - 0.05, r - 0.03, 0, TAU, 0.18, false);
      b.vcyl("body", "metalDark", cx, yd + 0.53, cz, rp + 0.02, 0.35, {seg: seg, open: true, rTop: rp + (r - rp) * 0.7});
      b.vcyl("detail", "metalDark", cx, yd + 0.65, cz, rp - pw - 0.6, 0.6, {seg: seg, open: true});
      b.ring(cx, yd + 0.66, cz, rp - pw, seg); b.ring(cx, yd, cz, rp - pw - 0.01, seg);
      var npc = Math.max(12, Math.round(r * 0.6));
      for (var q = 0; q < npc; q++) { var aq = TAU * q / npc; b.seg(P3(cx, cz, rp - pw, aq, yd + 0.67), P3(cx, cz, rp, aq, yd + 0.67)); }
      for (var dd = 0; dd < 5; dd++) {
        var rr2 = (rp - pw) * (0.15 + 0.7 * rnd()), ad = rnd() * TAU, pd = P3(cx, cz, rr2, ad, yd);
        b.boxB("detail", "metalDark", pd[0], yd, pd[2], 0.9, 0.5, 0.9, -ad, false);
      }
      b.vcyl("detail", "dark", cx, yd, cz, 0.9, 0.12, {seg: 12});
      var yg = h - 1.15, gw = clamp(r * 0.03, 0.9, 1.4), gA = 0.3 / (r + 1), gB = 3.0 / (r + 1), gap = gA;
      b.annulus("deck", "deck", cx, cz, yg - 0.2, r + 0.02, r + gw, aTop + gA, aTop + TAU - gB, 0.2, true);
      arcRail(b, cx, cz, r + gw - 0.05, yg, aTop + gA, aTop + TAU - gB, {step: r > 20 ? PI / 30 : PI / 18});
      var nbr = Math.max(8, Math.round(TAU * r / 7));
      for (var bk = 0; bk < nbr; bk++) {
        var ab = aTop + gA + (TAU - gA - gB) * (bk + 0.5) / nbr;
        b.bar("deck", "steel", P3(cx, cz, r, ab, yg - 1.2), P3(cx, cz, r + gw - 0.1, ab, yg - 0.22), 0.12);
      }
      b.vcyl("body", "metalDark", cx, h * 0.55, cz, r * 1.003 + 0.05, 0.3, {seg: seg, open: true});
      b.vcyl("body", "metalDark", cx, h - 0.25, cz, r * 1.003 + 0.06, 0.25, {seg: seg, open: true});
      var yp = h + 0.3, wpl = 2.4 / (r + 1);
      b.annulus("deck", "deck", cx, cz, yp - 0.2, r - 1.5, r + 1.4, aTop - wpl * 0.15, aTop + wpl, 0.2, true);
      arcRail(b, cx, cz, r + 1.35, yp, aTop - wpl * 0.15 + 0.01, aTop + wpl, {});
      railLine(b, P3(cx, cz, r - 1.45, aTop + wpl, yp), P3(cx, cz, r + 1.35, aTop + wpl, yp), {});
      var Lr = +O.ladder_l > 0 ? +O.ladder_l : h + 1.5, drop = yp - (yd + 0.95), run = Math.sqrt(Math.max(4, Lr * Lr - drop * drop));
      run = Math.min(run, rp - pw - 1.5 > 2 ? r - 1.2 - 2 : run);
      var aL = aTop + wpl * 0.45, L0 = P3(cx, cz, r - 1.2, aL, yp), L1 = P3(cx, cz, r - 1.2 - run, aL, yd + 0.95);
      var tX = -Math.sin(aL) * 0.6, tZ = Math.cos(aL) * 0.6;
      [-1, 1].forEach(function (s) {
        var A = [L0[0] + tX * s, L0[1], L0[2] + tZ * s], B = [L1[0] + tX * s, L1[1], L1[2] + tZ * s];
        b.bar("deck", "steel", A, B, 0.28);
        b.bar("deck", "rail", lift(A, 1.1), lift(B, 1.1), 0.1);
        b.bar("access", "rail", lift(A, 0.55), lift(B, 0.55), 0.07);
        for (var pp = 0; pp <= 8; pp++) { var pq = lerp3(A, B, pp / 8); b.bar("deck", "rail", pq, lift(pq, 1.1), 0.08); }
        b.cyl2("body", "seal", [B[0] - Math.cos(aL) * 0.4, yd + 0.95, B[2] - Math.sin(aL) * 0.4], [B[0] - Math.cos(aL) * 0.4 + tX * s * 0.4, yd + 0.95, B[2] - Math.sin(aL) * 0.4 + tZ * s * 0.4], 0.4, {seg: 12});
      });
      var Ll = Math.sqrt(run * run + drop * drop), nst = Math.max(4, Math.round(Ll / 0.3));
      for (var st = 1; st < nst; st++) { var ps = lerp3(L0, L1, st / nst); b.box("deck", "deck", ps[0], ps[1] + 0.02, ps[2], 0.28, 0.08, 1.2, -aL); }
      b.cyl2("body", "steel", [L0[0] - tX * 1.1, L0[1] - 0.1, L0[2] - tZ * 1.1], [L0[0] + tX * 1.1, L0[1] - 0.1, L0[2] + tZ * 1.1], 0.18, {seg: 8});
      var rwa = r - 2.6, rwb = Math.max(1.5, r - 1.2 - Lr - 0.5);
      [-1, 1].forEach(function (s) {
        b.bar("detail", "steel", [P3(cx, cz, rwa, aL, 0)[0] + tX * s, yd + 0.65, P3(cx, cz, rwa, aL, 0)[2] + tZ * s],
          [P3(cx, cz, rwb, aL, 0)[0] + tX * s, yd + 0.65, P3(cx, cz, rwb, aL, 0)[2] + tZ * s], 0.2);
      });
    }
    b.blob(cx, cz, D.d * 1.12 + 4, D.d * 1.12 + 4);
    return aTop;
  }
  reg("tank_cone", {dims: {d: 66, h: 18}, opts: {}}, "record: EQ-LAMU-TANK-FARM-013 diesel tanks, 19 x 66 m x 18 m, fixed cone roof",
    function (b, D, O, eq) { buildTank(b, 0, 0, D, O, eq, "cone"); });
  reg("tank_dome", {dims: {d: 57, h: 18}, opts: {}}, "record: EQ-LAMU-TANK-FARM-015 Jet A-1 tanks, 9 x 57 m x 18 m, internal floating roof under a fixed dome",
    function (b, D, O, eq) { buildTank(b, 0, 0, D, O, eq, "dome"); });
  reg("tank_floating", {dims: {d: 66, h: 18}, opts: {roof_level: 0.5}}, "record: EQ-LAMU-TANK-FARM-011 petrol tanks, 16 x 66 m x 18 m, external floating roof",
    function (b, D, O, eq) { buildTank(b, 0, 0, D, O, eq, "floating"); });
  reg("bund", {dims: {w: 385, d: 190, h: 1.83}, opts: {split: 2}}, "record: layout/site.yaml bund 1, 385 x 190 m inside a 1.83 m wall round 2 x 92 m crude tanks",
    function (b, D, O) {
      var w = D.w, d = D.d, h = D.h, t = +O.t > 0 ? +O.t : 0.6, i;
      b.slab("body", "gravel", -w / 2, -d / 2, w / 2, d / 2, 0, 0.25, null, false);
      b.boxB("body", "concrete", 0, 0, -d / 2 - t / 2, w + 2 * t, h, t, 0, true);
      b.boxB("body", "concrete", 0, 0, d / 2 + t / 2, w + 2 * t, h, t, 0, true);
      b.boxB("body", "concrete", -w / 2 - t / 2, 0, 0, t, h, d, 0, true);
      b.boxB("body", "concrete", w / 2 + t / 2, 0, 0, t, h, d, 0, true);
      var ns = clamp(Math.round(+O.split || 1), 1, 8);
      for (i = 1; i < ns; i++) b.boxB("body", "concrete", -w / 2 + w * i / ns, 0, 0, t * 0.8, h * 0.6, d, 0, true);
      function stile(x, zs) {
        var z0 = zs * (d / 2 + t + 0.1), run = (h + 0.25) / Math.tan(42 * PI / 180);
        b.flight([x, 0.05, z0 + zs * run], [x, h + 0.25, z0], 0.8);
        b.flight([x, 0.25, zs * (d / 2 - 0.1 - run)], [x, h + 0.25, zs * (d / 2 - 0.1)], 0.8);
        b.box("deck", "deck", x, h + 0.2, zs * (d / 2 + t / 2), 1.0, 0.1, t + 0.4, 0, false);
        railLine(b, [x - 0.5, h + 0.25, zs * (d / 2 - 0.1)], [x - 0.5, h + 0.25, z0], {});
        railLine(b, [x + 0.5, h + 0.25, zs * (d / 2 - 0.1)], [x + 0.5, h + 0.25, z0], {});
      }
      for (i = 0; i < ns; i++) { var xs = -w / 2 + w * (i + 0.5) / ns; stile(xs, 1); stile(xs + 6, -1); }
      b.boxB("detail", "dark", -w / 2 + 3, 0.25, -d / 2 + 3, 2.5, 0.08, 2.5, 0, false);
      b.boxB("detail", "concrete", -w / 2 - t - 1.5, 0, -d / 2 + 3, 2.4, 0.9, 2.4, 0, true);
      for (i = 0; i < 4; i++) b.cyl2("detail", "metalDark", [w / 2 - 2, 0.9, -d / 2 + 12 + i * 2.2], [w / 2 + t + 6, 0.9, -d / 2 + 12 + i * 2.2], 0.35, {});
    });
  function buildSphere(b, cx, cz, d, O, eq) {
    var r = d / 2, cl = clamp(d * 0.17, 2.5, 4.5), yc = cl + r, th0 = ladderTurn(eq) + 0.25, i, j;
    var nL = clamp(Math.round(+O.legs || (d > 18 ? 10 : d > 12 ? 8 : 6)), 4, 16), rl = r * 0.985, rL = clamp(d * 0.024, 0.3, 0.6);
    b.sphere("body", "tank", [cx, yc, cz], r, 48);
    var aOff = th0 + PI / nL;
    for (i = 0; i < nL; i++) {
      var a = aOff + TAU * i / nL, p = P3(cx, cz, rl, a, 0);
      b.boxB("body", "concrete", p[0], 0, p[2], rL * 2.8, 0.5, rL * 2.8, -a, true);
      b.vcyl("body", "white", p[0], 0.5, p[2], rL, yc + r * 0.06 - 0.5, {seg: 12});
      b.vcyl("body", "concrete", p[0], 0.5, p[2], rL * 1.12, Math.min(yc * 0.28, 4), {seg: 12});
      var a2 = a + TAU / nL, yb0 = 1.6, yb1 = yc - r * 0.38;
      b.bar("detail", "steel", P3(cx, cz, rl, a, yb0), P3(cx, cz, rl, a2, yb1), 0.16);
      b.bar("detail", "steel", P3(cx, cz, rl, a2, yb0), P3(cx, cz, rl, a, yb1), 0.16);
    }
    [-52, -22, 0, 22, 52].forEach(function (lat) {
      var la = lat * PI / 180;
      b.ring(cx, yc + r * Math.sin(la), cz, r * Math.cos(la) * 1.004, 64);
    });
    function mer(a, l0, l1) {
      var pts = [];
      for (var k = 0; k <= 6; k++) { var la = (l0 + (l1 - l0) * k / 6) * PI / 180; pts.push([cx + r * 1.004 * Math.cos(la) * Math.cos(a), yc + r * 1.004 * Math.sin(la), cz + r * 1.004 * Math.cos(la) * Math.sin(a)]); }
      b.poly(pts);
    }
    for (j = 0; j < 2 * nL; j++) mer(aOff + PI * j / nL, -22, 22);
    for (j = 0; j < nL; j++) { mer(aOff + TAU * (j + 0.5) / nL, 22, 52); mer(aOff + TAU * (j + 0.5) / nL, -52, -22); }
    var rp = clamp(r * 0.27, 2.0, 3.4), yP = yc + r + 0.35;
    b.vcyl("deck", "deck", cx, yP - 0.2, cz, rp, 0.2, {seg: 24, edge: true});
    arcRail(b, cx, cz, rp - 0.08, yP, 0, TAU, {});
    for (i = 0; i < 6; i++) {
      var ap = aOff + TAU * i / 6, rr = rp - 0.4;
      b.bar("deck", "steel", P3(cx, cz, rr, ap, yP - 0.2), P3(cx, cz, rr, ap, yc + Math.sqrt(r * r - rr * rr) - 0.1), 0.14);
    }
    [[0.9, 0.3], [-0.9, 0.3], [0, -1.0]].forEach(function (v) {
      b.vcyl("detail", "metalDark", cx + v[0], yP, cz + v[1], 0.28, 1.2, {seg: 10});
      b.vcyl("detail", "dark", cx + v[0], yP + 1.2, cz + v[1], 0.38, 0.35, {seg: 10});
    });
    b.vcyl("detail", "metalDark", cx, yP, cz, 0.55, 0.5, {seg: 12});
    var wf = 0.85, clr = 0.35, slope = Math.tan(38 * PI / 180), la0 = 45 * PI / 180;
    var yLand = yc + r * Math.sin(la0) + 0.3, rLand0 = r * Math.cos(la0) + clr + wf / 2, rTopE = rp + 0.1;
    var rLand = Math.max(rLand0, rTopE + (yP - yLand) / slope), y = yLand, rc = rLand, aa = 0, pts = [[rc, aa, y]];
    var yBot = yc + r * 0.12;
    while (y > yBot + 1e-6) {
      var y2 = Math.max(yBot, y - 0.22), u = y2 - yc, rs = Math.sqrt(Math.max(0, r * r - u * u)) + clr + wf / 2;
      var rc2 = Math.max(rc, rs), ds = (y - y2) / slope, dr = rc2 - rc, rem = ds * ds - dr * dr;
      aa -= rem > 0 ? Math.sqrt(rem) / ((rc + rc2) / 2) : 0;
      y = y2; rc = rc2; pts.push([rc, aa, y]);
    }
    var aBot = th0, shift = aBot - pts[pts.length - 1][1];
    var aL = pts[0][1] + shift, Lp = P3(cx, cz, rLand, aL, yLand);
    b.flight(P3(cx, cz, rLand - 0.7, aL, yLand), P3(cx, cz, rTopE, aL, yP), wf);
    b.annulus("deck", "deck", cx, cz, yLand - 0.2, rLand - 1.2, rLand + wf / 2 + 0.1, aL - 1.6 / rLand, aL + 0.9 / rLand, 0.2, true);
    b.bar("deck", "steel", P3(cx, cz, rLand - 0.4, aL, yLand - 0.2), P3(cx, cz, r * Math.cos(la0) - 0.1, aL, yLand - 1.4), 0.16);
    void Lp;
    var W = [], S0 = [], S1 = [];
    for (i = 0; i < pts.length; i++) {
      var q = pts[i], qa = q[1] + shift, c = P3(cx, cz, q[0], qa, q[2]);
      var nx = i + 1 < pts.length ? pts[i + 1] : pts[i - 1], na = nx[1] + shift, cn = P3(cx, cz, nx[0], na, nx[2]);
      var tx = cn[0] - c[0], tz = cn[2] - c[2], tl = Math.sqrt(tx * tx + tz * tz) || 1;
      if (i + 1 >= pts.length) { tx = -tx; tz = -tz; }
      var wx = -tz / tl, wz = tx / tl;
      W.push(c);
      S0.push([c[0] + wx * wf / 2, c[1], c[2] + wz * wf / 2]);
      S1.push([c[0] - wx * wf / 2, c[1], c[2] - wz * wf / 2]);
      if (i > 0 && i < pts.length - 1) b.box("access", "deck", c[0], c[1] - 0.03, c[2], wf, 0.05, 0.3, Math.atan2(-wz, wx));
    }
    for (i = 0; i + 1 < W.length; i += 2) {
      var i2 = Math.min(W.length - 1, i + 2);
      [S0, S1].forEach(function (S) {
        b.bar("deck", "steel", lift(S[i], -0.15), lift(S[i2], -0.15), 0.18);
        b.bar("access", "rail", lift(S[i], 1.0), lift(S[i2], 1.0), 0.07);
        b.bar("access", "rail", lift(S[i], 0.5), lift(S[i2], 0.5), 0.055);
        if (i % 8 === 0) b.bar("access", "rail", S[i], lift(S[i], 1.0), 0.07);
      });
      if (i % 10 === 4) {
        var cw = W[i], ang = Math.atan2(cw[2] - cz, cw[0] - cx), u2 = cw[1] - yc;
        b.bar("deck", "steel", P3(cx, cz, Math.sqrt(Math.max(0, r * r - u2 * u2)) - 0.1, ang, cw[1] - 0.6), lift(cw, -0.2), 0.13);
      }
    }
    var E = W[W.length - 1], aE = Math.atan2(E[2] - cz, E[0] - cx);
    var Rh = r + 0.55, rch = Rh + 0.12 + 0.45, spanH = (yBot / Math.tan(40 * PI / 180)) / rch, aH0 = aE - 0.12 - spanH;
    helixStair(b, cx, cz, Rh, 0, yBot, aH0, 1, {posts: true});
    b.annulus("deck", "deck", cx, cz, yBot - 0.2, r * 0.993 + 0.3, Rh + 1.25, aE - 0.14, aE + 0.07, 0.2, true);
    arcRail(b, cx, cz, Rh + 1.2, yBot, aE - 0.1, aE + 0.07, {});
    railLine(b, P3(cx, cz, r * 0.993 + 0.35, aE + 0.07, yBot), P3(cx, cz, Rh + 1.2, aE + 0.07, yBot), {});
    var ao = th0 + PI;
    b.pipe("body", "metalDark", [[cx, cl + 0.3, cz], [cx, 1.2, cz], P3(cx, cz, r + 4, ao, 1.2), P3(cx, cz, r + 4, ao, 0.6), P3(cx, cz, r + 9, ao, 0.6)], clamp(r * 0.03, 0.15, 0.4));
    var la2 = 58 * PI / 180, rsr = r * Math.cos(la2) + 0.12, ysr = yc + r * Math.sin(la2) + 0.1, sr = [];
    for (i = 0; i <= 24; i++) sr.push(P3(cx, cz, rsr, TAU * i / 24, ysr));
    for (i = 0; i < 24; i++) b.bar("detail", "metalDark", sr[i], sr[i + 1], 0.1);
    b.blob(cx, cz, d * 1.3 + 4, d * 1.3 + 4);
  }
  reg("sphere", {dims: {d: 21.2}}, "record: EQ-LAMU-TANK-FARM-021 LPG spheres, 15 x 21.2 m, 4,989 m3 each",
    function (b, D, O, eq) { buildSphere(b, 0, 0, D.d, O, eq); });
  function hVessel(b, mat, yc, zc, r, l, hrF, x0) {
    var hr = r * (hrF || 0.5), Ls = Math.max(0.5, l - 2 * hr), xa = (x0 || 0) - Ls / 2, xb = (x0 || 0) + Ls / 2, seg = segFor(r) + 8;
    b.cyl2("body", mat, [xa, yc, zc], [xb, yc, zc], r, {seg: seg, open: true});
    b.headDir("body", mat, [xb, yc, zc], [1, 0, 0], r, hr, seg);
    b.headDir("body", mat, [xa, yc, zc], [-1, 0, 0], r, hr, seg);
    b.ringDir([xa, yc, zc], [1, 0, 0], r * 1.003);
    b.ringDir([xb, yc, zc], [1, 0, 0], r * 1.003);
    var ns = Math.max(1, Math.round(Ls / 3));
    for (var i = 1; i < ns; i++) b.ringDir([xa + Ls * i / ns, yc, zc], [1, 0, 0], r * 1.003, 48);
    return {xa: xa, xb: xb, Ls: Ls, hr: hr};
  }
  function saddle(b, x, yc, zc, r) {
    var yb = yc - r, ph = Math.max(0.3, yb - r * 0.2);
    b.boxB("body", "concrete", x, 0, zc, 1.1, ph, r * 1.8 + 0.4, 0, true);
    b.boxB("body", "steel", x, ph, zc, 0.4, (yc - r * 0.4) - ph, r * 1.6, 0, true);
  }
  reg("bullet", {dims: {d: 4.5, l: 36}}, "rule: no bullets in the record; a typical 4.5 m x 36 m LPG bullet (about 520 m3)",
    function (b, D) {
      var d = D.d, l = D.l, r = d / 2, yc = clamp(d * 0.45, 1.6, 3.0) + r, V = hVessel(b, "tank", yc, 0, r, l, 1.0);
      saddle(b, -V.Ls * 0.32, yc, 0, r);
      saddle(b, V.Ls * 0.32, yc, 0, r);
      var yp = yc + r + 0.35, x0 = -V.Ls * 0.42, x1 = V.Ls * 0.05;
      b.platform(x0, -0.75, x1, 0.75, yp, "s");
      railLine(b, [x0, yp, 0.75], [x1 - 1.8, yp, 0.75], {});
      b.platform(x1 - 1.8, 0.75, x1, r + 1.3, yp, "e");
      [x1 - 0.2, x1 - 1.6].forEach(function (xq) { b.bar("deck", "steel", [xq, 0, r + 1.1], [xq, yp - 0.25, r + 1.1], 0.15); });
      for (var x = x0 + 0.5; x < x1; x += 4) [-0.6, 0.6].forEach(function (z) { b.bar("deck", "steel", [x, yp - 0.25, z], [x, yc + Math.sqrt(Math.max(0, r * r - z * z)) - 0.1, z], 0.12); });
      railLine(b, [x0, yp, -0.75], [x0, yp, 0.75], {});
      b.ladder(x1 - 0.9, r + 1.55, 0, yp + 1.1, 0, 1, 2.4);
      [[-0.3, 0.45], [-0.18, 0.45], [0.2, 0.3], [0.32, 0.25]].forEach(function (n, k) {
        var xn = V.Ls * n[0], rn = clamp(r * 0.1 * n[1] / 0.3, 0.12, 0.35), zn = k < 2 ? -1.15 : (k % 2 ? 0.3 : -0.3);
        b.nozzle("detail", [xn, yc + Math.sqrt(r * r - zn * zn) - 0.1, zn], [xn, yc + r + 0.7, zn], rn);
        if (k < 2) b.vcyl("detail", "metalDark", xn, yc + r + 0.7, zn, rn * 1.6, 0.9, {seg: 10});
      });
      b.pipe("body", "metalDark", [[V.xb * 0.6, yc - r + 0.1, 0], [V.xb * 0.6, 0.6, 0], [V.xb * 0.6, 0.6, r + 4]], clamp(r * 0.08, 0.12, 0.3));
      b.blob(0, 0, l + 4, d + 4, true);
    });
  function gFlame(bend, seed, ragged) {
    var k = "flm" + r2(bend) + "_" + seed + "_" + r2(ragged);
    if (GC[k]) return GC[k];
    var n = 14, m = 16, pos = [], idx = [], i, j, ph = seed * 1.7;
    for (i = 0; i <= n; i++) {
      var t = i / n, cx = bend * Math.pow(t, 1.7), y = t;
      var rr = Math.pow(1 - t, 0.75) * (0.62 + 0.55 * Math.sin(PI * Math.min(1, t * 1.6 + 0.12)));
      for (j = 0; j < m; j++) {
        var a = TAU * j / m, w = 1 + ragged * (0.2 * Math.sin(3 * a + 9 * t + ph) + 0.12 * Math.sin(5 * a - 14 * t + ph * 2));
        var lift = i === n ? 0 : ragged * 0.05 * Math.sin(4 * a + ph);
        pos.push(cx + rr * w * Math.cos(a), y + lift * (1 - t), rr * w * Math.sin(a) * 0.85);
      }
    }
    for (i = 0; i < n; i++) for (j = 0; j < m; j++) {
      var a0 = i * m + j, a1 = i * m + (j + 1) % m, b0 = a0 + m, b1 = a1 + m;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    var c0 = pos.length / 3;
    pos.push(0, -0.05, 0);
    for (j = 0; j < m; j++) idx.push(c0, j, (j + 1) % m);
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return (GC[k] = g);
  }
  function gArc(theta) {
    var k = "arc" + r2(theta);
    return GC[k] || (GC[k] = new T.CylinderGeometry(1, 1, 1, 24, 1, true, -theta / 2, theta));
  }
  reg("flare", {dims: {h: 140}, opts: {type: "derrick", tip_d: 1.99, sterile_r: 90}},
    "record: LY-LAMU-PLANT-202 HP flare 140 m on a derrick; EQ-LAMU-FLARE-003 tip 1.99 m; sterile area r 90 m (layout)",
    function (b, D, O, eq) {
      var h = D.h, type = O.type === "stack" ? "stack" : "derrick", rt = (+O.tip_d > 0 ? +O.tip_d : 1.99) / 2;
      var rr = rt, tipL = clamp(rt * 4.5, 3, 9), yTipB = h - tipL, th0 = ladderTurn(eq), i, k;
      var Rs = +O.sterile_r > 0 ? +O.sterile_r : clamp(h * 0.65, 40, 120);
      b.vcyl("body", "sterile", 0, 0, 0, Rs, 0.12, {seg: 96});
      arcRail(b, 0, 0, Rs, 0.12, 0, TAU, {h: 2.0, sp: 8, mat: "fence", layer: "detail", step: PI / 36, t: 0.06, noKnee: true});
      var yTop, wb = +O.base > 0 ? +O.base : (+D.w > 0 ? +D.w : (+D.d >= 5 ? +D.d : clamp(h * 0.1, 8, 30))), rb = rr * 1.9;
      var riserR = rr;
      if (type === "derrick") {
        var wt = clamp(rt * 3.4, 3.5, 7), yL = yTipB - 2.0, nl = Math.max(5, Math.round(yL / 10));
        var tl = clamp(h * 0.0045, 0.35, 0.8), tb = clamp(h * 0.002, 0.18, 0.34);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { b.boxB("body", "concrete", c[0] * wb / 2, 0, c[1] * wb / 2, 2.2, 0.9, 2.2, 0, true); });
        b.lattice(0, 0, 0.9, yL - 0.9, wb, wt, nl, {tl: tl, tb: tb});
        for (k = 2; k < nl; k += 2) {
          var yk = 0.9 + (yL - 0.9) * k / nl, wk = (wb + (wt - wb) * k / nl) / 2;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { b.bar("body", "steel", [c[0] * rr * 0.7, yk, c[1] * rr * 0.7], [c[0] * wk, yk, c[1] * wk], tb * 0.9); });
        }
        for (k = 3; k < nl - 1; k += 3) {
          var yr = 0.9 + (yL - 0.9) * k / nl;
          b.annulus("deck", "deck", 0, 0, yr - 0.2, rr + 0.1, rr + 1.6, th0 - 1.0, th0 + 1.0, 0.2, true);
          arcRail(b, 0, 0, rr + 1.55, yr, th0 - 1.0, th0 + 1.0, {});
        }
        b.platform(-wt / 2 - 0.9, -wt / 2 - 0.9, wt / 2 + 0.9, wt / 2 + 0.9, yL + 0.2, "nsew");
        b.vcyl("body", "metal", 0, 0.9, 0, rr, yTipB - 0.9, {seg: 16, edge: true});
        yTop = yL + 0.2;
      } else {
        var yT = h * 0.3;
        riserR = rb;
        b.vcyl("body", "concrete", 0, 0, 0, rb * 1.9, 1.2, {seg: 8, ry: PI / 8, edge: true});
        b.vcyl("body", "metal", 0, 1.2, 0, rb, yT - 1.2, {rTop: rr * 1.1, seg: 24, edge: true});
        b.vcyl("body", "metal", 0, yT, 0, rr * 1.1, yTipB - yT, {rTop: rr, seg: 20, edge: true});
        for (var ys = 12; ys < yTipB - 4; ys += 12) b.ring(0, ys, 0, (ys < yT ? rb + (rr * 1.1 - rb) * ys / yT : rr * 1.1) * 1.01, 32);
        var Rg = h * 0.55, ga = [th0 + PI / 3, th0 + PI, th0 + PI * 5 / 3];
        ga.forEach(function (a) {
          var pa = P3(0, 0, Rg, a, 0);
          b.boxB("body", "concrete", pa[0], 0, pa[2], 4.5, 1.6, 4.5, -a, true);
          b.boxB("body", "steel", pa[0], 1.6, pa[2], 1.2, 0.8, 0.6, -a, false);
        });
        [0.32, 0.62, 0.9].forEach(function (f) {
          var yg = yTipB * f, rg = rr * 1.1 + (rb - rr * 1.1) * Math.max(0, (yT - yg) / yT);
          b.annulus("deck", "deck", 0, 0, yg - 0.2, rg + 0.05, rg + 1.5, 0, TAU, 0.2, true);
          arcRail(b, 0, 0, rg + 1.45, yg, 0, TAU, {});
          b.vcyl("body", "steel", 0, yg - 0.9, 0, rg * 1.06 + 0.05, 0.7, {seg: 20});
          ga.forEach(function (a, j) {
            var A = P3(0, 0, rg + 0.25, a, yg - 0.6), B = P3(0, 0, Rg - 0.6 - j * 0.0, a + (f - 0.62) * 0.012, 2.2);
            b.bar("deck", "dark", A, B, clamp(h * 0.0016, 0.12, 0.26));
            b.seg(A, B);
          });
        });
        yTop = yTipB - 0.5;
        b.annulus("deck", "deck", 0, 0, yTop - 0.2, rr + 0.05, rr + 1.6, 0, TAU, 0.2, true);
        arcRail(b, 0, 0, rr + 1.55, yTop, 0, TAU, {});
      }
      var ladR = (type === "stack" ? rr * 1.1 : rr) + 0.45;
      b.ladder(ladR * Math.cos(th0), ladR * Math.sin(th0), type === "stack" ? 1.2 : 0.9, yTop + 1.1, Math.cos(th0), Math.sin(th0), 2.6);
      var rtb = rt * 1.25;
      b.vcyl("body", "metalDark", 0, yTipB - 0.6, 0, rr * 1.12, 0.6, {rTop: rtb, seg: 20});
      b.vcyl("body", "metalDark", 0, yTipB, 0, rtb, tipL - 0.9, {seg: 20, edge: true});
      b.vcyl("body", "dark", 0, h - 0.9, 0, rtb * 1.03, 0.9, {seg: 20});
      b.vcyl("body", "dark", 0, yTipB + 0.5, 0, rtb * 1.32, 0.45, {seg: 20});
      b.vcyl("body", "dark", 0, h - 2.6, 0, rtb * 1.32, 0.3, {seg: 20});
      var wa = th0 + PI;
      b.put("body", "darkDS", gArc(PI * 1.1), mTRS(0, h - 1.15, 0, rtb * 1.5, 2.6, rtb * 1.5, -wa + PI / 2));
      for (i = 0; i < 3; i++) {
        var ap = th0 + PI / 2 + TAU * i / 3, P0 = P3(0, 0, rtb * 1.32 + 0.25, ap, yTipB - 6), P1 = P3(0, 0, rtb * 1.32 + 0.25, ap, h + 0.6);
        b.cyl2("body", "metalDark", P0, P1, 0.13, {seg: 6});
        b.vcyl("body", "dark", P1[0], h + 0.4, P1[2], 0.28, 0.8, {seg: 8});
        b.vcyl("body", "flameCore", P1[0], h + 1.2, P1[2], 0.3, 1.1, {rTop: 0.02, seg: 8});
      }
      var fh = clamp(h * 0.12, 9, 20), fr = Math.max(rtb * 1.6, fh * 0.16), bend = 0.42 * fh / fr;
      b.put("body", "flameOut", gFlame(bend, 1, 1), mTRS(0, h - 0.4, 0, fr, fh, fr, -th0));
      b.put("body", "flameCore", gFlame(bend * 0.62, 2, 0.6), mTRS(0, h - 0.3, 0, fr * 0.55, fh * 0.6, fr * 0.55, -th0));
      var kd = +O.ko_d > 0 ? +O.ko_d : clamp(h * 0.035, 3, 6.3), kl = +O.ko_l > 0 ? +O.ko_l : kd * 3.2, kr = kd / 2;
      var kx1 = -(type === "derrick" ? wb / 2 + 5 : riserR * 2 + 7), kx0 = kx1 - kl, kz = -(kr + 5), kyc = kr + 1.4, kxm = (kx0 + kx1) / 2;
      var V = hVessel(b, "metal", kyc, kz, kr, kl, 0.5, kxm);
      saddle(b, kxm - V.Ls * 0.3, kyc, kz, kr);
      saddle(b, kxm + V.Ls * 0.3, kyc, kz, kr);
      b.blob(kxm, kz, kl + 3, kd + 3, true);
      var rh = clamp(rr * 0.75, 0.4, 1.0), yo = kyc + kr + rh + 0.8;
      b.pipe("body", "metalDark", [[kx1 - kr * 0.6, kyc + kr - 0.2, kz], [kx1 - kr * 0.6, yo, kz], [-riserR - 0.4, yo, kz], [-riserR - 0.4, yo, 0], [-0.2, yo, 0]], rh);
      b.pipe("body", "metalDark", [[-Rs - 4, 1.3 + rh, kz], [kx0 - 2.5, 1.3 + rh, kz], [kx0 - 2.5, kyc, kz], [kx0 + kr * 0.3, kyc, kz]], rh);
      b.pipe("body", "metal", [[kxm, kyc - kr + 0.2, kz], [kxm, 0.7, kz], [kxm, 0.7, kz - kr - 3]], 0.25);
      for (var xsl = -Rs; xsl < kx0 - 6; xsl += 8) b.boxB("detail", "concrete", xsl, 0, kz, 0.6, 1.3, 2.2, 0, false);
      b.platform(kx0 + V.Ls * 0.2, kz - 0.9, kx0 + V.Ls * 0.2 + 3.2, kz + 0.9, kyc + kr + 0.3, "nsew");
      b.ladder(kx0 + V.Ls * 0.2 + 1.6, kz - 1.2, 0, kyc + kr + 1.4, 0, -1, 2.4);
      b.blob(0, 0, riserR * 6 + 6, riserR * 6 + 6);
    });
  function buildChimney(b, cx, cz, d, h, eq, o) {
    o = o || {};
    var rb = d / 2, rt = d / 2 * 0.8, th0 = ladderTurn(eq) - 0.3, seg = 32, i;
    function rAt(y) { return rb + (rt - rb) * y / h; }
    b.vcyl("body", "concrete", cx, 0, cz, rb * 1.45, 1.2, {seg: 8, ry: PI / 8, edge: true});
    var yB0 = h * 0.7, nb = 5, bh = (h - yB0) / nb;
    b.vcyl("body", "chim", cx, 1.2, cz, rAt(1.2), yB0 - 1.2, {rTop: rAt(yB0), seg: seg, edge: false});
    for (i = 0; i < nb; i++) {
      var y0 = yB0 + bh * i;
      b.vcyl("body", i % 2 ? "white" : "stackBand", cx, y0, cz, rAt(y0), bh, {rTop: rAt(y0 + bh), seg: seg, open: true});
      b.ring(cx, y0, cz, rAt(y0) * 1.004, 48);
    }
    b.vcyl("body", "dark", cx, h - 1.0, cz, rt * 1.03, 1.2, {seg: seg});
    b.vcyl("body", "dark", cx, h - 0.4, cz, rt * 0.92, 0.6, {seg: seg, open: true});
    for (var y = 6; y < yB0; y += 6) b.ring(cx, y, cz, rAt(y) * 1.003, 48);
    var lv = [h * 0.36, h * 0.68, h - 2.5];
    lv.forEach(function (yl) {
      var rr = rAt(yl);
      b.annulus("deck", "deck", cx, cz, yl - 0.2, rr + 0.05, rr + 1.4, 0, TAU, 0.2, true);
      arcRail(b, cx, cz, rr + 1.35, yl, 0, TAU, {});
      for (var k = 0; k < 4; k++) { var pa = P3(cx, cz, rr + 0.6, th0 + PI / 4 + k * PI / 2, yl); b.boxB("detail", "stackBand", pa[0], yl, pa[2], 0.4, 0.5, 0.4); }
      for (var j = 0; j < 8; j++) { var aj = TAU * j / 8; b.bar("deck", "steel", P3(cx, cz, rr, aj, yl - 1.2), P3(cx, cz, rr + 1.3, aj, yl - 0.22), 0.12); }
    });
    var lr = rb + 0.45;
    b.ladder(cx + lr * Math.cos(th0), cz + lr * Math.sin(th0), 1.2, h - 2.5 + 1.1, Math.cos(th0), Math.sin(th0), 3.4);
    var pd = P3(cx, cz, rb * 1.0, th0 + 0.5, 1.2);
    b.boxB("detail", "dark", pd[0], 1.2, pd[2], 0.3, 2.4, 1.4, -(th0 + 0.5));
    if (o.inlet !== false) {
      var ai = o.inletA != null ? o.inletA : PI, di = clamp(d * 0.55, 2, 6), pi0 = P3(cx, cz, rb * 0.6, ai, 0), pi1 = P3(cx, cz, rb + 6, ai, 0);
      b.boxAB("body", "metalDark", [pi0[0], 4 + di / 2, pi0[2]], [pi1[0], 4 + di / 2, pi1[2]], di, di * 0.8, true);
    }
    b.blob(cx, cz, d * 2 + 6, d * 2 + 6);
  }
  reg("chimney", {dims: {d: 8, h: 120}}, "record: layout/site.yaml shared flue-gas stack, Phase 1 power, 8 m x 8 m, 120 m (height an ASSUMPTION in the record)",
    function (b, D, O, eq) { buildChimney(b, 0, 0, D.d, D.h, eq, {inlet: O.inlet}); });
  reg("cfb_boiler", {dims: {w: 60, d: 45, h: 60}, opts: {cyclones: 3, baghouse: true}},
    "record: layout petcoke-cfb-power, boiler island 60 x 45 x 60 m; fabric-filter block 40 x 25 x 30 m per boiler",
    function (b, D, O, eq) {
      var W = D.w, Dd = D.d, H = D.h, i, k, th0 = ladderTurn(eq), solo = b.ctx && b.ctx.solo && b.ctx.solo === eq.id;
      var fW = clamp(W * 0.22, 8, 16), xF0 = -W / 2 + 6, xF1 = xF0 + fW, zF = Dd * 0.3, yW = 6, yLo = yW + clamp(H * 0.16, 5, 11), yFt = H * 0.93;
      b.boxB("body", "concrete", 0, 0, 0, W + 2, 0.5, Dd + 2, 0, true);
      b.boxB("body", "metalDark", (xF0 + xF1) / 2, 0.5, 0, fW * 0.8, yW - 0.5 - 1.5, 2 * zF * 0.8, 0, true);
      b.frustum("body", "clad", (xF0 + xF1) / 2, yW - 1.5, 0, fW * 0.8, 2 * zF * 0.8, fW, 2 * zF, 1.5, true);
      b.frustum("body", "clad", (xF0 + xF1) / 2, yW, 0, fW * 0.75, 2 * zF, fW, 2 * zF, yLo - yW, true);
      b.boxB("body", "furnace", (xF0 + xF1) / 2, yLo, 0, fW, yFt - yLo, 2 * zF, 0, true);
      for (var xt = xF0 + 1.5; xt < xF1 - 0.5; xt += 1.5) [-1, 1].forEach(function (s) { b.seg([xt, yLo, s * (zF + 0.02)], [xt, yFt, s * (zF + 0.02)]); });
      for (var zt = -zF + 1.5; zt < zF - 0.5; zt += 1.5) b.seg([xF0 - 0.02, yLo, zt], [xF0 - 0.02, yFt, zt]);
      for (var yb = yLo + 5; yb < yFt - 1; yb += 5) {
        [-1, 1].forEach(function (s) { b.box("body", "steel", (xF0 + xF1) / 2, yb, s * (zF + 0.25), fW + 0.8, 0.5, 0.4); });
        b.box("body", "steel", xF0 - 0.25, yb, 0, 0.4, 0.5, 2 * zF + 0.8);
        b.box("body", "steel", xF1 + 0.25, yb, 0, 0.4, 0.5, 2 * zF + 0.8);
      }
      b.boxAB("body", "metalDark", [xF0 - 8, 3.0, zF * 0.5], [xF0 + 1, 3.0, zF * 0.5], 3.0, 3.5, true);
      [-1, 1].forEach(function (s) { b.boxAB("body", "metalDark", [xF0 - 1.2, yLo - 2, s * (zF + 1.2)], [xF1 + 1.2, yLo - 2, s * (zF + 1.2)], 1.6, 1.6, true); });
      var xBk = xF0 - 5.5, yBk = H * 0.45;
      [-zF * 0.5, zF * 0.5].forEach(function (z) {
        b.boxB("body", "clad", xBk, yBk, z, 7, H * 0.18, 7, 0, true);
        b.frustum("body", "clad", xBk, yBk - 6, z, 1.6, 1.6, 7, 7, 6, true);
        b.pipe("body", "metalDark", [[xBk, yBk - 6, z], [xBk, yLo + 2, z], [xF0 - 0.2, yLo - 1, z]], 0.6);
      });
      b.boxB("body", "clad", xBk, yBk + H * 0.18, 0, 8, 3.2, 2 * zF, 0, true);
      (function () {
        var gw = 4, gh = 3, yG1 = yBk + H * 0.18 + 0.2, tX = xBk - 52, tZ = -zF - 12, yT0 = 15;
        var gA = [tX + 4.0, yT0, tZ], gB = [xBk - 3.8, yG1, -zF * 0.3];
        function up(p, dy) { return [p[0], p[1] + dy, p[2]]; }
        b.boxAB("body", "steel", up(gA, 0.2), up(gB, 0.2), 0.5, gw + 0.4, true);
        b.boxAB("body", "clad", up(gA, 0.45 + gh / 2), up(gB, 0.45 + gh / 2), gh, gw, true);
        b.boxAB("body", "metalDark", up(gA, 0.57 + gh), up(gB, 0.57 + gh), 0.25, gw + 0.5, false);
        [0.22, 0.5, 0.78].forEach(function (f) {
          var p = [gA[0] + (gB[0] - gA[0]) * f, gA[1] + (gB[1] - gA[1]) * f, gA[2] + (gB[2] - gA[2]) * f], wbt = clamp(p[1] * 0.2, 4, 8);
          b.lattice(p[0], p[2], 0, p[1], wbt, gw + 0.6, Math.max(2, Math.round(p[1] / 6)), {tl: 0.45, tb: 0.2});
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { b.boxB("detail", "concrete", p[0] + c[0] * wbt / 2, 0, p[2] + c[1] * wbt / 2, 1.2, 0.5, 1.2); });
        });
        b.lattice(tX, tZ, 0, yT0 - 0.5, 7, 7, 3, {tl: 0.5, tb: 0.22});
        b.boxB("body", "clad", tX, yT0 - 0.5, tZ, 8.5, gh + 3, 8.5, 0, true);
        b.ladder(tX - 4.1, tZ - 2, 0, yT0 + 1.0, -1, 0, 2.4);
        var sX = tX - 1, sZ = tZ + 17, sR = 7, ySk = 7, ySt = 36;
        b.vcyl("body", "concrete", sX, 0, sZ, sR + 0.6, 0.6, {seg: 8, ry: PI / 8, edge: true});
        for (var q = 0; q < 8; q++) { var pq = P3(sX, sZ, sR - 0.6, q * PI / 4 + PI / 8, 0); b.boxB("body", "concrete", pq[0], 0.6, pq[2], 1.2, ySk - 0.6, 1.2); }
        b.vcyl("body", "concrete", sX, ySk, sZ, sR, ySt - ySk, {seg: 32, edge: true});
        b.vcyl("body", "metalDark", sX, ySk - 3.5, sZ, 1.0, 3.5, {rTop: sR * 0.8, seg: 24});
        for (var yr = ySk + 6; yr < ySt; yr += 6) b.ring(sX, yr, sZ, sR * 1.004, 48);
        b.cap("body", "concrete", sX, ySt, sZ, sR, 1.6, 32);
        b.boxB("body", "clad", sX, ySt + 1.0, sZ, 5, 3.2, 4, 0, true);
        b.boxAB("body", "clad", [sX, 2.2, sZ - 1.5], [tX, 2.2, tZ + 3.5], 2.4, 2.6, true);
        b.boxAB("body", "clad", [sX, ySt + 2.6, sZ - 2.0], [tX, yT0 + gh / 2 + 1.0, tZ + 4.2], 2.6, 3.0, true);
        b.blob(sX, sZ, 2 * sR + 4, 2 * sR + 4);
        b.blob((tX + gB[0]) / 2, (tZ + gB[2]) / 2, Math.abs(gB[0] - tX) + 10, 12, true);
      })();
      var nc = clamp(Math.round(+O.cyclones || (Dd > 50 ? 3 : 2)), 1, 4), rc = clamp(Math.min(2 * zF / nc * 0.46, Dd * 0.13), 3, 7);
      var xc = xF1 + rc + 3.5, yc0 = H * 0.56, yc1 = H * 0.86, ycB = H * 0.3, zs = [];
      var zc0 = Math.max(zF - rc * 0.6, rc + 1.5);
      for (i = 0; i < nc; i++) zs.push(nc === 1 ? 0 : -zc0 + 2 * zc0 * i / (nc - 1));
      var stg = nc === 2 ? 2 * rc - 1.0 : 0, xcs = zs.map(function (z, j) { return xc + (j === nc - 1 ? stg : 0); }), xcM = xc + stg;
      var xP0 = xcM + rc + (stg ? 2.5 : 4), wP = clamp(W * 0.17, 7, 12), xP1 = xP0 + wP, zP = zF * 0.85, xPm = (xP0 + xP1) / 2;
      var yOut = yc1 + 3.6;
      zs.forEach(function (z, ic) {
        var xc = xcs[ic];
        b.vcyl("body", "clad", xc, yc0, z, rc, yc1 - yc0, {seg: 32, edge: true});
        b.vcyl("body", "clad", xc, ycB, z, 1.2, yc0 - ycB, {rTop: rc, seg: 32, edge: true});
        b.vcyl("body", "dark", xc, yc1, z, rc * 1.02, 0.5, {seg: 32});
        b.head("body", "clad", xc, yc1 + 0.5, z, rc * 1.02, rc * 0.18, false, 32);
        b.ring(xc, yc0, z, rc * 1.004);
        for (var yr = yc0 + 4; yr < yc1 - 1; yr += 4) b.ring(xc, yr, z, rc * 1.005, 48);
        var yIn = yc1 - 4.0, zIn = z + rc * 0.55;
        b.boxAB("body", "duct", [xF1 - 0.3, yIn, zIn], [xc - rc * 0.1, yIn, zIn], 7.0, Math.min(3.6, rc * 0.8), true);
        b.boxAB("body", "seal", [xF1 + 0.6, yIn, zIn], [xF1 + 1.2, yIn, zIn], 7.4, Math.min(3.6, rc * 0.8) + 0.4, false);
        for (var yr2 = ycB + 3; yr2 < yc0 - 1; yr2 += 3) b.ring(xc, yr2, z, (1.2 + (rc - 1.2) * (yr2 - ycB) / (yc0 - ycB)) * 1.01, 40);
        b.vcyl("body", "metalDark", xc, yc1 + 0.5, z, rc * 0.42, yOut - yc1 + 1.5, {seg: 20, edge: true});
        b.boxAB("body", "duct", [xc, yOut + 1.2, z], [xPm, yOut + 1.2, z * 0.6], 3.4, Math.min(3.4, rc * 0.75), true);
        var ySeal = yLo - 1.0;
        b.vcyl("body", "duct", xc, ySeal + 2.8, z, 1.1, ycB - ySeal - 2.8, {seg: 16, edge: true});
        b.vcyl("body", "seal", xc, ycB - 2.2, z, 1.3, 0.6, {seg: 16});
        b.boxB("body", "duct", xc - 0.6, ySeal, z, 3.6, 3.4, 3.2, 0, true);
        b.cyl2("body", "duct", [xc - 2.2, ySeal + 1.4, z], [xF1 + 0.2, ySeal + 0.2, z], 1.0, {seg: 16, edge: true});
        b.cyl2("body", "seal", [xc - 3.4, ySeal + 1.2, z], [xc - 3.9, ySeal + 1.1, z], 1.2, {seg: 16});
        b.boxB("detail", "steel", xc, 0.5, z, 0.8, ySeal - 0.5, 0.8);
      });
      var sx0 = xF0 - 1.5, sxF = xF1 + 1.5, sx1 = xcM + rc + 1.8, sz = zF + 2.2, yR = H;
      [sx0, (sx0 + sxF) / 2, sxF, sx1].forEach(function (x) { [-1, 1].forEach(function (s) { b.boxB("body", "steel", x, 0.5, s * sz, 0.7, yR - 0.5, 0.7); }); });
      [sx0, sxF].forEach(function (x) { b.boxB("body", "steel", x, 0.5, 0, 0.7, yR - 0.5, 0.7); });
      for (var yl = 10; yl < yR; yl += 10) {
        [-1, 1].forEach(function (s) { b.box("body", "steel", (sx0 + sxF) / 2, yl, s * sz, sxF - sx0, 0.6, 0.45); });
        [sx0, sxF].forEach(function (x) { b.box("body", "steel", x, yl, 0, 0.45, 0.6, 2 * sz); });
      }
      [-1, 1].forEach(function (s) {
        [[sx0, (sx0 + sxF) / 2], [(sx0 + sxF) / 2, sxF]].forEach(function (xx) {
          for (var yq = 0; yq + 10 <= 20; yq += 10) {
            b.bar("body", "steel", [xx[0], yq + 0.5, s * sz], [xx[1], yq + 10, s * sz], 0.35);
            b.bar("body", "steel", [xx[1], yq + 0.5, s * sz], [xx[0], yq + 10, s * sz], 0.35);
          }
        });
        [yc0 - 0.9, yc1 - 0.1, yR - 0.4].forEach(function (y) { b.box("body", "steel", (sxF + sx1) / 2, y, s * sz, sx1 - sxF, 0.6, 0.45); });
      });
      [yc0 - 0.9, yc1 - 0.1].forEach(function (y) { b.box("body", "steel", sx1, y, 0, 0.45, 0.6, 2 * sz); });
      b.slab("body", "clad", sx0 - 0.5, -sz - 0.5, sxF + 0.5, sz + 0.5, yR, 0.6, null, true);
      b.boxB("body", "clad", (xF0 + xF1) / 2, yR + 0.6, 0, fW + 4, 4.0, 2 * zF * 0.7, 0, true);
      b.cyl2("body", "metal", [xF0 + 1, yR - 2.2, 0], [xF1 - 1, yR - 2.2, 0], 1.0, {seg: 16});
      [yc0 - 0.4, yc1 + 0.4].forEach(function (y) {
        b.slab("deck", "deck", xF1 + 0.5, -sz, sx1, sz, y - 0.25, 0.25, zs.map(function (z, j) { return [xcs[j], z, (y > yc1 ? rc * 0.45 : rc) + 0.25]; }), true);
        b.railRect(xF1 + 0.7, -sz + 0.2, sx1 - 0.2, sz - 0.2, y, "nse");
      });
      var yP0 = H * 0.3, yP1 = yOut + 2.9;
      b.boxB("body", "metal", xPm, yP0, 0, wP, yP1 - yP0, 2 * zP, 0, true);
      for (var yb2 = yP0 + 5; yb2 < yP1 - 1; yb2 += 5) {
        [-1, 1].forEach(function (s) { b.box("body", "steel", xPm, yb2, s * (zP + 0.2), wP + 0.6, 0.45, 0.35); });
        [xP0 - 0.2, xP1 + 0.2].forEach(function (x) { b.box("body", "steel", x, yb2, 0, 0.35, 0.45, 2 * zP + 0.6); });
      }
      for (var xb3 = xP0 + 2; xb3 < xP1 - 1; xb3 += 2) b.seg([xb3, yP0 + 0.3, -zP - 0.03], [xb3, yP1 - 0.3, -zP - 0.03]);
      b.frustum("body", "metalDark", xPm, yP0 - 5, 0, wP * 0.4, zP * 0.6, wP, 2 * zP, 5, true);
      var yAH = H * 0.2;
      b.boxB("body", "metalDark", xPm, 4.0, 0, wP * 1.1, yAH - 4.0, zP * 1.7, 0, true);
      b.boxAB("body", "metalDark", [xPm, yAH, 0], [xPm, yP0 - 5, 0], 2.5, 3.0, false);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { b.boxB("body", "steel", xPm + c[0] * (wP / 2 + 0.4), 0.5, c[1] * (zP + 0.4), 0.7, yP1 - 0.5, 0.7); });
      b.railRect(xP0 + 0.2, -zP + 0.2, xP1 - 0.2, zP - 0.2, yP1, "nsew");
      var ySt = yc1 + 0.4;
      b.stairTower(xc, sz + 2.6, 0.5, ySt, 0, {wf: 1.1, rise: 4.0});
      b.boxB("body", "metalDark", xF1 + 2.0, 0.5, -zF * 0.5, 3.5, 3.0, 4, 0, true);
      b.boxB("body", "metalDark", xF1 + 2.0, 0.5, zF * 0.5, 3.5, 3.0, 4, 0, true);
      var bagOn = (O.baghouse !== false) || solo, xB0 = Math.max(W / 2 + 10, xP1 + 16), bwX = clamp(W * 0.42, 15, 30), bwZ = Math.min(Dd * 0.9, 40), bh = clamp(H * 0.5, 18, 32);
      var yD = 9;
      if (bagOn) {
        var yFl = 19, xRi = xP1 + 5.0;
        b.boxAB("body", "duct", [xP1 + 0.3, yAH - 3.0, 0], [xRi + 3.0, yAH - 3.0, 0], 6.0, 6.0, true);
        b.boxAB("body", "duct", [xRi, yAH - 6.0, 0], [xRi, yFl + 3.0, 0], 6.0, 6.0, true);
        b.boxAB("body", "duct", [xRi - 3.0, yFl, 0], [xB0 - 1.5, yFl, 0], 6.0, 6.0, true);
        b.boxAB("body", "duct", [xB0 - 1.6, yFl, -bwZ * 0.42], [xB0 - 1.6, yFl, bwZ * 0.42], 5.0, 3.4, true);
        [xRi + 4.5, xB0 - 4.5].forEach(function (xj) { b.boxAB("body", "seal", [xj - 0.35, yFl, 0], [xj + 0.35, yFl, 0], 6.5, 6.5, false); });
        b.boxAB("body", "seal", [xRi, yAH + 3.0, 0], [xRi, yAH + 3.7, 0], 6.5, 6.5, false);
        for (var xs4 = xRi + 7; xs4 < xB0 - 4; xs4 += 8) {
          [-2.2, 2.2].forEach(function (zq) { b.boxB("body", "steel", xs4, 0, zq, 0.6, yFl - 3.0, 0.6); });
          b.box("body", "steel", xs4, yFl - 3.2, 0, 0.6, 0.5, 6.4);
        }
        var xB1 = xB0 + bwX, xBm = (xB0 + xB1) / 2, yH0 = 4.5, yH1 = 12, nhx = 2, nhz = clamp(Math.round(bwZ / 9), 2, 6);
        for (i = 0; i < nhx; i++) for (k = 0; k < nhz; k++) {
          var hx = xB0 + bwX * (i + 0.5) / nhx, hz = -bwZ / 2 + bwZ * (k + 0.5) / nhz;
          b.frustum("body", "metalDark", hx, yH0, hz, 1.4, 1.4, bwX / nhx - 0.2, bwZ / nhz - 0.2, yH1 - yH0, true);
        }
        for (i = 0; i <= nhx; i++) for (k = 0; k <= nhz; k += Math.max(1, nhz >> 1)) b.boxB("body", "steel", xB0 + bwX * i / nhx, 0, -bwZ / 2 + bwZ * k / nhz, 0.6, yH1, 0.6);
        b.boxB("body", "clad", xBm, yH1, 0, bwX, bh - yH1 - 3.5, bwZ, 0, true);
        b.boxB("body", "clad", xBm, bh - 3.5, 0, bwX * 0.9, 3.5, bwZ * 0.94, 0, true);
        for (k = 0; k <= nhz; k++) {
          var zk = -bwZ / 2 + bwZ * k / nhz;
          b.boxB("body", "steel", xB0 - 0.15, yH1, zk, 0.3, bh - 3.5 - yH1, 0.35);
          b.boxB("body", "steel", xB1 + 0.15, yH1, zk, 0.3, bh - 3.5 - yH1, 0.35);
        }
        for (var xk = xB0 + 3; xk < xB1 - 1; xk += 3) [-1, 1].forEach(function (s) { b.boxB("body", "steel", xk, yH1, s * (bwZ / 2 + 0.15), 0.35, bh - 3.5 - yH1, 0.3); });
        for (k = 0; k < nhz; k++) {
          var zr3 = -bwZ / 2 + bwZ * (k + 0.5) / nhz;
          b.boxB("body", "metalDark", xBm, bh, zr3, bwX * 0.86, 1.4, bwZ / nhz - 1.4, 0, true);
          for (var pj = 0; pj < 4; pj++) b.vcyl("detail", "dark", xB0 + bwX * (0.2 + 0.2 * pj), bh + 1.4, zr3, 0.35, 0.5, {seg: 8});
        }
        b.railRect(xBm - bwX * 0.45 + 0.2, -bwZ * 0.47 + 0.2, xBm + bwX * 0.45 - 0.2, bwZ * 0.47 - 0.2, bh, "nsew");
        b.platform(xB0 - 1.6, -bwZ / 2, xB0, bwZ / 2, yH1, "w");
        b.ladder(xB0 - 0.8, -bwZ / 2 - 0.5, 0, yH1 + 1.1, 0, -1, 2.4);
        var xF = xB1 + 5;
        b.boxAB("body", "duct", [xB1 - 2, bh - 1.8, 0], [xF + 2.0, bh - 1.8, 0], 3.6, 4.0, true);
        b.boxAB("body", "duct", [xF, bh - 0.2, 0], [xF, 4.5, 0], 4.0, 4.0, true);
        [-4.5, 4.5].forEach(function (z) {
          b.cyl2("body", "metal", [xF + 3, 3.4, z - 1.2], [xF + 3, 3.4, z + 1.2], 2.9, {seg: 24, edge: true});
          b.boxB("body", "metalDark", xF + 3, 0, z + (z > 0 ? 3.6 : -3.6), 2.4, 2.2, 2.6, 0, true);
          b.boxB("body", "concrete", xF + 3, 0, z, 6.5, 0.5, 3.2, 0, true);
          b.boxAB("body", "metalDark", [xF, 3.4, z * 0.6], [xF + 1.5, 3.4, z], 2.6, 2.4, false);
        });
        var xS = xF + 13;
        if (solo) {
          b.boxAB("body", "duct", [xF + 5.5, 1.5, 0], [xF + 5.5, 15.2, 0], 5.5, 5.5, true);
          b.boxAB("body", "duct", [xF + 2.8, 12.5, 0], [xS - 2.0, 12.5, 0], 5.5, 5.5, true);
          b.boxAB("body", "seal", [xF + 8.5, 12.5, 0], [xF + 9.2, 12.5, 0], 6.0, 6.0, false);
        } else b.boxAB("body", "duct", [xF + 5.5, 4.0, 0], [xF + 16, 4.0, 0], 5.0, 5.0, true);
        b.boxAB("body", "duct", [xF + 5.5, 4.0, -4.5], [xF + 5.5, 4.0, 4.5], 4.0, 3.0, false);
        b.blob(xBm + 6, 0, bwX + 22, bwZ + 6, true);
        if (solo) buildChimney(b, xS, 0, 8, 120, eq, {inlet: false});
      } else {
        b.boxAB("body", "duct", [xP1 - 1, yD, 0], [W / 2 + 2, yD, 0], 4.5, 5.0, true);
      }
      b.blob(0, 0, W + 8, Dd + 8, true);
      void th0;
    });
  reg("coke_dome", {dims: {d: 100, h: 25}, opts: {l: 150}},
    "record: LY-LAMU-PLANT-262 covered coke store 150 x 100 m (25 m high per the earlier layout box); dome form after the Hovensa coke domes",
    function (b, D, O) {
      var d = D.d, h = D.h, R = d / 2, L = +O.l > d ? +O.l : 0, xm = L ? (L - d) / 2 : 0, i;
      b.vcyl("body", "concrete", -xm, 0, 0, R + 0.4, 1.8, {seg: 64, edge: false});
      if (L) {
        b.vcyl("body", "concrete", xm, 0, 0, R + 0.4, 1.8, {seg: 64});
        b.boxB("body", "concrete", 0, 0, 0, 2 * xm, 1.8, d + 0.8, 0, false);
        b.ellip("body", "dome", xm, 1.8, 0, R, h - 1.8, R, PI / 2, PI, 0, PI / 2, 48, 0);
        b.ellip("body", "dome", -xm, 1.8, 0, R, h - 1.8, R, -PI / 2, PI, 0, PI / 2, 48, 0);
        var vk = "vault48", vg = GC[vk];
        if (!vg) { vg = new T.CylinderGeometry(1, 1, 1, 48, 1, true, 0, PI); GC[vk] = vg; }
        b.put("body", "dome", vg, mTRS(0, 1.8, 0, h - 1.8, 2 * xm, R, 0, 0, PI / 2));
        for (i = 0; i <= Math.round(2 * xm / 15); i++) {
          var x = -xm + 2 * xm * i / Math.max(1, Math.round(2 * xm / 15)), arc = [];
          for (var k = 0; k <= 16; k++) { var a = PI * k / 16; arc.push([x, 1.8 + (h - 1.8) * Math.sin(a) * 1.004 + 0.02, R * Math.cos(a) * 1.004]); }
          b.poly(arc);
        }
        b.seg([-xm, h + 0.05, 0], [xm, h + 0.05, 0]);
        for (i = 0; i < 6; i++) b.boxB("detail", "metalDark", -xm * 0.8 + xm * 1.6 * i / 5, h - 0.4, 0, 3.0, 1.2, 1.6);
      } else {
        b.ellip("body", "dome", 0, 1.8, 0, R, h - 1.8, R, 0, TAU, 0, PI / 2, 64, 0);
        for (i = 1; i < 4; i++) { var la = PI / 2 * i / 4; b.ring(0, 1.8 + (h - 1.8) * Math.sin(la), 0, R * Math.cos(la) * 1.004, 64); }
        b.vcyl("detail", "metalDark", 0, h - 0.3, 0, 2.2, 1.4, {seg: 16});
      }
      var xe = xm + R;
      [-1, 1].forEach(function (s) { b.boxB("detail", "dark", s * (xe - 0.6), 0, 0, 1.4, 8, 10, 0, false); });
      var xT = -xe - 18, yT = h + 4;
      b.lattice(xT, 0, 0, yT - 4, 8, 8, Math.max(2, Math.round((yT - 4) / 6)), {tl: 0.45, tb: 0.2});
      b.boxB("body", "clad", xT, yT - 4, 0, 9, 6, 9, 0, true);
      b.boxAB("body", "clad", [xT + 4.5, yT - 2.5, 0], [-xm * 0.6, h + 1.5, 0], 3.0, 4.0, true);
      b.boxAB("body", "metalDark", [-xm * 0.6, h + 0.4, 0], [xm * 0.7, h + 0.4, 0], 1.6, 2.2, false);
      b.blob(0, 0, 2 * xe + 10, d + 10, true);
    });
  reg("conveyor", {dims: {l: 90}, opts: {w: 4, h0: 8, h1: 30}},
    "rule: covered coke conveyor, 4 m gallery (layout LY coke conveyors); rising from 8 m to 30 m at a boiler bunker bay",
    function (b, D, O) {
      var l = D.l, w = +O.w > 0 ? +O.w : (+D.w > 0 ? +D.w : 4), h0 = O.h0 != null && isFinite(+O.h0) ? +O.h0 : (+D.h > 0 ? +D.h : 6);
      var h1 = O.h1 != null && isFinite(+O.h1) ? +O.h1 : h0, gh = 3.0, i;
      function yAt(x) { return h0 + (h1 - h0) * (x + l / 2) / l; }
      var A = [-l / 2, yAt(-l / 2), 0], B = [l / 2, yAt(l / 2), 0];
      b.boxAB("body", "steel", lift(A, 0.2), lift(B, 0.2), 0.5, w + 0.4, true);
      b.boxAB("body", "clad", lift(A, 0.45 + gh / 2), lift(B, 0.45 + gh / 2), gh, w, true);
      b.boxAB("body", "metalDark", lift(A, 0.45 + gh + 0.12), lift(B, 0.45 + gh + 0.12), 0.25, w + 0.5, false);
      var nj = Math.max(1, Math.round(l / 6));
      for (i = 1; i < nj; i++) {
        var x = -l / 2 + l * i / nj, y = yAt(x) + 0.45;
        b.seg([x, y, w / 2 + 0.02], [x, y + gh, w / 2 + 0.02]); b.seg([x, y, -w / 2 - 0.02], [x, y + gh, -w / 2 - 0.02]);
      }
      var nbent = Math.max(1, Math.round(l / 18));
      for (i = 0; i <= nbent; i++) {
        var xb = -l / 2 + 3 + (l - 6) * i / nbent, yb = yAt(xb);
        if (yb < 1.0) continue;
        if (yb > 14) {
          var wbt = clamp(yb * 0.2, 4, 9);
          b.lattice(xb, 0, 0, yb, wbt, w + 0.6, Math.max(2, Math.round(yb / 6)), {tl: 0.4, tb: 0.18});
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { b.boxB("detail", "concrete", xb + c[0] * wbt / 2, 0, c[1] * wbt / 2, 1.2, 0.5, 1.2); });
        } else {
          [-1, 1].forEach(function (s) {
            b.boxB("body", "steel", xb, 0, s * (w / 2 + 0.3), 0.4, yb, 0.4);
            b.boxB("detail", "concrete", xb, 0, s * (w / 2 + 0.3), 1.0, 0.4, 1.0);
          });
          b.box("body", "steel", xb, yb * 0.5, 0, 0.3, 0.3, w + 0.6);
          b.bar("body", "steel", [xb, 0.4, -w / 2 - 0.3], [xb, yb * 0.5, w / 2 + 0.3], 0.2);
          b.bar("body", "steel", [xb, yb * 0.5, -w / 2 - 0.3], [xb, yb - 0.1, w / 2 + 0.3], 0.2);
        }
      }
      [[-l / 2, h0], [l / 2, h1]].forEach(function (e, j) {
        if (O.ends === false || e[1] < 3) return;
        var xe = e[0] + (j ? 3 : -3);
        b.lattice(xe, 0, 0, e[1] - 0.5, 6, 6, Math.max(1, Math.round((e[1] - 0.5) / 6)), {tl: 0.4, tb: 0.18});
        b.boxB("body", "clad", xe, e[1] - 0.5, 0, 7, gh + 2.5, 7, 0, true);
        b.ladder(xe + (j ? 3.4 : -3.4), 1.5, 0, e[1] + 2.0, j ? 1 : -1, 0, 2.4);
      });
      b.blob(0, 0, l + 8, w + 6, true);
    });
  function loadingArm(b, x, yD, z, s, aoDeg) {
    s = s || 1;
    var hp = 10 * s, ra = 0.42 * s, P0 = [x, yD + hp, z];
    function swivel(c, ax, rr) {
      var a0 = [c[0] - ax[0] * rr * 1.5, c[1] - ax[1] * rr * 1.5, c[2] - ax[2] * rr * 1.5], a1 = [c[0] + ax[0] * rr * 1.5, c[1] + ax[1] * rr * 1.5, c[2] + ax[2] * rr * 1.5];
      b.cyl2("body", "swivel", a0, a1, rr, {seg: 16});
      b.cyl2("body", "metalDark", a0, [a0[0] + ax[0] * 0.18, a0[1] + ax[1] * 0.18, a0[2] + ax[2] * 0.18], rr * 1.3, {seg: 16});
      b.cyl2("body", "metalDark", [a1[0] - ax[0] * 0.18, a1[1] - ax[1] * 0.18, a1[2] - ax[2] * 0.18], a1, rr * 1.3, {seg: 16});
    }
    b.boxB("body", "concrete", x, yD, z, 3.0 * s, 0.4, 3.0 * s, 0, true);
    b.vcyl("body", "arm", x, yD + 0.4, z, 0.6 * s, hp - 0.4, {seg: 16, edge: true});
    b.vcyl("body", "metalDark", x, yD + 0.4, z, 0.85 * s, 0.7, {seg: 16});
    b.vcyl("body", "dark", x, yD + hp - 0.2, z, 0.85 * s, 0.6, {seg: 16});
    swivel([x, P0[1] + 0.8, z], [1, 0, 0], 0.62 * s);
    b.vcyl("body", "swivel", x, P0[1] - 0.25, z, 0.8 * s, 0.5, {seg: 16});
    var Li = 11 * s, ai = 78 * PI / 180, Pp = [x, P0[1] + 0.8, z], A = [x, Pp[1] + Li * Math.sin(ai), z - Li * Math.cos(ai)];
    var Lo = 14 * s, ao = (aoDeg || 58) * PI / 180, E = [x, A[1] - Lo * Math.sin(ao), A[2] + Lo * Math.cos(ao)];
    b.cyl2("body", "arm", Pp, A, ra, {seg: 14});
    b.cyl2("body", "arm", A, E, ra * 0.92, {seg: 14});
    swivel([x, A[1], A[2]], [1, 0, 0], 0.6 * s);
    b.cyl2("body", "metalDark", [x - 1.25 * s, A[1], A[2]], [x - 1.05 * s, A[1], A[2]], 1.15 * s, {seg: 20});
    var C = [x, Pp[1] - 2.2 * s, z - 4.2 * s];
    b.cyl2("body", "arm", Pp, C, ra * 0.7, {seg: 10});
    b.box("body", "dark", C[0], C[1] - 0.6 * s, C[2], 2.2 * s, 2.6 * s, 2.4 * s, 0, true);
    b.cyl2("body", "metalDark", [x + 1.05 * s, C[1] + 0.4 * s, C[2]], [x + 1.05 * s, A[1] - 0.2, A[2] - 0.1], 0.12 * s, {seg: 6});
    var E1 = [x, E[1] - 1.6 * s, E[2] + 0.9 * s], E2 = [x, E1[1] - 2.0 * s, E1[2]];
    swivel(E, [1, 0, 0], ra * 1.15);
    b.cyl2("body", "arm", E, [x, E[1], E1[2]], ra * 0.85, {seg: 12});
    b.sphere("body", "arm", [x, E[1], E1[2]], ra * 0.85, 12);
    swivel([x, E[1] - 0.2, E1[2]], [0, 1, 0], ra * 1.1);
    b.cyl2("body", "arm", [x, E[1], E1[2]], E1, ra * 0.85, {seg: 12});
    swivel(E1, [0, 0, 1], ra * 1.1);
    b.cyl2("body", "arm", E1, E2, ra * 0.85, {seg: 12});
    var y3 = E2[1];
    b.cyl2("body", "valve", [x, y3, E2[2]], [x, y3 - 0.55 * s, E2[2]], ra * 1.55, {seg: 14});
    b.cyl2("body", "stackBand", [x, y3 - 0.55 * s, E2[2]], [x, y3 - 0.75 * s, E2[2]], ra * 1.75, {seg: 14});
    b.cyl2("body", "valve", [x, y3 - 0.75 * s, E2[2]], [x, y3 - 1.3 * s, E2[2]], ra * 1.55, {seg: 14});
    var yc = y3 - 1.3 * s;
    b.cyl2("body", "coupler", [x, yc, E2[2]], [x, yc - 0.6 * s, E2[2]], ra * 1.7, {seg: 16});
    for (var jw = 0; jw < 3; jw++) {
      var aj = TAU * jw / 3, jx = x + Math.cos(aj) * ra * 1.8, jz = E2[2] + Math.sin(aj) * ra * 1.8;
      b.box("body", "coupler", jx, yc - 0.5 * s, jz, 0.3 * s, 0.9 * s, 0.3 * s, -aj);
    }
    return [x, yc - 0.6 * s, E2[2]];
  }
  function piles(b, pts, y0, rp) {
    pts.forEach(function (p) { b.vcyl("body", "pile", p[0], -6, p[1], rp, y0 + 6, {seg: 12}); });
  }
  reg("jetty_head", {dims: {w: 300, d: 40}, opts: {arms: 4, deck_h: 8}},
    "record: layout liquid berth 300 x 40 m with LPG vapour-return and base-oil loading arms (EQ-LAMU-MARINE-012); deck height 8 m a rule",
    function (b, D, O, eq) {
      var w = D.w, d = D.d, yD = +O.deck_h > 0 ? +O.deck_h : 8, n = clamp(Math.round(+O.arms || 4), 1, 8), i, k;
      var solo = b.ctx && b.ctx.solo && eq && b.ctx.solo === eq.id;
      var pw = clamp(w * 0.26, 36, 80), z0 = -d / 2, z1 = d / 2 - 8, th = 1.6;
      b.boxB("body", "concrete", 0, yD - th, (z0 + z1) / 2, pw, th, z1 - z0, 0, true);
      b.box("body", "pile", 0, yD - th - 0.6, (z0 + z1) / 2, pw - 2, 1.2, z1 - z0 - 2);
      var pp = [];
      for (var px = -pw / 2 + 3; px <= pw / 2 - 2.9; px += (pw - 6) / Math.round((pw - 6) / 8)) for (var pz = z0 + 3; pz <= z1 - 2.9; pz += (z1 - z0 - 6) / Math.round((z1 - z0 - 6) / 8)) pp.push([px, pz]);
      piles(b, pp, yD - th - 1.2, 0.6);
      b.railRect(-pw / 2 + 0.3, z0 + 0.3, pw / 2 - 0.3, z1 - 0.3, yD, "ew");
      for (var xf = -pw / 2 + 4; xf <= pw / 2 - 4 + 1e-6; xf += (pw - 8) / Math.max(1, Math.round((pw - 8) / 9))) {
        b.boxB("body", "rubber", xf, yD - th - 2.6, z1 + 0.3, 1.6, 3.6, 0.7, 0, true);
      }
      var pitch = clamp((pw - 26) / Math.max(1, n - 1), 7, 14), zp = z1 - 4.0, xa0 = -(n - 1) * pitch / 2;
      var cps = [];
      for (i = 0; i < n; i++) cps.push(loadingArm(b, xa0 + i * pitch, yD, zp, 1.3, solo ? 44 : 58));
      if (solo) {
        var cy = Math.min.apply(null, cps.map(function (c) { return c[1]; })), yS = cy - 2.6, zs = z1 + 3.0, Bm = 50, Lh = 200;
        b.boxB("body", "boot", 0, -1.5, zs + Bm / 2, Lh, 3.0, Bm, 0, true);
        b.boxB("body", "hull2", 0, 1.5, zs + Bm / 2, Lh, yS - 1.5, Bm, 0, true);
        b.boxB("body", "shipDeck", 0, yS, zs + Bm / 2, Lh - 0.6, 0.3, Bm - 0.6, 0, false);
        railLine(b, [-Lh / 2 + 1, yS + 0.3, zs + 0.5], [Lh / 2 - 1, yS + 0.3, zs + 0.5], {sp: 3, noKnee: true});
        cps.forEach(function (c, j) {
          b.cyl2("body", "metalDark", [c[0], c[1] - 0.05, c[2]], [c[0], c[1] - 0.35, c[2]], 0.75, {seg: 16});
          b.pipe("body", "metalDark", [[c[0], c[1] - 0.35, c[2]], [c[0], yS + 1.1, c[2]], [c[0], yS + 1.1, zs + 9 + j * 1.2]], 0.42);
        });
        for (k = 0; k < n; k++) b.cyl2("body", k % 2 ? "metalDark" : "shipDeck", [-Lh / 2 + 2, yS + 1.1, zs + 9 + k * 1.2], [Lh / 2 - 2, yS + 1.1, zs + 9 + k * 1.2], 0.4, {seg: 10});
        b.boxB("body", "metalDark", (cps[0][0] + cps[n - 1][0]) / 2, yS + 0.3, zs + 2.6, cps[n - 1][0] - cps[0][0] + 6, 0.35, 3.2, 0, true);
        b.platform(cps[0][0] - 3, zs + 4.4, cps[n - 1][0] + 3, zs + 6.0, yS + 1.6, "ns");
        b.vcyl("body", "white", cps[n - 1][0] + 9, yS + 0.3, zs + 6, 0.9, 8, {seg: 12});
        b.cyl2("body", "white", [cps[n - 1][0] + 9, yS + 8, zs + 6], [cps[n - 1][0] - 4, yS + 13, zs + 4], 0.4, {seg: 8});
        b.boxB("body", "white", -Lh * 0.32, yS + 0.3, zs + Bm * 0.5, 8, 3.5, 6, 0, true);
      }
      var zm = zp - 6.5;
      [0.45, 0.35, 0.3].forEach(function (rp, j) {
        var y = yD + 0.9 + j * 0.0, zz = zm - j * 1.3;
        b.pipe("body", j === 1 ? "metal" : "metalDark", [[xa0 - 2, y, zz], [-xa0 + 2, y, zz]], rp);
        b.pipe("body", j === 1 ? "metal" : "metalDark", [[j * 1.4 - 1.4, y, zz], [j * 1.4 - 1.4, y, z0 - 0.5]], rp);
      });
      for (i = 0; i < n; i++) b.pipe("body", "metalDark", [[xa0 + i * pitch, yD + 0.9, zm], [xa0 + i * pitch, yD + 0.9, zp - 1.0], [xa0 + i * pitch, yD + 2.0, zp - 0.6]], 0.3);
      for (k = 0; k < 6; k++) b.boxB("detail", "concrete", xa0 - 2 + k * (2 * -xa0 + 4) / 5, yD, zm - 1.3, 0.5, 0.45, 4.2);
      [xa0 - pitch * 0.6, -xa0 + pitch * 0.6].forEach(function (xt) {
        var ht = 19;
        b.boxB("body", "concrete", xt, yD, zp, 2.0, 0.3, 2.0, 0, true);
        b.vcyl("body", "steel", xt, yD + 0.3, zp, 0.45, ht - 0.3, {seg: 12});
        b.vcyl("deck", "deck", xt, yD + ht - 0.2, zp, 1.7, 0.2, {seg: 20, edge: true});
        arcRail(b, xt, zp, 1.62, yD + ht, 0, TAU, {});
        b.cyl2("detail", "stackBand", [xt, yD + ht + 0.8, zp], [xt, yD + ht + 1.3, zp + 1.6], 0.22, {seg: 8});
        b.vcyl("detail", "metalDark", xt, yD + ht, zp, 0.3, 0.8, {seg: 8});
        b.ladder(xt, zp - 0.75, yD + 0.3, yD + ht + 1.1, 0, -1, yD + 2.8);
      });
      var xst = -pw / 2 + 4.5, yW = yD + 10;
      b.stairTower(xst, zp - 1.0, yD, yW, PI / 2, {wf: 0.9});
      b.platform(xst + 1.6, zp - 3.3, -xa0 + 1.0, zp - 2.1, yW, "ns");
      for (var xw = xst + 4; xw < -xa0 + 1; xw += 8) [zp - 3.2, zp - 2.2].forEach(function (zz) { b.bar("deck", "steel", [xw, yD, zz], [xw, yW - 0.25, zz], 0.2); });
      b.boxB("body", "building", pw / 2 - 8, yD, z0 + 5, 11, 4.2, 7, 0, true);
      b.boxB("body", "metalDark", pw / 2 - 8, yD + 4.2, z0 + 5, 11.4, 0.3, 7.4, 0, false);
      b.box("detail", "glass", pw / 2 - 8, yD + 2.6, z0 + 8.55, 7, 1.0, 0.1);
      b.boxB("body", "building", pw / 2 - 19, yD, z0 + 4, 6, 3.4, 5, 0, true);
      var yC = yD - 0.4, zB = d / 2 - 3, zM = d / 2 - 14;
      var bxs = [pw / 2 + 18, pw / 2 + 18 + clamp(w * 0.12, 18, 40)], mxs = [w / 2 - 5, w / 2 - 5 - clamp(w * 0.1, 12, 30)];
      [-1, 1].forEach(function (s) {
        bxs.forEach(function (bx) {
          b.boxB("body", "concrete", s * bx, yC - 3, zB, 9, 3, 9, 0, true);
          piles(b, [[s * bx - 3, zB - 3], [s * bx + 3, zB - 3], [s * bx - 3, zB + 3], [s * bx + 3, zB + 3]], yC - 3, 0.7);
          b.cyl2("body", "rubber", [s * bx, yC - 2.2, zB + 4.5], [s * bx, yC - 2.2, zB + 6.6], 1.5, {rTop: 1.0, seg: 16});
          b.boxB("body", "metalDark", s * bx, yC - 5.0, zB + 6.6, 4.8, 5.6, 0.5, 0, true);
          [-2.2, 2.2].forEach(function (dx2) {
            b.vcyl("body", "dark", s * bx + dx2, yC, zB + 2.0, 0.42, 0.9, {seg: 10});
            b.vcyl("body", "dark", s * bx + dx2, yC + 0.9, zB + 2.0, 0.6, 0.18, {seg: 10});
          });
        });
        mxs.forEach(function (mx) {
          b.boxB("body", "concrete", s * mx, yC - 2.5, zM, 7, 2.5, 7, 0, true);
          piles(b, [[s * mx - 2.2, zM - 2.2], [s * mx + 2.2, zM - 2.2], [s * mx - 2.2, zM + 2.2], [s * mx + 2.2, zM + 2.2]], yC - 2.5, 0.6);
          b.boxB("detail", "metalDark", s * mx, yC, zM + 1.5, 2.2, 0.8, 1.2, 0, false);
          b.vcyl("body", "dark", s * mx - 1.6, yC, zM - 1.5, 0.45, 0.9, {seg: 10});
          b.vcyl("body", "dark", s * mx - 1.6, yC + 0.9, zM - 1.5, 0.65, 0.2, {seg: 10});
        });
        trussWalk(b, [s * (pw / 2), yD, z1 - 4], [s * (bxs[0] - 4.5), yD, zB - 1], 1.2);
        trussWalk(b, [s * (bxs[0] + 4.5), yD, zB - 1], [s * (bxs[1] - 4.5), yD, zB - 1], 1.2);
        trussWalk(b, [s * (bxs[1] + 4.5), yD, zB - 2], [s * (mxs[1] - 3.5), yD - 0.4, zM], 1.2);
        trussWalk(b, [s * (mxs[1] + 3.5), yD - 0.4, zM], [s * (mxs[0] - 3.5), yD - 0.4, zM], 1.2);
      });
      b.blob(0, (z0 + z1) / 2, pw + 6, z1 - z0 + 6, true);
    });
  reg("trestle", {dims: {l: 150, w: 15}, opts: {deck_h: 8}},
    "record: layout marine trestle 3 km x 15 m (12 m high per the layout); a 150 m sample length; deck 8 m above the sea a rule",
    function (b, D, O, eq) {
      var l = D.l, w = D.w, yD = +O.deck_h > 0 ? +O.deck_h : 8, i, k, rd = Math.min(7.5, w * 0.5), zr0 = -w / 2, zr1 = -w / 2 + rd;
      var sp = 15, nb = Math.max(1, Math.round(l / sp)), long = l > 600;
      b.boxB("body", "concrete", 0, yD - 0.9, 0, l, 0.9, w, 0, true);
      b.boxB("body", "roadSurf", 0, yD, (zr0 + zr1) / 2, l, 0.12, rd - 0.6, 0, false);
      b.boxB("detail", "concrete", 0, yD, zr1, l, 0.3, 0.4, 0, false);
      for (i = 0; i <= nb; i++) {
        var x = -l / 2 + l * i / nb;
        b.boxB("body", "concrete", x, yD - 2.3, 0, 1.4, 1.4, w + 0.6, 0, true);
        var npz = Math.max(3, Math.round(w / 5));
        var pz = [];
        for (k = 0; k < npz; k++) pz.push([x, -w / 2 + 1 + (w - 2) * k / (npz - 1)]);
        piles(b, pz, yD - 2.3, 0.55);
      }
      var sizes = [0.6, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2], z = zr1 + 0.8, yS = yD + 0.5;
      sizes.forEach(function (rp, j) {
        if (z + 2 * rp > w / 2 - 0.4) return;
        b.cyl2("body", j % 3 === 1 ? "metal" : (j % 3 === 2 ? "pipeA" : "metalDark"), [-l / 2, yS + rp, z + rp], [l / 2, yS + rp, z + rp], rp, {seg: rp < 0.3 ? 8 : 12, open: true});
        z += 2 * rp + 0.35;
      });
      for (var xs = -l / 2 + 3; xs < l / 2; xs += 6) b.boxB("detail", "concrete", xs, yD, (zr1 + w / 2) / 2 + 0.2, 0.5, 0.5, w / 2 - zr1 - 0.6);
      var rsp = long ? 3.0 : 2.0;
      railLine(b, [-l / 2, yD, -w / 2 + 0.15], [l / 2, yD, -w / 2 + 0.15], {sp: rsp, noKnee: long});
      railLine(b, [-l / 2, yD, w / 2 - 0.15], [l / 2, yD, w / 2 - 0.15], {sp: rsp, noKnee: long});
      for (var xl = -l / 2 + 10; xl < l / 2; xl += 30) {
        b.bar("detail", "steel", [xl, yD, -w / 2 + 0.5], [xl, yD + 8, -w / 2 + 0.5], 0.2);
        b.bar("detail", "steel", [xl, yD + 8, -w / 2 + 0.5], [xl, yD + 8, -w / 2 + 2.0], 0.15);
        b.box("detail", "white", xl, yD + 7.85, -w / 2 + 2.0, 0.6, 0.2, 0.4);
      }
      void eq;
    });
  reg("spm", {dims: {}, opts: {d: 12, hose_l: 80}},
    "record: EQ-LAMU-MARINE crude SPMs, CALM buoys with floating and subsea hoses, VLCC class; 12 m buoy a rule",
    function (b, D, O) {
      var Rb = (+O.d > 0 ? +O.d : 12) / 2, fb = 2.2, i;
      b.vcyl("body", "buoy", 0, -1.5, 0, Rb, 1.5 + fb, {seg: 32, edge: true});
      b.vcyl("body", "rubber", 0, 0.5, 0, Rb * 1.03, 1.1, {seg: 32, open: true});
      b.vcyl("body", "deck", 0, fb, 0, Rb * 0.98, 0.1, {seg: 32});
      arcRail(b, 0, 0, Rb - 0.3, fb + 0.1, 0, TAU, {});
      b.vcyl("body", "metalDark", 0, fb + 0.1, 0, Rb * 0.55, 1.1, {seg: 24, edge: true});
      b.vcyl("body", "buoy", 0, fb + 1.2, 0, 1.0, 3.2, {seg: 16, edge: true});
      b.vcyl("detail", "metalDark", 0, fb + 4.4, 0, 1.3, 0.4, {seg: 16});
      b.boxAB("body", "buoy", [0, fb + 1.6, 0], [Rb + 1.8, fb + 1.2, 0], 1.0, 1.4, true);
      b.bar("detail", "steel", [-Rb * 0.6, fb + 0.1, 0], [-Rb * 0.6, fb + 5.5, 0], 0.15);
      b.vcyl("detail", "buoy", -Rb * 0.6, fb + 5.5, 0, 0.3, 0.5, {seg: 8});
      var hl = +O.hose_l > 0 ? +O.hose_l : 80, hw = [];
      for (i = 0; i <= 12; i++) { var t = i / 12; hw.push([Rb + 1.8 + (hl * 0.5) * t, fb + 1.2 - 2.0 * Math.sin(PI * t) + 0.6 * t, 0.0]); }
      b.poly(hw);
      var hp = [];
      for (i = 0; i <= 24; i++) { var t2 = i / 24; hp.push([Rb * 0.9 + hl * t2, 0.25, -6 - 10 * Math.sin(PI * t2 * 1.5) * (1 - t2 * 0.5)]); }
      for (i = 0; i < 24; i++) b.cyl2("body", "hose", hp[i], hp[i + 1], 0.38, {seg: 8});
      for (i = 1; i < 24; i += 2) b.cyl2("detail", "stackBand", lift(hp[i], 0), lerp3(hp[i], hp[i + 1], 0.12), 0.62, {seg: 10});
      b.sphere("detail", "buoy", lift(hp[24], 0.3), 0.8, 10);
      b.pipe("body", "hose", [[Rb * 0.95, fb - 0.2, -1.0], [Rb * 0.95 + 0.6, 0.3, -2.5], hp[0]], 0.38);
    });
  function hullPlan(L, B) {
    var side = [], xs = -L / 2, xb0 = L * 0.24, n = 16, i;
    side.push([xs, B * 0.34], [xs + L * 0.012, B * 0.44], [xs + L * 0.04, B * 0.49], [xs + L * 0.09, B * 0.5], [xb0, B * 0.5]);
    for (i = 1; i <= n; i++) { var t = i / n, x = xb0 + (L / 2 - xb0) * t; side.push([x, Math.max(0.0, B * 0.5 * Math.pow(1 - Math.pow(t, 2.4), 0.5))]); }
    var pts = side.slice();
    for (i = side.length - 2; i >= 0; i--) pts.push([side[i][0], -side[i][1]]);
    return pts;
  }
  reg("tanker", {dims: {l: 330}, opts: {}},
    "record: EQ-LAMU-MARINE crude SPMs serve VLCC class tankers; 330 m x 60 m VLCC a rule",
    function (b, D, O) {
      var L = D.l, B = +O.b > 0 ? +O.b : L / 5.5, fb = clamp(L * 0.028, 3.5, 10), i;
      var plan = hullPlan(L, B), wl = O.waterline ? 2.4 : 1.2;
      b.prismY("body", "boot", plan, O.waterline ? 0 : -3, O.waterline ? wl : 3 + 1.2, false);
      b.prismY("body", "hull", plan, wl, fb - wl - 0.4, true);
      b.prismY("body", "shipDeck", plan, fb - 0.4, 0.4, false);
      var inner = plan.map(function (p) { return [p[0] * (1 - 1.2 / L), p[1] * (1 - 1.2 / B)]; });
      var fc = plan.filter(function (p) { return p[0] >= L * 0.43; });
      b.prismY("body", "hull", fc, fb, 2.3, true);
      b.prismY("body", "shipDeck", fc, fb + 2.3, 0.3, false);
      var rp = inner.filter(function (p, j) { return j % 1 === 0; }).map(function (p) { return [p[0], p[1]]; });
      b.rail(rp, fb + 0.06, true, {});
      var xa = -L / 2 + L * 0.045, la = L * 0.07, ba = B * 0.72, ha = clamp(L * 0.045, 8, 16);
      b.boxB("body", "white", -L / 2 + L * 0.03, fb, 0, L * 0.05, 2.6, B * 0.8, 0, true);
      b.boxB("body", "white", xa + la / 2, fb, 0, la, ha, ba, 0, true);
      var nd = Math.max(2, Math.round(ha / 2.9));
      for (i = 1; i <= nd; i++) {
        var yw = fb + ha * i / (nd + 0.4) - 1.0;
        b.box("detail", "glass", xa + la + 0.05, yw, 0, 0.1, 0.9, ba * 0.85);
        b.box("detail", "glass", xa + la / 2, yw, ba / 2 + 0.05, la * 0.8, 0.9, 0.1);
        b.box("detail", "glass", xa + la / 2, yw, -ba / 2 - 0.05, la * 0.8, 0.9, 0.1);
      }
      b.boxB("body", "white", xa + la * 0.65, fb + ha, 0, la * 0.55, 2.8, B, 0, true);
      b.box("detail", "glass", xa + la * 0.65 + la * 0.28, fb + ha + 1.6, 0, 0.1, 1.0, B * 0.9);
      b.bar("detail", "steel", [xa + la * 0.6, fb + ha + 2.8, 0], [xa + la * 0.6, fb + ha + 9, 0], 0.3);
      b.bar("detail", "steel", [xa + la * 0.6, fb + ha + 7, -3], [xa + la * 0.6, fb + ha + 7, 3], 0.2);
      b.frustum("body", "white", xa + la * 0.1, fb + ha, 0, la * 0.42, B * 0.16, la * 0.36, B * 0.12, ha * 0.55, true);
      b.boxB("body", "stackBand", xa + la * 0.1, fb + ha + ha * 0.32, 0, la * 0.4, ha * 0.1, B * 0.145, 0, false);
      b.boxB("body", "dark", xa + la * 0.1, fb + ha * 1.55 - 0.6, 0, la * 0.37, 0.6, B * 0.125, 0, false);
      b.boxR("detail", "lifeboat", -L / 2 + L * 0.012, fb + 3.5, 0, 6, 2.2, 2.6, 0, -0.5, true);
      var xc0 = xa + la + 1, xc1 = L * 0.43, ycw = fb + 2.4;
      b.boxAB("deck", "deck", [xc0, ycw, 0], [xc1, ycw, 0], 0.15, 1.3, false);
      railLine(b, [xc0, ycw, 0.65], [xc1, ycw, 0.65], {sp: 4, noKnee: true});
      railLine(b, [xc0, ycw, -0.65], [xc1, ycw, -0.65], {sp: 4, noKnee: true});
      for (var xp = xc0 + 4; xp < xc1; xp += 10) b.bar("deck", "steel", [xp, fb, 0], [xp, ycw - 0.1, 0], 0.25);
      [-2.4, -1.4, 1.4, 2.4].forEach(function (z, j) { b.cyl2("body", j % 2 ? "metalDark" : "shipDeck", [xc0, fb + 0.9, z], [xc1 - 2, fb + 0.9, z], 0.38, {seg: 8, open: true}); });
      for (i = 0; i < 6; i++) {
        var zm = -B * 0.42 + B * 0.84 * i / 5;
        b.cyl2("body", "metalDark", [-1.5 + (i % 2) * 3, fb + 1.4, -B * 0.45], [-1.5 + (i % 2) * 3, fb + 1.4, B * 0.45], 0.3, {seg: 8});
        void zm;
      }
      b.platform(-4, -B * 0.46, 4, -B * 0.34, fb + 1.0, "e");
      b.platform(-4, B * 0.34, 4, B * 0.46, fb + 1.0, "e");
      [[-8, -B * 0.32], [8, B * 0.32]].forEach(function (c) {
        b.vcyl("body", "white", c[0], fb, c[1], 0.8, 7, {seg: 12});
        b.cyl2("body", "white", [c[0], fb + 7, c[1]], [c[0] + 12, fb + 13, c[1] * 0.6], 0.35, {seg: 8});
      });
      for (var xh = -L * 0.32; xh < L * 0.4; xh += L * 0.045) [-1, 1].forEach(function (s) { b.boxB("detail", "shipDeck", xh, fb, s * B * 0.25, 2.4, 0.8, 2.0); });
      b.bar("detail", "steel", [L * 0.46, fb + 2.6, 0], [L * 0.46, fb + 12, 0], 0.3);
      b.bar("detail", "steel", [L * 0.46, fb + 10, -2.5], [L * 0.46, fb + 10, 2.5], 0.18);
      b.seg([L * 0.46, fb + 12, 0], [xa + la * 0.6, fb + ha + 9, 0]);
    });
  reg("person", {dims: {h: 1.8}, opts: {}}, "rule: a 1.8 m person in a hi-vis vest and a hard hat, for scale",
    function (b, D) {
      var k = D.h / 1.8;
      [-0.1, 0.1].forEach(function (z) { b.boxB("body", "trousers", 0, 0, z * k, 0.2 * k, 0.84 * k, 0.15 * k, 0, false); });
      b.boxB("body", "hivis", 0, 0.82 * k, 0, 0.26 * k, 0.64 * k, 0.46 * k, 0, false);
      [-0.29, 0.29].forEach(function (z) { b.boxB("body", "hivis", 0, 0.86 * k, z * k, 0.12 * k, 0.58 * k, 0.12 * k, 0, false); });
      b.box("detail", "hat", 0, 1.12 * k, 0, 0.27 * k, 0.05 * k, 0.47 * k);
      b.sphere("body", "skin", [0, 1.575 * k, 0], 0.115 * k, 8);
      b.head("body", "hat", 0, 1.64 * k, 0, 0.15 * k, 0.16 * k, false, 8);
    });
  reg("fuel_truck", {dims: {l: 16}, opts: {}}, "rule: a 16 m articulated road fuel tanker (tractor and a tank trailer)",
    function (b, D) {
      var k = D.l / 16, x0 = -8 * k, x1 = 8 * k, i;
      b.boxB("body", "dark", -0.2 * k, 0.75 * k, 0, 15.4 * k, 0.4 * k, 2.2 * k, 0, false);
      b.boxB("body", "cab", 6.7 * k, 1.0 * k, 0, 2.6 * k, 2.6 * k, 2.5 * k, 0, true);
      b.box("detail", "glass", x1 + 0.02, 2.75 * k, 0, 0.06, 0.9 * k, 2.2 * k);
      b.boxB("detail", "dark", x1 - 0.1 * k, 0.55 * k, 0, 0.3 * k, 0.45 * k, 2.5 * k, 0, false);
      b.cyl2("body", "tank", [x0 + 0.1 * k, 2.55 * k, 0], [4.9 * k, 2.55 * k, 0], 1.25 * k, {seg: 16, edge: true});
      b.box("detail", "deck", -1.5 * k, 3.82 * k, 0, 11 * k, 0.08 * k, 0.6 * k);
      [6.9, 4.4, -4.9, -6.2, -7.4].forEach(function (x) {
        for (i = -1; i <= 1; i += 2) b.cyl2("body", "tyre", [x * k, 0.5 * k, i * 0.95 * k], [x * k, 0.5 * k, i * 1.25 * k], 0.5 * k, {seg: 10});
      });
    });
  function block(b, cx, cz, w, d, h, o) {
    o = o || {};
    var mat = o.mat || "building", i, fh = o.floor || 4.0;
    b.boxB("body", "concrete", cx, 0, cz, w + 0.8, 0.4, d + 0.8, 0, false);
    if (o.roof === "pitched") {
      b.boxB("body", mat, cx, 0.4, cz, w, h - 0.4, d, 0, true);
      var rise = Math.min(d * 0.12, 5);
      b.prismX("body", "metalDark", cx, h, cz, w + 0.6, [[-d / 2 - 0.4, 0], [d / 2 + 0.4, 0], [0, rise]], true);
    } else {
      b.boxB("body", mat, cx, 0.4, cz, w, h - 0.4, d, 0, true);
      b.boxB("body", "concrete", cx, h, cz, w + 0.1, 0.9, d + 0.1, 0, false);
      b.boxB("body", "roofDeck", cx, h, cz, w - 0.6, 0.15, d - 0.6, 0, false);
      var nh = Math.max(1, Math.round(w * d / 900));
      for (i = 0; i < Math.min(nh, 8); i++) {
        var hx = cx - w * 0.35 + w * 0.7 * (i % 4) / 3, hz = cz + (i < 4 ? -d * 0.2 : d * 0.2);
        b.boxB("detail", "metalDark", hx, h + 0.15, hz, Math.min(4, w * 0.12), 1.6, Math.min(3, d * 0.15), 0, true);
      }
    }
    if (o.windows !== false) {
      var nf = Math.max(1, Math.floor((h - 0.5) / fh));
      for (i = 0; i < nf; i++) {
        var yw = 0.4 + i * fh + fh * 0.45, wh = Math.min(1.4, fh * 0.35);
        b.box("detail", "glass", cx, yw, cz + d / 2 + 0.04, w - 3, wh, 0.1);
        b.box("detail", "glass", cx, yw, cz - d / 2 - 0.04, w - 3, wh, 0.1);
        b.box("detail", "glass", cx + w / 2 + 0.04, yw, cz, 0.1, wh, d - 3);
        b.box("detail", "glass", cx - w / 2 - 0.04, yw, cz, 0.1, wh, d - 3);
      }
    }
    b.boxB("detail", "dark", cx, 0.4, cz + d / 2 + 0.05, Math.min(3.5, w * 0.2), Math.min(3.2, h * 0.6), 0.1);
    if (o.canopy !== false) b.boxB("detail", "metalDark", cx, Math.min(3.2, h * 0.6) + 0.5, cz + d / 2 + 1.2, Math.min(5, w * 0.3), 0.25, 2.4);
  }
  reg("building", {dims: {w: 80, d: 50, h: 15}, opts: {}}, "record: layout buildings, administration 80 x 50 x 15 m",
    function (b, D, O) {
      block(b, 0, 0, D.w, D.d, D.h, {windows: O.windows !== false && O.windows !== 0, roof: O.roof, mat: O.mat});
      b.blob(0, 0, D.w + 6, D.d + 6, true);
    });
  function transformer(b, x, z, s) {
    b.boxB("body", "concrete", x, 0, z, 7 * s, 0.5, 6 * s, 0, true);
    b.boxB("body", "trafo", x, 0.5, z, 4.2 * s, 3.6 * s, 3.0 * s, 0, true);
    for (var i = 0; i < 6; i++) {
      var xr = x - 1.8 * s + 3.6 * s * i / 5;
      b.boxB("detail", "trafo", xr, 0.9, z + 2.0 * s, 0.25, 3.0 * s, 0.9 * s);
      b.boxB("detail", "trafo", xr, 0.9, z - 2.0 * s, 0.25, 3.0 * s, 0.9 * s);
    }
    b.cyl2("body", "trafo", [x - 1.6 * s, 0.5 + 4.6 * s, z - 0.9 * s], [x + 1.6 * s, 0.5 + 4.6 * s, z - 0.9 * s], 0.55 * s, {seg: 12});
    b.bar("detail", "trafo", [x, 0.5 + 3.6 * s, z - 0.9 * s], [x, 0.5 + 4.1 * s, z - 0.9 * s], 0.25);
    [-1, 0, 1].forEach(function (k) {
      b.vcyl("detail", "insul", x + k * 1.2 * s, 0.5 + 3.6 * s, z + 0.6 * s, 0.18 * s, 1.8 * s, {seg: 8});
      b.vcyl("detail", "insul", x + k * 1.2 * s, 0.5 + 3.6 * s, z - 0.3 * s, 0.12 * s, 1.0 * s, {seg: 8});
    });
  }
  reg("substation", {dims: {w: 150, d: 100}, opts: {}},
    "record: layout main electrical substation 150 x 100 m (gas-insulated), power-plant step-up and refinery distribution",
    function (b, D, O) {
      var w = D.w, d = D.d, i, hb = +D.h > 0 ? +D.h : 12;
      b.slab("body", "gravel", -w / 2, -d / 2, w / 2, d / 2, 0, 0.25, null, false);
      var fo = {h: 2.4, sp: 3, mat: "fence", layer: "detail", t: 0.08};
      railLine(b, [-w / 2, 0.25, -d / 2], [w / 2, 0.25, -d / 2], fo);
      railLine(b, [w / 2, 0.25, -d / 2], [w / 2, 0.25, d / 2], fo);
      railLine(b, [-w / 2, 0.25, d / 2], [-w / 2, 0.25, -d / 2], fo);
      railLine(b, [-w / 2, 0.25, d / 2], [-4, 0.25, d / 2], fo);
      railLine(b, [4, 0.25, d / 2], [w / 2, 0.25, d / 2], fo);
      var gw = Math.min(w * 0.55, 90), gd = Math.min(d * 0.24, 28);
      block(b, -w / 2 + gw / 2 + 8, -d / 2 + gd / 2 + 6, gw, gd, hb, {windows: false, canopy: false});
      for (i = 0; i < 6; i++) b.box("detail", "dark", -w / 2 + 14 + i * (gw - 12) / 5, hb * 0.6, -d / 2 + gd + 6.05, 3, 2.4, 0.12);
      block(b, w / 2 - 18, d / 2 - 12, 20, 12, 5, {});
      var nt = clamp(Math.round(w / 24), 2, 8), zt = d * 0.06, s = clamp(d / 100, 0.7, 1.3);
      for (i = 0; i < nt; i++) {
        var xt = -w / 2 + w * (i + 0.5) / nt;
        transformer(b, xt, zt, s);
        if (i < nt - 1) b.boxB("body", "concrete", xt + w / nt / 2, 0, zt, 0.35, 5.2 * s, 9 * s, 0, true);
      }
      var zg = zt + d * 0.22, hg = 14 * s;
      for (i = 0; i <= nt; i++) {
        var xg = -w / 2 + w * i / nt + (i === 0 ? 3 : i === nt ? -3 : 0);
        b.lattice(xg, zg, 0, hg, 1.6, 0.9, 4, {tl: 0.25, tb: 0.1});
        if (i < nt) {
          var xg2 = -w / 2 + w * (i + 1) / nt + (i + 1 === nt ? -3 : 0);
          b.bar("body", "steel", [xg, hg, zg], [xg2, hg, zg], 0.45);
          var xm = (xg + xg2) / 2;
          [-1.2, 0, 1.2].forEach(function (k) {
            b.seg([xm + k * s, hg - 0.3, zg], [xm + k * s * 1.0, 0.5 + 5.4 * s, zt + 0.6 * s]);
            b.vcyl("detail", "insul", xm + k * s, hg - 1.4, zg, 0.12, 1.2, {seg: 6});
          });
        }
      }
      void O;
    });
  function pylonArms(h) {
    return [[0.56 * h, 0.20 * h], [0.70 * h, 0.24 * h], [0.84 * h, 0.20 * h]];
  }
  reg("pylon", {dims: {h: 45}, opts: {next: [380, 0], nrot: 0}},
    "record: layout export power line (later), pylons about 45 m high, spans up to 400 m (ASSUMPTIONS)",
    function (b, D, O) {
      var h = D.h, wb = 0.22 * h, wt = 0.06 * h, hb = 0.84 * h, drop = 0.09 * h, arms = pylonArms(h), i;
      var widthAt = function (y) { return wb + (wt - wb) * Math.min(1, y / hb); };
      b.lattice(0, 0, 0, hb, wb, wt, 6, {tl: 0.35, tb: 0.15});
      b.lattice(0, 0, hb, h - hb, wt, wt * 0.4, 2, {tl: 0.25, tb: 0.12});
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
        b.boxB("body", "concrete", sx * wb / 2, 0, sz * wb / 2, 1.6, 0.6, 1.6, 0, false); }); });
      arms.forEach(function (A) {
        var y = A[0], a = A[1], hw = widthAt(y) / 2;
        b.bar("body", "steel", [0, y, -a], [0, y, a], 0.3);
        [-1, 1].forEach(function (s) {
          b.bar("body", "steel", [0, y, s * a], [0, y + 0.05 * h, s * hw], 0.22);
          b.vcyl("detail", "insul", 0, y - drop, s * a, 0.22, drop, {seg: 6});
        });
      });
      var nx = O.next && +O.next[0], nz = O.next && +O.next[1];
      if (!(isFinite(nx) && isFinite(nz)) || (!nx && !nz)) return;
      var th = (+O.nrot || 0) * PI / 180, span = Math.sqrt(nx * nx + nz * nz), sag = 0.03 * span, N = 10;
      function wire(p, q, sg) {
        var last = p;
        for (var k = 1; k <= N; k++) {
          var t = k / N, pt = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - 4 * sg * t * (1 - t), p[2] + (q[2] - p[2]) * t];
          b.seg(last, pt); last = pt;
        }
      }
      arms.forEach(function (A) {
        [-1, 1].forEach(function (s) {
          var z = s * A[1], y = A[0] - drop;
          wire([0, y, z], [nx + z * Math.sin(th), y, nz + z * Math.cos(th)], sag);
        });
      });
      wire([0, h, 0], [nx, h, nz], sag * 0.8);
      void i;
    });
  reg("desal_hall", {dims: {w: 60, d: 30, h: 10}, opts: {tanks: 2, tank_d: 14}},
    "record: LY-LAMU-PLANT-201 SWRO train 1 (12,500 m3/d) in a 60 x 30 x 10 m building; product-water tanks a rule",
    function (b, D, O, eq) {
      var w = D.w, d = D.d, h = D.h, i;
      block(b, 0, 0, w, d, h, {roof: "pitched", windows: false, mat: "building"});
      for (i = 0; i < 6; i++) {
        b.box("detail", "dark", -w / 2 + 5 + i * (w - 10) / 5, h * 0.62, d / 2 + 0.06, 3.0, 1.6, 0.1);
        b.box("detail", "dark", -w / 2 + 5 + i * (w - 10) / 5, h * 0.62, -d / 2 - 0.06, 3.0, 1.6, 0.1);
      }
      b.boxB("detail", "dark", -w / 2 + 8, 0.4, d / 2 + 0.06, 5, 5, 0.1);
      for (i = 0; i < 4; i++) b.boxB("detail", "metalDark", -w / 2 + 6 + i * 4, h + 0.5, 0, 1.6, Math.min(d * 0.12, 5) + 0.6, 1.6);
      var nt = clamp(Math.round(O.tanks == null ? 2 : +O.tanks), 0, 4), td = +O.tank_d > 0 ? +O.tank_d : 14, th = clamp(td * 0.7, 6, 14);
      for (i = 0; i < nt; i++) {
        var cx = w / 2 + 6 + td / 2, cz = (i - (nt - 1) / 2) * (td + 5);
        buildTank(b, cx, cz, {d: td, h: th}, {}, {id: (eq.id || "sample-desal") + "-t" + i}, "cone");
        b.pipe("body", "metal", [[w / 2, 1.2, cz * 0.3], [cx - td / 2 - 0.5, 1.2, cz * 0.3 + (cz > 0 ? 2 : -2)]], 0.35);
      }
      b.pipe("body", "metalDark", [[-w / 2 - 12, 0.9, -d * 0.3], [-w / 2, 0.9, -d * 0.3]], 0.6);
      b.pipe("body", "pipeA", [[-w / 2 - 12, 0.9, -d * 0.15], [-w / 2, 0.9, -d * 0.15]], 0.45);
      b.blob(0, 0, w + 6, d + 6, true);
    });
  reg("cooling_tower", {dims: {w: 60, d: 15, h: 14}, opts: {cells: 4}},
    "rule: low priority (Lamu is seawater-cooled, no tower in the record); a 4-cell mechanical-draft tower",
    function (b, D, O) {
      var w = D.w, d = D.d, h = D.h, n = clamp(Math.round(+O.cells || Math.max(1, Math.round(w / d))), 1, 12), cw = w / n, i;
      b.boxB("body", "concrete", 0, 0, 0, w + 1.2, 1.2, d + 1.2, 0, true);
      b.boxB("body", "clad", 0, 1.2, 0, w, h - 1.2, d, 0, true);
      for (i = 0; i < n; i++) {
        var x = -w / 2 + cw * (i + 0.5), rf = cw * 0.33;
        b.box("detail", "dark", x, 1.2 + (h - 1.2) * 0.25, d / 2 + 0.06, cw * 0.85, (h - 1.2) * 0.38, 0.1);
        b.box("detail", "dark", x, 1.2 + (h - 1.2) * 0.25, -d / 2 - 0.06, cw * 0.85, (h - 1.2) * 0.38, 0.1);
        b.vcyl("body", "cladDS", x, h, 0, rf, 3.5, {rTop: rf * 1.1, seg: 32, open: true, edge: true});
        b.vcyl("detail", "dark", x, h + 1.5, 0, rf * 0.97, 0.1, {seg: 32});
        if (i) b.seg([x - cw / 2, h + 0.02, -d / 2], [x - cw / 2, h + 0.02, d / 2]);
      }
      b.railRect(-w / 2 + 0.2, -d / 2 + 0.2, w / 2 - 0.2, d / 2 - 0.2, h, "nsew");
      b.stairTower(w / 2 + 2.5, 0, 0, h, PI / 2, {wf: 0.9});
      b.blob(0, 0, w + 6, d + 6, true);
    });
  KIT.helpers.site = {Builder: Builder, getMat: getMat, lod: lod, helixStair: helixStair, railLine: railLine,
    arcRail: arcRail, trussWalk: trussWalk, buildTank: buildTank, buildSphere: buildSphere, buildChimney: buildChimney,
    loadingArm: loadingArm, block: block, rng: rng};
})();
