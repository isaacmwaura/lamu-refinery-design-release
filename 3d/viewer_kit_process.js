(function () {
  "use strict";
  var T = window.THREE;
  if (!T) { if (window.console) console.warn("viewer_kit_process.js: THREE is not loaded"); return; }
  var KIT = window.KIT = window.KIT || {kinds: {}};
  KIT.kinds = KIT.kinds || {};
  KIT.helpers = KIT.helpers || {};
  var STYLE = {ground: 0xd8cfbd, pad: 0xcfc5b0, road: 0x6e6e6e, sea: 0x7fb0d8, metal: 0xc9ccd0, metalDark: 0xa9adb3,
    steel: 0x5a5f66, rail: 0xb5b84a, concrete: 0xbdb7aa, building: 0xd9cdb4, edge: 0x3a3d42, stackBand: 0xb8413a,
    flame: 0xf2a33a};
  KIT.style = KIT.style || {};
  Object.keys(STYLE).forEach(function (k) { if (KIT.style[k] === undefined) KIT.style[k] = STYLE[k]; });
  var EXTRA = {deck: 0x8f949a, dark: 0x51565d, coke: 0x2e2c2a, fan: 0xe4e7ea, white: 0xedede8, pipeA: 0x9cab95,
    roof: 0xc5c9cd, heavy: 0x9da2a8, casing: 0xb3b7bc, crane: 0xc9a83c, trafo: 0x7f8b88, forged: 0x6f757c,
    valve: 0x3f4a55, wheel: 0xb8413a, porcelain: 0x8a5a3c, cable: 0x2b2d30, insul: 0x9a6b4f};
  var PI = Math.PI, TAU = PI * 2, IDENT = new T.Matrix4();
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function getMat(ctx, name) {
    var mats = ctx.mats || (ctx.mats = {});
    var st = ctx.style || KIT.style;
    var key = (STYLE[name] !== undefined && name !== "edge") ? name : "proc." + name;
    if (mats[key]) return mats[key];
    var col = (st && st[name] !== undefined) ? st[name] : (STYLE[name] !== undefined ? STYLE[name] :
      (EXTRA[name] !== undefined ? EXTRA[name] : 0xff00ff));
    var m;
    if (name === "edge") m = new T.LineBasicMaterial({color: col, transparent: true, opacity: 0.5});
    else if (name === "blob") m = new T.MeshBasicMaterial({color: 0x000000, vertexColors: true, transparent: true,
      depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    else if (name === "flame") m = new T.MeshBasicMaterial({color: col});
    else m = new T.MeshLambertMaterial({color: col, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
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
      pos.push(x, 0.08, z); col.push(0, 0, 0, 0.2);
      [[0.9, 0.15], [1.3, 0.0]].forEach(function (rg) {
        for (var i = 0; i < n; i++) {
          var a = TAU * i / n, c = Math.cos(a), s = Math.sin(a);
          var k = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
          pos.push(x + ax * rg[0] * c * k, 0.08, z + az * rg[0] * s * k);
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
  BP.valve = function (layer, p, ax, r, up, o) {
    o = o || {};
    var L = r * 2.6, a = [p[0] - ax[0] * L / 2, p[1] - ax[1] * L / 2, p[2] - ax[2] * L / 2],
      c = [p[0] + ax[0] * L / 2, p[1] + ax[1] * L / 2, p[2] + ax[2] * L / 2], k = 0.22;
    this.cyl2(layer, "valve", a, c, r * 1.35, {seg: segFor(r) + 2});
    this.cyl2(layer, "valve", a, [a[0] + ax[0] * L * k, a[1] + ax[1] * L * k, a[2] + ax[2] * L * k], r * 1.8, {seg: segFor(r) + 2});
    this.cyl2(layer, "valve", [c[0] - ax[0] * L * k, c[1] - ax[1] * L * k, c[2] - ax[2] * L * k], c, r * 1.8, {seg: segFor(r) + 2});
    var hb = Math.max(0.5, r * 2.4), t = [p[0] + up[0] * hb, p[1] + up[1] * hb, p[2] + up[2] * hb];
    this.cyl2(layer, "valve", p, t, r * 0.75, {seg: 10});
    if (o.act) {
      var ra = Math.min(r * 2.2, 0.75), hh = Math.min(r * 0.5, 0.3);
      this.cyl2(layer, "metalDark", t, [t[0] + up[0] * hh, t[1] + up[1] * hh, t[2] + up[2] * hh], ra, {seg: 16});
      this.headDir(layer, "metalDark", [t[0] + up[0] * hh, t[1] + up[1] * hh, t[2] + up[2] * hh], up, ra, ra * 0.5, 16);
    } else {
      var s = Math.max(0.35, r * 0.9), w = [t[0] + up[0] * s, t[1] + up[1] * s, t[2] + up[2] * s];
      this.cyl2(layer, "valve", t, w, Math.max(0.05, r * 0.15), {seg: 6});
      this.cyl2(layer, "wheel", w, [w[0] + up[0] * 0.08, w[1] + up[1] * 0.08, w[2] + up[2] * 0.08], Math.max(0.3, r * 1.6), {seg: 14});
    }
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
  function gLine() {
    if (GC.line) return GC.line;
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([0, -0.5, 0, 0, 0.5, 0], 3));
    return (GC.line = g);
  }
  BP.seg = function (a, c) { var m = mSeg(a, c, 1, 1); if (m) this.E.push({g: gLine(), m: m}); };
  var LAYERS = ["body", "deck", "detail", "access"];
  BP.finish = function () {
    var self = this, grp = new T.Group();
    grp.name = this.kind;
    grp.userData.kind = this.kind;
    grp.userData.kit = "process";
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
      if (this.blobY) { bm.position.y = this.blobY; bm.updateMatrix(); }
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
  function viewSide(eq) { return 2.2 + ((+(eq && eq.rot) || 0) * PI / 180); }
  function pick(eq, sample) {
    var d = {}, k, ed = (eq && eq.dims) || {}, sd = (sample && sample.dims) || {};
    for (k in sd) d[k] = sd[k];
    for (k in ed) if (isFinite(+ed[k]) && +ed[k] > 0) d[k] = +ed[k];
    return {d: d, o: (eq && eq.opts) || {}};
  }
  function reg(name, sample, fn) {
    KIT.kinds[name] = {
      kit: "process",
      sample: sample,
      lod: lod,
      build: function (eq, ctx) {
        var p = pick(eq, sample);
        var b = new Builder(ctx || {THREE: T, style: KIT.style, mats: {}}, name);
        fn(b, p.d, p.o, eq || {});
        return b.finish();
      }
    };
  }
  function buildColumn(b, D, O, eq, vac) {
    var d = D.d, h = D.h, r = d / 2, th0 = ladderTurn(eq);
    var rt = (+O.d_top > 0 ? +O.d_top : (vac ? d * 0.72 : d)) / 2;
    var rb = +O.d_bottom > 0 ? +O.d_bottom / 2 : r;
    var sk = vac ? clamp(h * 0.14, 5, 9) : clamp(h * 0.045, 3, 6);
    var hr = rt * 0.5, yTop = h - hr;
    var prof = [], ysw = 0, yswTop = 0;
    if (rb < r - 0.05) {
      var yb1 = sk + clamp(h * 0.1, 3, 7);
      prof.push([sk, rb], [yb1, rb], [yb1 + (r - rb) * (vac ? 0.75 : 1.2), r]);
    } else prof.push([sk, r]);
    if (rt < r - 0.05) {
      ysw = +O.swage_h > 0 ? +O.swage_h : h * (vac ? 0.5 : 0.55);
      yswTop = ysw + (r - rt) * (vac ? 0.8 : 1.3);
      prof.push([ysw, r], [yswTop, rt]);
    }
    prof.push([yTop, rt]);
    var rMax = Math.max(r, rb, rt);
    function rAt(y) {
      if (y > yTop) { var f = (y - yTop) / hr; return f >= 1 ? 0.01 : rt * Math.sqrt(1 - f * f); }
      if (y < sk) return prof[0][1] * 1.04;
      return profR(prof, y);
    }
    var r0 = prof[0][1];
    plinth(b, 0, 0, r0 * 1.25 + 0.8, 0.8);
    b.vcyl("body", "concrete", 0, 0.8, 0, r0 * 1.05, sk - 0.8, {rTop: r0, seg: segFor(r0) + 8, open: true});
    b.ring(0, 0.8, 0, r0 * 1.053);
    [th0 + PI * 0.75, th0 - PI * 0.75].forEach(function (a) {
      var p = P3(0, 0, r0 * 1.03, a, 0.8 + 1.1);
      b.box("detail", "dark", p[0], p[1], p[2], 0.3, Math.min(1.9, sk - 1.2), Math.min(1.3, r0 * 0.8), -a);
    });
    shell(b, "body", "metal", 0, 0, prof, vac ? 6 : 0);
    b.head("body", "metal", 0, yTop, 0, rt, hr, false, segFor(rt) + 8);
    b.vcyl("detail", "metalDark", 0, h - 0.05, 0, clamp(rt * 0.08, 0.3, 0.7), 0.5, {});
    var sp = h > 60 ? 7.5 : 6.5, lv;
    if (ysw) lv = levelsFrom(sk + 2.6, ysw - 0.9, sp).concat(levelsFrom(yswTop + sp * 0.8, yTop - 0.6, sp));
    else lv = levelsFrom(sk + 2.6, yTop - 0.6, sp);
    var acc = vesselAccess(b, rAt, lv, th0, vac ? {topFull: true, fullEvery: 3} : {topFull: true, vary: true});
    var dvt = clamp(d * 0.02, 0.12, 0.3), ad = th0 - 0.45, pb = P3(0, 0, rt * 0.5, ad, yTop + 0.86 * hr), dTop = h + 3.5, pa = P3(0, 0, rt + 1.1, ad, dTop - 0.2);
    b.bar("detail", "steel", pb, [pb[0], dTop, pb[2]], dvt);
    b.bar("detail", "steel", [pb[0], dTop - 0.2, pb[2]], pa, dvt * 0.8);
    b.bar("detail", "steel", pa, [pa[0], dTop - 1.6, pa[2]], 0.06);
    var ap = th0 + PI, av = viewSide(eq);
    var aE = av + 1.55;
    if (vac) ap = av + PI + 0.35;
    if (!vac) {
      ap = av - 1.3;
      if (O.overhead !== false) {
        var rp = clamp(d * 0.055, 0.15, 1.0), Rp = rMax + 1.7 + rp, q = P3(0, 0, Rp, ap, 0), yo = h + 1.3 + rp, ylow = clamp(h * 0.12, 9, 14);
        b.pipe("body", "metal", [[0, h - 0.3, 0], [0, yo, 0], [q[0], yo, q[2]], [q[0], ylow, q[2]],
          [q[0] + 5 * Math.cos(ap), ylow, q[2] + 5 * Math.sin(ap)]], rp);
        for (var ys = ylow + 6; ys < yTop - 2; ys += 9) b.bar("detail", "steel", P3(0, 0, rAt(ys) - 0.1, ap, ys), P3(0, 0, Rp, ap, ys), 0.3);
      }
    }
    var draws = vac ? [[0.82, ap + 0.2, 0.4], [0.62, ap - 0.2, 0.45], [0.42, ap + 0.36, 0.4]] :
      [[0.78, av - 0.62, 0.3], [0.64, av - 0.3, 0.34], [0.5, av + 0.02, 0.38], [0.37, av + 0.34, 0.42]];
    {
      draws.forEach(function (s, j) {
        var y0 = h * s[0], rs = vac ? clamp(d * 0.02 * s[2] / 0.3, 0.06, 0.45) : clamp(d * 0.024 * s[2] / 0.36, 0.1, 0.5);
        var R = rMax + 1.5 + rs + (vac ? 0 : 1.0), ylo = clamp(h * 0.1, 8, 12) - s[2] * 2 - (vac ? 0 : j * 0.9);
        var A = P3(0, 0, rAt(y0) - 0.1, s[1], y0), B = P3(0, 0, R, s[1], y0), C = P3(0, 0, R, s[1], ylo), E = P3(0, 0, R + 7, s[1], ylo);
        b.pipe("body", "metalDark", [A, B, C, E], rs);
        if (!vac) {
          b.cyl2("body", "steel", P3(0, 0, rAt(y0) + 0.5, s[1], y0), P3(0, 0, rAt(y0) + 0.8, s[1], y0), rs * 1.7, {});
          b.boxB("body", "steel", B[0], y0 - 2.2, B[2], rs * 2.6, 1.0, rs * 2.6, -s[1]);
          var yr2 = y0 + 3.2;
          b.nozzle("body", P3(0, 0, rAt(yr2) - 0.1, s[1] + 0.12, yr2), P3(0, 0, rAt(yr2) + 1.0, s[1] + 0.12, yr2), rs * 0.8);
          for (var yg = ylo + 8; yg < y0 - 3; yg += 10) b.bar("detail", "steel", P3(0, 0, rAt(yg) - 0.1, s[1], yg), P3(0, 0, R, s[1], yg), 0.22);
        }
      });
    }
    var yf = +O.feed_h > 0 ? +O.feed_h : (vac ? sk + (ysw - sk) * 0.4 : h * 0.2);
    if (vac && prof.length > 2 && prof[0][1] < r - 0.05) yf = Math.max(yf, prof[2][0] + 3.0);
    var af = vac ? av + 0.75 : av + 0.55, rf = vac ? clamp(d * 0.07, 0.3, 1.5) : clamp(d * 0.05, 0.1, 1.0);
    var rs0 = rAt(yf), F1 = P3(0, 0, rs0 - 0.2, af, yf), F2 = P3(0, 0, rMax + 3.0 + rf * 3, af, yf), F3 = [F2[0], Math.max(1.0 + rf, yf - (vac ? 9 : 14)), F2[2]];
    if (vac) {
      var Lr = 26, F4 = [F3[0] + 6 * Math.cos(af), F3[1], F3[2] + 6 * Math.sin(af)], F5 = [F3[0] + Lr * Math.cos(af), F3[1], F3[2] + Lr * Math.sin(af)];
      b.pipe("body", "metal", [F1, F2, F3, F4], rf);
      b.cyl2("body", "metal", F4, [F4[0] + 3 * Math.cos(af), F4[1], F4[2] + 3 * Math.sin(af)], rf, {rTop: rf * 0.62});
      b.cyl2("body", "metal", [F4[0] + 3 * Math.cos(af), F4[1], F4[2] + 3 * Math.sin(af)], F5, rf * 0.62, {});
      b.cyl2("body", "metalDark", [F5[0] - 0.4 * Math.cos(af), F5[1], F5[2] - 0.4 * Math.sin(af)], F5, rf * 0.85, {});
      [10, 18].forEach(function (t) {
        var c = [F3[0] + t * Math.cos(af), 0, F3[2] + t * Math.sin(af)], ys = F3[1] - rf * 0.62 - 0.1;
        b.boxB("body", "concrete", c[0], 0, c[2], 1.4, 0.5, 1.4, -af);
        b.boxB("body", "steel", c[0], 0.5, c[2], 0.5, ys - 0.7, 0.5, -af);
        b.box("body", "steel", c[0], ys - 0.15, c[2], 0.5, 0.35, rf * 2.6, -af);
      });
    } else
    b.pipe("body", "metal", [F1, F2, F3, [F3[0] + 8 * Math.cos(af), F3[1], F3[2] + 8 * Math.sin(af)]], rf);
    b.cyl2("body", "metalDark", P3(0, 0, rs0 + 0.2, af, yf), P3(0, 0, rs0 + 0.7, af, yf), rf * 1.35, {});
    b.cyl2("body", "metalDark", P3(0, 0, rMax + 1.4, af, yf), P3(0, 0, rMax + 1.9, af, yf), rf * 1.3, {});
    [-1, 1].forEach(function (sd) {
      var px = F3[0] - Math.sin(af) * sd * rf * 1.2, pz = F3[2] + Math.cos(af) * sd * rf * 1.2;
      b.bar("body", "steel", [px, 0, pz], [px, F3[1] - rf, pz], 0.3);
    });
    b.bar("body", "steel", [F3[0] - Math.sin(af) * rf * 1.3, F3[1] - rf - 0.15, F3[2] + Math.cos(af) * rf * 1.3],
      [F3[0] + Math.sin(af) * rf * 1.3, F3[1] - rf - 0.15, F3[2] - Math.cos(af) * rf * 1.3], 0.3);
    b.pipe("body", "metalDark", [P3(0, 0, r0 * 0.5, af + 0.9, 1.6), P3(0, 0, rMax + 3, af + 0.9, 1.6)], clamp(d * 0.025, 0.08, 0.5));
    var nst = +O.strippers > 0 ? Math.round(+O.strippers) : ((!vac && d >= 12 && b.ctx && b.ctx.solo && b.ctx.solo === eq.id) ? 2 : 0);
    for (var js = 0; js < nst; js++) {
      var ds = clamp(d * 0.19, 1.5, 3.5), rS = ds / 2, hS = clamp(h * 0.14, 8, 18), aS = av + 1.15 + js * 0.42, RS = rMax + 6 + rS;
      var cS = P3(0, 0, RS, aS, 0), skS = 2.4, yTS = hS - rS * 0.5;
      plinth(b, cS[0], cS[2], rS + 0.8, 0.4);
      b.vcyl("body", "concrete", cS[0], 0.4, cS[2], rS * 1.04, skS - 0.4, {open: true});
      shell(b, "body", "metal", cS[0], cS[2], [[skS, rS], [yTS, rS]], 0);
      b.head("body", "metal", cS[0], yTS, cS[2], rS, rS * 0.5);
      (function (cx, cz, rr0, yT0) {
        vesselAccess(b, function (y) { if (y > yT0) { var f = Math.min(1, (y - yT0) / (rr0 * 0.5)); return Math.max(0.01, rr0 * Math.sqrt(1 - f * f)); } return rr0; },
          [yT0 * 0.55, yT0 - 0.3], aS + PI / 2, {cx: cx, cz: cz, topFull: true, manways: false, minSpan: 2.4});
      })(cS[0], cS[2], rS, yTS);
      var yDr = h * (0.42 + js * 0.12), pA = P3(0, 0, rAt(yDr) - 0.1, aS - 0.08, yDr), pB = P3(0, 0, RS, aS - 0.08, yDr);
      var tS = [cS[0], hS + 0.3, cS[2]];
      b.pipe("body", "metalDark", [pA, pB, [pB[0], hS + 2.2, pB[2]], [tS[0], hS + 2.2, tS[2]], tS], 0.28);
      var yRt = yDr + 4, pC = P3(0, 0, rAt(yRt) - 0.1, aS + 0.08, yRt), pD = P3(0, 0, RS - rS * 0.4, aS + 0.08, yRt);
      b.pipe("body", "metal", [pC, pD, [pD[0], yTS + rS * 0.3, pD[2]]], 0.24);
      b.pipe("body", "metalDark", [[cS[0], skS * 0.6, cS[2]], P3(0, 0, RS + rS + 3, aS, skS * 0.6)], 0.2);
      b.blob(cS[0], cS[2], ds + 3, ds + 3);
    }
    if (vac) {
      var cu = Math.cos(aE), su = Math.sin(aE);
      var E = function (u, t, y) { return [u * cu - t * su, y, u * su + t * cu]; };
      var Ez = function (u, t) { var p = E(u, t, 0); return [p[0], p[2]]; };
      var yDk = yTop - 0.6, Ra = rt + 2.6, R0 = rMax + 1.4, R1 = Math.max(rMax + 8.5, Ra + 10.6), tw = 3.6, sc = 1.0;
      var legs = [[R0, -tw], [R1, -tw], [R1, tw], [R0, tw]];
      legs.forEach(function (q) { b.bar("body", "steel", E(q[0], q[1], 0), E(q[0], q[1], yDk - 0.25), 0.5); });
      legs.forEach(function (q) { var p = E(q[0], q[1], 0); b.boxB("body", "concrete", p[0], 0, p[2], 1.3, 0.5, 1.3, -aE); });
      var nlv = Math.max(3, Math.round(yDk / 8)), ylv = [];
      for (var il = 1; il <= nlv; il++) ylv.push(yDk * il / nlv - (il === nlv ? 0.3 : 0));
      ylv.forEach(function (yy, il) {
        for (var q = 0; q < 4; q++) b.bar("body", "steel", E(legs[q][0], legs[q][1], yy), E(legs[(q + 1) % 4][0], legs[(q + 1) % 4][1], yy), 0.35);
        var ya = il ? ylv[il - 1] : 0.5;
        [[1, 2], [0, 1], [2, 3]].forEach(function (f) {
          var A0 = legs[f[0]], A1 = legs[f[1]];
          b.bar("body", "steel", E(A0[0], A0[1], ya), E(A1[0], A1[1], yy), 0.22);
          b.bar("body", "steel", E(A1[0], A1[1], ya), E(A0[0], A0[1], yy), 0.22);
        });
      });
      var dc0 = rt + 1.0, dc1 = R1 + 0.6, pm = E((dc0 + dc1) / 2, 0, yDk - 0.15);
      b.box("deck", "deck", pm[0], pm[1], pm[2], dc1 - dc0, 0.3, 2 * tw + 1.2, -aE, true);
      b.rail([Ez(dc0 + 1.2, -tw - 0.55), Ez(dc1, -tw - 0.55), Ez(dc1, tw + 0.55), Ez(dc0 + 1.2, tw + 0.55)], yDk, false);
      [-tw, tw].forEach(function (t) { b.bar("deck", "steel", E(rt, t * 0.6, yDk - 4.5), E(dc0 + 1.5, t, yDk - 0.3), 0.3); });
      var rv = clamp(rt * 0.13, 0.4, 1.0), yG = h + 1.6 + rv, yH = yDk + 2.2;
      b.pipe("body", "metal", [[0, h - 0.3, 0], [0, yG, 0], E(Ra, 0, yG), E(Ra, 0, yH)], rv);
      b.cyl2("body", "metal", E(Ra, -tw + 0.6, yH), E(Ra, tw - 0.6, yH), rv * 0.8, {});
      b.vcyl("body", "metalDark", E(Ra, 0, 0)[0], yG - rv * 0.2, E(Ra, 0, 0)[2], rv * 1.3, 0.35, {});
      var rc1 = 1.6, rc2 = 1.05, tc1 = -1.9, tc2 = 2.1, yc1 = yDk + 0.7 + rc1, yc2 = yDk + 0.7 + rc2, ua = Ra + 1.6, ub = R1 - 0.3;
      [[tc1, rc1, yc1], [tc2, rc2, yc2]].forEach(function (c) {
        b.cyl2("body", "metalDark", E(ua, c[0], c[2]), E(ub, c[0], c[2]), c[1], {edge: true});
        b.headDir("body", "metalDark", E(ub, c[0], c[2]), [cu, 0, su], c[1], c[1] * 0.5);
        b.headDir("body", "metalDark", E(ua, c[0], c[2]), [-cu, 0, -su], c[1], c[1] * 0.5);
        [ua + 1.2, ub - 1.2].forEach(function (u) { var p = E(u, c[0], yDk); b.boxB("body", "steel", p[0], yDk, p[2], 0.4, c[2] - c[1] * 0.4 - yDk, c[1] * 1.5, -aE); });
        b.pipe("body", "metal", [E(ub - 0.6, c[0], c[2] - c[1]), E(ub - 0.6, c[0], yDk - 0.7), E(R1 + 0.9, c[0] * 0.5, yDk - 0.7),
          E(R1 + 0.9, c[0] * 0.5, 2.6)], 0.32);
      });
      function ejector(u0, u1, t, y, s) {
        var L = u1 - u0;
        b.cyl2("body", "metal", E(u0, t, y), E(u0 + L * 0.25, t, y), 0.55 * s, {rTop: 0.22 * s});
        b.cyl2("body", "metal", E(u0 + L * 0.25, t, y), E(u0 + L * 0.42, t, y), 0.22 * s, {});
        b.cyl2("body", "metal", E(u0 + L * 0.42, t, y), E(u1, t, y), 0.22 * s, {rTop: 0.5 * s});
        b.cyl2("body", "metalDark", E(u0 - 0.35, t, y), E(u0 + 0.05, t, y), 0.75 * s, {});
        b.cyl2("body", "metalDark", E(u1 - 0.05, t, y), E(u1 + 0.3, t, y), 0.7 * s, {});
        b.pipe("detail", "white", [E(u0 + L * 0.08, t, y + 0.4 * s), E(u0 + L * 0.08, t, y + 1.7)], 0.15);
        b.pipe("body", "metal", [E(u1 + 0.3, t, y), E(u1 + 0.9, t, y), E(u1 + 0.9, t, y - 0.9)], 0.42 * s);
      }
      var yE1 = yc1 + rc1 + 0.9, yE2 = yc2 + rc2 + 0.8;
      [tc1 - 0.75, tc1 + 0.75].forEach(function (t) {
        b.pipe("body", "metal", [E(Ra, t, yH), E(Ra, t, yE1), E(Ra + 0.6, t, yE1)], rv * 0.5);
        ejector(Ra + 1.0, Ra + 6.2, t, yE1, 1.25);
      });
      b.pipe("body", "metal", [E(Ra + 3.0, tc1, yc1 + rc1 * 0.7), E(Ra + 3.0, tc1, yE1 + 1.8), E(Ra + 3.0, tc2, yE1 + 1.8), E(Ra + 3.0, tc2, yE2), E(Ra + 3.6, tc2, yE2)], 0.38);
      ejector(Ra + 4.0, Ra + 8.4, tc2, yE2, 0.95);
      b.pipe("body", "metal", [E(ub - 1.6, tc2, yc2 + rc2 * 0.8), E(ub - 1.6, tc2, yE2 + 3.5)], 0.25);
      b.cyl2("detail", "white", E(Ra - 0.4, -tw + 0.2, yE1 + 1.4), E(Ra - 0.4, tw - 0.2, yE1 + 1.4), 0.18, {seg: 8});
      var hw = E(R1 + 0.9, 0, 0);
      b.cyl2("body", "metalDark", E(R1 + 0.9, -tw, 1.8), E(R1 + 0.9, tw, 1.8), 1.1, {edge: true});
      [-tw * 0.6, tw * 0.6].forEach(function (t) { var p = E(R1 + 0.9, t, 0); b.boxB("body", "concrete", p[0], 0, p[2], 2.0, 0.8, 0.6, -aE); });
      void hw;
      ylv.forEach(function (yy, il) {
        var ya = il ? ylv[il - 1] : 0, p = E(R1 + 0.5, -tw - 1.2, 0);
        b.ladder(p[0], p[2], ya, yy + 1.1, cu, su, ya + 2.4);
        if (il < ylv.length - 1) {
          var lc = E(R1 + 0.6, -tw - 1.2, yy - 0.12);
          b.box("deck", "deck", lc[0], lc[1], lc[2], 1.6, 0.25, 1.6, -aE);
        }
      });
    }
    b.blob(0, 0, rMax * 2 + 6, rMax * 2 + 6);
  }
  reg("column", {dims: {d: 16.1, h: 112.5}, opts: {feed_h: 22, trays: 50}}, function (b, D, O, eq) { buildColumn(b, D, O, eq, false); });
  reg("vacuum_column", {dims: {d: 19.5, h: 55}, opts: {d_top: 14}}, function (b, D, O, eq) { buildColumn(b, D, O, eq, true); });
  reg("drum_v", {dims: {d: 3.5, h: 12}}, function (b, D, O, eq) {
    var d = D.d, h = D.h, r = d / 2, hr = r * 0.5, th0 = ladderTurn(eq), legs = d <= 2.4 || O.legs === true;
    var sk = legs ? 1.8 : clamp(h * 0.18, 1.8, 3.5), yBot = legs ? sk + hr : sk, yTop = h - hr;
    function rAt(y) { if (y > yTop) { var f = Math.min(1, (y - yTop) / hr); return Math.max(0.01, r * Math.sqrt(1 - f * f)); } return r; }
    plinth(b, 0, 0, r * 1.3 + 0.5, 0.4);
    if (legs) {
      b.head("body", "metal", 0, yBot, 0, r, hr, true);
      for (var i = 0; i < 4; i++) {
        var a = th0 + PI / 4 + i * PI / 2, p = P3(0, 0, r * 0.92, a, 0);
        b.boxB("body", "steel", p[0], 0.4, p[2], 0.25, yBot + 0.6 - 0.4, 0.25, -a);
        b.boxB("detail", "concrete", p[0], 0.0, p[2], 0.6, 0.45, 0.6, -a);
      }
    } else {
      b.vcyl("body", "concrete", 0, 0.4, 0, r * 1.02, sk - 0.4, {open: true});
      var so = P3(0, 0, r * 1.0, th0 + PI, 1.2);
      b.box("detail", "dark", so[0], so[1], so[2], 0.2, 1.2, 0.9, -(th0 + PI));
    }
    shell(b, "body", "metal", 0, 0, [[yBot, r], [yTop, r]], 2.4);
    b.head("body", "metal", 0, yTop, 0, r, hr);
    b.nozzle("detail", [r * 0.4, yTop + hr * 0.85, 0], [r * 0.4, h + 0.7, 0], clamp(r * 0.16, 0.12, 0.4));
    b.nozzle("detail", [-r * 0.35, yTop + hr * 0.88, r * 0.2], [-r * 0.35, h + 0.5, r * 0.2], clamp(r * 0.1, 0.08, 0.25));
    b.boxB("detail", "metalDark", -r * 0.35, h + 0.5, r * 0.2, clamp(r * 0.25, 0.15, 0.4), clamp(r * 0.35, 0.2, 0.6), clamp(r * 0.25, 0.15, 0.4));
    var ag = th0 + PI * 0.55, yg0 = yBot + 0.6, yg1 = yTop - 0.4, rg = r + 0.55;
    b.cyl2("detail", "metalDark", P3(0, 0, rg, ag, yg0), P3(0, 0, rg, ag, yg1), 0.09, {seg: 8});
    b.bar("detail", "metalDark", P3(0, 0, r, ag, yg0 + 0.3), P3(0, 0, rg, ag, yg0 + 0.3), 0.1);
    b.bar("detail", "metalDark", P3(0, 0, r, ag, yg1 - 0.3), P3(0, 0, rg, ag, yg1 - 0.3), 0.1);
    var ai = th0 + PI;
    b.nozzle("detail", P3(0, 0, r - 0.1, ai, yTop - 0.8), P3(0, 0, r + 0.6, ai, yTop - 0.8), clamp(r * 0.13, 0.12, 0.35));
    b.nozzle("detail", P3(0, 0, r - 0.1, ai + 0.5, yBot + 0.8), P3(0, 0, r + 0.6, ai + 0.5, yBot + 0.8), clamp(r * 0.11, 0.1, 0.3));
    if (h >= 5) vesselAccess(b, rAt, h > 14 ? levelsFrom(yBot + 3, yTop - 0.4, 7) : [yTop - 0.4], th0, {minSpan: 2.4, manways: false});
    b.blob(0, 0, d + 4, d + 4);
  });
  function hVessel(b, mat, yc, zc, r, l, hrF, x0) {
    var hr = r * (hrF || 0.5), Ls = Math.max(0.5, l - 2 * hr), xa = (x0 || 0) - Ls / 2, xb = (x0 || 0) + Ls / 2;
    b.cyl2("body", mat, [xa, yc, zc], [xb, yc, zc], r, {seg: segFor(r) + 8, open: true});
    b.headDir("body", mat, [xb, yc, zc], [1, 0, 0], r, hr, segFor(r) + 8);
    b.headDir("body", mat, [xa, yc, zc], [-1, 0, 0], r, hr, segFor(r) + 8);
    b.ringDir([xa, yc, zc], [1, 0, 0], r * 1.003);
    b.ringDir([xb, yc, zc], [1, 0, 0], r * 1.003);
    var ns = Math.max(1, Math.round(Ls / 2.4));
    for (var i = 1; i < ns; i++) b.ringDir([xa + Ls * i / ns, yc, zc], [1, 0, 0], r * 1.003, 48);
    return {xa: xa, xb: xb, Ls: Ls, hr: hr};
  }
  function saddle(b, x, yc, zc, r) {
    var yb = yc - r, ph = Math.max(0.3, yb - r * 0.25);
    b.boxB("body", "concrete", x, 0, zc, 0.9, ph, r * 1.7 + 0.3, 0, true);
    b.boxB("body", "steel", x, ph, zc, 0.35, (yc - r * 0.35) - ph, r * 1.6, 0, true);
  }
  reg("drum_h", {dims: {d: 4, l: 14}}, function (b, D, O) {
    var d = D.d, l = D.l, r = d / 2, yc = (+O.elev > 0 ? +O.elev : clamp(d * 0.35, 1.2, 2.2)) + r;
    var V = hVessel(b, "metal", yc, 0, r, l);
    saddle(b, -V.Ls * 0.3, yc, 0, r);
    saddle(b, V.Ls * 0.3, yc, 0, r);
    [[-0.38, 0.14], [-0.05, 0.2], [0.32, 0.12], [0.42, 0.09]].forEach(function (n) {
      var x = V.Ls * n[0], rr = clamp(d * n[1] * 0.5, 0.1, 0.45);
      b.nozzle("detail", [x, yc + r - 0.1, 0], [x, yc + r + 0.65, 0], rr);
    });
    b.nozzle("detail", [V.xb + V.hr * 0.8, yc, 0], [V.xb + V.hr + 0.5, yc, 0], clamp(r * 0.2, 0.3, 0.45));
    if (O.boot !== false && l / d > 2.5) {
      var rbt = clamp(r * 0.3, 0.3, 0.8), xbt = V.Ls * 0.38, ybt = Math.max(0.6, yc - r - 1.6);
      b.vcyl("body", "metal", xbt, ybt, 0, rbt, yc - r * 0.8 - ybt, {open: true});
      b.head("body", "metal", xbt, ybt, 0, rbt, rbt * 0.5, true);
    }
    if (!(+O.elev > 0) && r > 1.2) {
      var yp = yc + r + 0.3, px0 = -V.Ls * 0.32, px1 = -V.Ls * 0.32 + 3.2;
      b.platform(px0, -0.9, px1, r + 1.0, yp, "nsew");
      b.bar("deck", "steel", [px0 + 0.2, yc + r * 0.3, r + 0.8], [px0 + 0.2, yp, r + 0.8], 0.15);
      b.bar("deck", "steel", [px1 - 0.2, yc + r * 0.3, r + 0.8], [px1 - 0.2, yp, r + 0.8], 0.15);
      b.ladder(px0 + 1.5, r + 1.2, 0, yp + 1.1, 0, 1, 2.4);
    }
    b.blob(0, 0, l + 3, d + 3, true);
  });
  reg("reactor", {dims: {d: 5.64, h: 23.4}}, function (b, D, O, eq) {
    var d = D.d, h = D.h, r = d / 2, th0 = ladderTurn(eq), av = viewSide(eq);
    var rsk = r * 0.8, sk = clamp(h * 0.22, 4.0, 7.0), yTan = sk + r * Math.sqrt(1 - 0.64), yTop = h - r;
    function rAt(y) {
      if (y > yTop) { var f = Math.min(1, (y - yTop) / r); return Math.max(0.01, r * Math.sqrt(1 - f * f)); }
      if (y < sk) return rsk * 1.04;
      if (y < yTan) { var g = Math.min(1, (yTan - y) / r); return Math.max(rsk, r * Math.sqrt(1 - g * g)); }
      return r;
    }
    function A(a, rr, y) { return P3(0, 0, rr, a, y); }
    plinth(b, 0, 0, r * 1.25 + 0.8, 0.8);
    b.vcyl("body", "concrete", 0, 0.8, 0, rsk * 1.06, sk - 0.8, {rTop: rsk, open: true, edge: true});
    b.vcyl("body", "dark", 0, sk - 0.35, 0, rsk * 1.02, 0.35, {open: true});
    var so = A(av + 0.3, rsk * 1.04, 2.0);
    b.box("detail", "dark", so[0], so[1], so[2], 0.25, 2.0, 1.2, -(av + 0.3));
    for (var iv = 0; iv < 4; iv++) { var pv = A(iv * PI / 2 + 0.2, rsk * 1.0, sk - 0.9); b.box("detail", "dark", pv[0], pv[1], pv[2], 0.15, 0.35, 0.35, -(iv * PI / 2 + 0.2)); }
    var seg = segFor(r) + 8;
    b.head("body", "forged", 0, yTan, 0, r, r, true, seg);
    shell(b, "body", "forged", 0, 0, [[yTan, r], [yTop, r]], 0);
    b.head("body", "forged", 0, yTop, 0, r, r, false, seg);
    var beds = [0.0, 0.36, 0.69, 1.0].map(function (f) { return yTan + (yTop - yTan) * f; });
    [yTan, beds[1], beds[2], yTop].forEach(function (y) { b.vcyl("body", "dark", 0, y - 0.12, 0, r * 1.012, 0.24, {seg: seg, open: true}); });
    var rn = clamp(d * 0.12, 0.35, 0.9), yN = h + 1.0;
    b.vcyl("body", "forged", 0, h - 0.3, 0, rn * 1.3, yN - h + 0.3, {});
    [0, 0.45].forEach(function (dy) { b.vcyl("body", "dark", 0, yN + dy, 0, rn * 1.9, 0.4, {edge: true}); });
    var ain = av - 1.0, rp = rn * 0.9, Rq = r + 2.2 + rp, q = A(ain, Rq, 0), yEl = Math.max(sk + 2, yTop * 0.32);
    var yP = yN + 1.2 + 1.6 + rp, e1 = A(ain, 1.6, 0);
    b.pipe("body", "metal", [[0, yN + 0.85, 0], [0, yP - 1.2, 0], [e1[0], yP, e1[2]], [q[0], yP, q[2]], [q[0], yEl, q[2]],
      [q[0] + 6 * Math.cos(ain), yEl, q[2] + 6 * Math.sin(ain)]], rp);
    [(1.6 + Rq) / 2, (1.6 + Rq) / 2 + 1.2].forEach(function (u) { var fp = A(ain, u, yP), fd = [Math.cos(ain) * 0.12, 0, Math.sin(ain) * 0.12];
      b.cyl2("body", "metalDark", [fp[0] - fd[0], fp[1], fp[2] - fd[2]], [fp[0] + fd[0], fp[1], fp[2] + fd[2]], rp * 1.35, {}); });
    for (var yb = yEl + 4; yb < yTop - 1; yb += 4.5) {
      var pa = A(ain, r - 0.05, yb), pq = A(ain, Rq, yb);
      b.bar("body", "steel", pa, pq, 0.3);
      b.bar("body", "steel", A(ain, r - 0.05, yb - 1.4), A(ain, Rq - rp, yb - 0.1), 0.2);
      b.vcyl("body", "steel", pq[0], yb - 0.2, pq[2], rp * 1.25, 0.4, {open: true});
    }
    var qe = [q[0] + 4.5 * Math.cos(ain), 0, q[2] + 4.5 * Math.sin(ain)];
    b.boxB("body", "steel", qe[0], 0.8, qe[2], 0.5, yEl - rp - 0.8, 0.5);
    b.boxB("body", "concrete", qe[0], 0, qe[2], 1.3, 0.8, 1.3);
    b.box("body", "steel", qe[0], yEl - rp - 0.15, qe[2], 1.7, 0.3, 1.7, -ain);
    var aq = av + 0.55, rqh = clamp(r * 0.075, 0.18, 0.3), Rh = r + 2.4, hq = A(aq, Rh, 0);
    b.pipe("body", "pipeA", [A(aq, r + 7, 1.0), A(aq, Rh, 1.0), A(aq, Rh, beds[2] + 0.2)], rqh);
    [beds[1], beds[2]].forEach(function (yq) {
      var N0 = A(aq, r - 0.1, yq), N1 = A(aq, r + 0.7, yq), N2 = A(aq, r + 0.95, yq);
      b.cyl2("body", "forged", N0, N1, rqh * 1.5, {});
      b.cyl2("body", "dark", N1, N2, rqh * 2.6, {});
      b.pipe("body", "pipeA", [N2, A(aq, Rh, yq)], rqh);
      var mid = A(aq, (r + 0.95 + Rh) / 2, yq), dir = [Math.cos(aq), 0, Math.sin(aq)];
      b.valve("body", A(aq, Rh, yq - 1.6), [0, 1, 0], rqh, [Math.cos(aq + PI / 2), 0, Math.sin(aq + PI / 2)], {act: true});
      b.valve("body", mid, dir, rqh, [0, 1, 0]);
    });
    void hq;
    var at = av - 0.3;
    [0.2, 0.5, 0.82].forEach(function (f, j) {
      var yt = beds[j] + (beds[j + 1] - beds[j]) * 0.5;
      [-0.18, 0.18].forEach(function (da) {
        var a = at + da, n0 = A(a, r - 0.05, yt), n1 = A(a, r + 0.55, yt), n2 = A(a, r + 0.75, yt);
        b.cyl2("detail", "forged", n0, n1, 0.16, {seg: 10});
        b.cyl2("detail", "dark", n1, n2, 0.28, {seg: 10});
        var pj = A(a, r + 1.0, yt);
        b.box("detail", "metalDark", pj[0], yt, pj[2], 0.28, 0.34, 0.28, -a);
        b.bar("detail", "cable", A(a, r + 1.0, yt - 0.3), A(a, r + 1.0, yt - 2.2), 0.07);
      });
      void f;
    });
    [beds[0] + 0.9, beds[1] + 0.9, beds[2] + 0.9, beds[3] - 0.9].forEach(function (yr, ir) {
      for (var q = 0; q < 6; q++) {
        var a = q * PI / 3 + (ir % 2 ? PI / 6 : 0);
        b.cyl2("detail", "forged", A(a, r - 0.05, yr), A(a, r + 0.32, yr), 0.11, {seg: 6, open: true});
        b.cyl2("detail", "metalDark", A(a, r + 0.32, yr), A(a, r + 0.42, yr), 0.2, {seg: 6});
      }
    });
    [beds[1], beds[2]].forEach(function (yq) {
      var yr = yq - 0.55, rr = r + 1.15, nr = 16;
      for (var q = 0; q < nr; q++) b.cyl2("body", "pipeA", A(TAU * q / nr, rr, yr), A(TAU * (q + 1) / nr, rr, yr), 0.16, {seg: 6, open: true});
      for (q = 0; q < 4; q++) {
        var a = aq + PI / 4 + q * PI / 2;
        b.cyl2("body", "pipeA", A(a, rr, yr), A(a, r + 0.55, yr), 0.12, {seg: 6, open: true});
        b.cyl2("body", "pipeA", A(a, r + 0.55, yr - 0.12), A(a, r + 0.55, yq - 0.15), 0.12, {seg: 6, open: true});
        b.cyl2("body", "forged", A(a, r - 0.05, yq - 0.15), A(a, r + 0.67, yq - 0.15), 0.16, {seg: 6});
        b.bar("deck", "steel", A(a + 0.18, r - 0.05, yr - 0.6), A(a + 0.18, rr, yr - 0.2), 0.12);
      }
    });
    var au = av + 0.15, U0 = A(au, r * 0.45, yTan - r * 0.88), U1 = A(au, rsk + 1.4, sk * 0.45);
    b.cyl2("body", "forged", U0, U1, clamp(r * 0.11, 0.25, 0.4), {});
    var Uf = A(au, rsk + 1.75, sk * 0.45 - 0.25);
    b.cyl2("body", "dark", U1, Uf, clamp(r * 0.11, 0.25, 0.4) * 1.9, {});
    var ro = clamp(r * 0.13, 0.25, 0.5), ao = av - 0.7;
    b.pipe("body", "metal", [[0, yTan - r + 0.2, 0], [0, sk * 0.5, 0], A(ao, r + 3, sk * 0.5), A(ao, r + 3, 0.9), A(ao, r + 9, 0.9)], ro);
    b.valve("body", A(ao, r + 3, sk * 0.5 + 0.0 - 0.0), [Math.cos(ao), 0, Math.sin(ao)], ro, [0, 1, 0]);
    var am = th0 + PI * 0.5, pm = A(am, r * 0.62, yTop + r * 0.78);
    b.cyl2("detail", "forged", A(am, r * 0.5, yTop + r * 0.85), [pm[0], pm[1] + 0.9, pm[2]], 0.48, {});
    b.vcyl("detail", "dark", pm[0], pm[1] + 0.9, pm[2], 0.66, 0.3, {});
    var ad = am + PI * 0.75, pd = A(ad, r + 0.9, yTop - 0.4);
    var yDv = h + 3.4, pd2 = A(ad, r * 0.1, yDv);
    b.boxB("body", "crane", pd[0], yTop - 0.4, pd[2], 0.4, yDv - yTop + 0.9, 0.4);
    b.bar("body", "crane", [pd[0], yDv + 0.3, pd[2]], pd2, 0.4);
    b.bar("body", "crane", [pd[0], yDv - 1.4, pd[2]], A(ad, r * 0.75, yDv + 0.1), 0.2);
    b.bar("detail", "cable", pd2, [pd2[0], yDv - 1.6, pd2[2]], 0.06);
    b.boxB("detail", "crane", pd2[0], yDv - 2.1, pd2[2], 0.4, 0.5, 0.3);
    var ah = am - PI * 0.6, ph = A(ah, r + 0.75, yTop - 0.4);
    [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(function (c) { b.bar("detail", "steel", [ph[0] + c[0], yTop - 0.4, ph[2] + c[1]], [ph[0] + c[0], yTop + 1.6, ph[2] + c[1]], 0.1); });
    b.frustum("detail", "crane", ph[0], yTop + 1.2, ph[2], 0.35, 0.35, 1.5, 1.5, 1.0, true);
    b.boxB("detail", "crane", ph[0], yTop + 2.2, ph[2], 1.5, 0.7, 1.5, 0, true);
    var rlv = (h > 28 && h / d < 6) ? [yTan + (yTop - yTan) * 0.5] : [];
    vesselAccess(b, rAt, rlv.concat([yTop - 0.4]), th0, {topFull: true, manways: false, minSpan: 2.0});
    b.blob(0, 0, d + 6, d + 6);
  });
  reg("desalter", {dims: {d: 4.5, l: 24}, opts: {n: 2}}, function (b, D, O, eq) {
    var d = D.d, l = D.l, r = d / 2, n = clamp(Math.round(+O.n || 2), 1, 6), gap = 3.4, pitch = d + gap;
    var yc = r + 1.6, ytop = yc + r, zs = [], i;
    for (i = 0; i < n; i++) zs.push((i - (n - 1) / 2) * pitch);
    var nsad = l > 26 ? 3 : 2, ntr = l > 20 ? 3 : 2, V, sideZ = Math.sin(viewSide(eq)) >= 0 ? 1 : -1;
    zs.forEach(function (z, iv) {
      V = hVessel(b, "metal", yc, z, r, l);
      for (var k = 0; k < nsad; k++) saddle(b, -V.Ls * 0.38 + V.Ls * 0.76 * k / (nsad - 1), yc, z, r);
      var so = n === 1 ? sideZ : (z >= 0 ? 1 : -1), zo = z + so * r;
      for (k = 0; k < ntr; k++) {
        var xt = -V.Ls * 0.32 + V.Ls * 0.64 * k / (ntr - 1), yT0 = ytop + 0.35;
        b.boxB("body", "steel", xt, ytop - 0.15, z, 3.0, 0.5, 2.0, 0, true);
        [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz2) { b.bar("body", "steel", [xt + sx * 1.3, ytop - 0.1, z + sz2 * 0.9], [xt + sx * 1.0, yc + r * 0.55, z + sz2 * r * 0.6], 0.18); }); });
        b.boxB("body", "trafo", xt, yT0, z, 2.0, 2.2, 1.3, 0, true);
        b.boxB("body", "trafo", xt, yT0 + 2.2, z, 2.15, 0.14, 1.45, 0, false);
        for (var f = 0; f < 6; f++) [-1, 1].forEach(function (s) {
          b.boxB("body", "trafo", xt - 0.8 + f * 0.32, yT0 + 0.2, z + s * 1.2, 0.1, 1.85, 1.0);
        });
        [-1, 1].forEach(function (s) { [yT0 + 0.35, yT0 + 1.9].forEach(function (yh) {
          b.cyl2("body", "dark", [xt - 0.9, yh, z + s * 0.8], [xt + 0.9, yh, z + s * 0.8], 0.09, {seg: 6}); }); });
        [-1, 1].forEach(function (s) { b.cyl2("body", "trafo", [xt - 0.9, yT0 + 0.35, z + s * 0.68], [xt + 0.9, yT0 + 0.35, z + s * 0.68], 0.07, {seg: 6}); });
        b.cyl2("body", "trafo", [xt - 0.8, yT0 + 2.95, z - so * 0.35], [xt + 0.7, yT0 + 2.95, z - so * 0.35], 0.3, {seg: 12, edge: true});
        b.bar("detail", "steel", [xt - 0.6, yT0 + 2.3, z - so * 0.35], [xt - 0.6, yT0 + 2.7, z - so * 0.35], 0.1);
        b.bar("detail", "steel", [xt + 0.5, yT0 + 2.3, z - so * 0.35], [xt + 0.5, yT0 + 2.7, z - so * 0.35], 0.1);
        var xb2 = xt + 0.55, zb2 = z + so * 0.3, yb0 = yT0 + 2.3;
        b.vcyl("body", "porcelain", xb2, yb0, zb2, 0.12, 1.4, {seg: 10});
        for (var s2 = 0; s2 < 6; s2++) b.vcyl("body", "porcelain", xb2, yb0 + 0.12 + s2 * 0.21, zb2, 0.26, 0.08, {seg: 12});
        b.vcyl("body", "metalDark", xb2, yb0 + 1.4, zb2, 0.17, 0.2, {seg: 10});
        var xe = xt + 2.15, ye = yb0 + 1.6;
        b.cyl2("body", "metal", [xe, ytop - 0.15, zb2], [xe, ytop + 0.45, zb2], 0.38, {seg: 12});
        b.cyl2("body", "metalDark", [xe, ytop + 0.45, zb2], [xe, ytop + 0.62, zb2], 0.55, {seg: 12});
        b.vcyl("body", "porcelain", xe, ytop + 0.62, zb2, 0.14, 1.7, {seg: 10});
        for (var s3 = 0; s3 < 7; s3++) b.vcyl("body", "porcelain", xe, ytop + 0.75 + s3 * 0.22, zb2, 0.27, 0.08, {seg: 12});
        b.vcyl("body", "metalDark", xe, ytop + 2.32, zb2, 0.18, 0.2, {seg: 10});
        b.box("body", "metalDark", xb2, ye + 0.3, zb2, 0.42, 0.9, 0.42, 0, true);
        b.box("body", "metalDark", (xb2 + xe) / 2, ye + 0.75, zb2, xe - xb2 + 0.42, 0.42, 0.42, 0, true);
        b.box("body", "metalDark", xe, (ye + 0.75 + ytop + 2.4) / 2, zb2, 0.42, ye + 0.75 - ytop - 2.4, 0.42, 0, true);
        b.boxB("detail", "valve", xt - 1.15, yT0 + 0.5, z - so * 0.35, 0.3, 0.7, 0.55);
      }
      var zc = z - (n === 1 ? -so : so) * (r + 0.55);
      b.boxB("body", "steel", V.xa + 1.0, 0, zc, 0.6, ytop + 0.7, 0.12, 0, false);
      b.box("body", "steel", 0, ytop + 0.75, zc, V.Ls * 0.7, 0.12, 0.45);
      var mh = [V.xa - V.hr * 0.75, yc, z];
      b.cyl2("detail", "metal", [V.xa - V.hr * 0.5, yc, z], [V.xa - V.hr - 0.45, yc, z], 0.38, {});
      b.cyl2("detail", "metalDark", [V.xa - V.hr - 0.45, yc, z], [V.xa - V.hr - 0.7, yc, z], 0.6, {});
      b.bar("detail", "steel", [V.xa - V.hr * 0.6, yc + 0.7, z + 0.5], [V.xa - V.hr - 0.6, yc + 0.95, z + 0.5], 0.1);
      void mh;
      var yIn = yc - r * 0.45, rin = clamp(r * 0.2, 0.3, 0.45), zIn = zo + so * 1.3, zF = zo + so * 2.6, xIn = [-V.Ls * 0.22, V.Ls * 0.22];
      xIn.forEach(function (xx) {
        b.nozzle("detail", [xx, yIn, zo - so * 0.15], [xx, yIn, zo + so * 0.55], rin);
        b.pipe("body", "metalDark", [[xx, yIn, zo + so * 0.55], [xx, yIn, zIn], [xx, 0.9, zIn]], rin);
      });
      b.pipe("body", "metalDark", [[xIn[0], 0.9, zIn], [xIn[1], 0.9, zIn]], rin);
      var xMv = V.xa - 1.5;
      b.pipe("body", "metalDark", [[xIn[0], 0.9, zIn], [xMv, 0.9, zIn], [V.xa - V.hr - 3.5, 0.9, zIn]], rin);
      b.valve("body", [xMv, 0.9, zIn], [1, 0, 0], rin, [0, 1, 0], {act: true});
      b.valve("body", [xMv - 2.4, 0.9, zIn], [1, 0, 0], rin, [0, 1, 0]);
      var rw = rin * 0.5;
      b.pipe("body", "pipeA", [[xMv - 1.2, 0.9 + rin, zIn], [xMv - 1.2, 2.2, zIn], [xMv - 1.2, 2.2, zF], [V.xa - V.hr - 3.5, 2.2, zF]], rw);
      b.valve("body", [xMv - 3.4, 2.2, zF], [1, 0, 0], rw, [0, 1, 0]);
      var xOut = V.Ls * 0.06, rout = rin * 0.95;
      b.nozzle("detail", [xOut, ytop - 0.1, z + so * r * 0.3], [xOut, ytop + 0.6, z + so * r * 0.3], rout);
      b.pipe("body", "metal", [[xOut, ytop + 0.6, z + so * r * 0.3], [xOut, ytop + 1.4, z + so * r * 0.3], [xOut, ytop + 1.4, zF + so * 0.6],
        [xOut, 1.6, zF + so * 0.6], [V.xb + V.hr + 5, 1.6, zF + so * 0.6]], rout);
      b.valve("body", [xOut, ytop * 0.55, zF + so * 0.6], [0, 1, 0], rout, [-1, 0, 0]);
      var xBr = V.Ls * 0.34, rb = rin * 0.7;
      b.pipe("body", "insul", [[xBr, yc - r + 0.1, z + so * r * 0.25], [xBr, 0.7, z + so * r * 0.25], [xBr, 0.7, zIn - so * 0.2], [V.xb + V.hr + 5, 0.7, zIn - so * 0.2]], rb);
      b.valve("body", [xBr + 2.6, 0.7, zIn - so * 0.2], [1, 0, 0], rb, [0, 1, 0], {act: true});
      var ym = yc - r * 0.82, zm = z + so * r * 0.62;
      b.cyl2("detail", "pipeA", [-V.Ls * 0.42, ym, zm + so * 0.35], [V.Ls * 0.42, ym, zm + so * 0.35], 0.09, {seg: 6});
      for (var mw = 0; mw < 7; mw++) {
        var xm = -V.Ls * 0.38 + V.Ls * 0.76 * mw / 6;
        b.cyl2("detail", "pipeA", [xm, ym + 0.05, zm - so * 0.1], [xm, ym, zm + so * 0.35], 0.09, {seg: 6});
      }
      b.nozzle("detail", [V.xb - 1.6, ytop - 0.1, z + so * r * 0.25], [V.xb - 1.6, ytop + 0.5, z + so * r * 0.25], 0.22);
      b.valve("detail", [V.xb - 1.6, ytop + 0.95, z + so * r * 0.25], [0, 1, 0], 0.2, [1, 0, 0], {act: true});
      b.cyl2("detail", "metalDark", [V.xa - V.hr * 0.6, yc - r * 0.6, z + so * r * 0.4], [V.xa - V.hr * 0.6, yc + r * 0.6, z + so * r * 0.4], 0.12, {seg: 8});
      void iv;
    });
    var yw = ytop + 0.35, x0 = V.xa - 0.2, x1 = V.xb + 0.2, wz = [];
    if (n === 1) wz.push([-sideZ * r * 0.35 - 1.4 * (sideZ > 0 ? 1 : 0), -sideZ * r * 0.35 + 1.4 * (sideZ > 0 ? 0 : 1)]);
    for (i = 0; i + 1 < n; i++) wz.push([zs[i] + r * 0.55, zs[i + 1] - r * 0.55]);
    wz.forEach(function (w) {
      b.platform(x0, w[0], x1, w[1], yw, "ns");
      for (var k = 0; k <= 4; k++) {
        var x = x0 + (x1 - x0) * k / 4;
        b.bar("deck", "steel", [x, yw - 0.25, (w[0] + w[1]) / 2], [x, yc + r * 0.2, (w[0] + w[1]) / 2], 0.2);
      }
    });
    var zA = zs[0] - r * 0.6, zB = zs[n - 1] + r * 0.6, xe0 = V.xb + V.hr + 2.0;
    b.platform(x1, zA, xe0, zB, yw, "nse");
    b.box("deck", "steel", xe0 - 0.2, (yw - 0.25) / 2, zA + 0.2, 0.25, yw - 0.25, 0.25);
    b.box("deck", "steel", xe0 - 0.2, (yw - 0.25) / 2, zB - 0.2, 0.25, yw - 0.25, 0.25);
    b.stairTower(xe0 + 1.5, zA + 2.6, 0, yw, PI / 2, {rise: yw / 2 + 0.01});
    b.blob(0, 0, l + 8, n * pitch + 6, true);
  });
  reg("heater_box", {dims: {w: 30, d: 12, h: 24}, opts: {stack_h: 60, cells: 2}}, function (b, D, O) {
    var w = D.w, dd = D.d, h = D.h, cells = clamp(Math.round(+O.cells || 1), 1, 4), i, k;
    var fh = clamp(h * 0.13, 2.5, 3.6), H = h - fh, rh = H * 0.56, yR = fh + rh;
    var dc = clamp(dd * 0.42, 2.5, dd - 2), slopeH = Math.min(H * 0.1, (dd - dc) / 2 * 0.5), yRoof = yR + slopeH;
    var hood = clamp(H * 0.1, 1.5, 3.5), yC1 = h - hood;
    var gap = cells > 1 ? 2.4 : 0, cw = (w - gap * (cells - 1)) / cells, wcv = w * (cells > 1 ? 0.92 : 0.86);
    var rs = clamp(Math.sqrt(w * dd) * 0.085, 1.0, 3.0), sTop = stackTopOf(O.stack_h, h, Math.max(18, w));
    b.boxB("body", "concrete", 0, 0, 0, w + 4, 0.3, dd + 4, 0, true);
    var nx = Math.max(2, Math.round(w / 4) + 1), zrows = dd > 9 ? [-1, 0, 1] : [-1, 1];
    for (i = 0; i < nx; i++) {
      var xl = -w / 2 + 0.3 + i * (w - 0.6) / (nx - 1);
      zrows.forEach(function (s) { b.boxB("body", "steel", xl, 0.3, s * (dd / 2 - 0.3), 0.45, fh - 0.8, 0.45); });
    }
    b.boxB("body", "steel", 0, fh - 0.5, 0, w, 0.5, dd, 0, true);
    for (k = 0; k < cells; k++) {
      var xc = -w / 2 + cw / 2 + k * (cw + gap);
      b.boxB("body", "casing", xc, fh, 0, cw, rh, dd, 0, true);
      b.prismX("body", "casing", xc, yR, 0, cw, [[-dd / 2, 0], [dd / 2, 0], [dc / 2, slopeH], [-dc / 2, slopeH]], true);
      var nb = Math.max(2, Math.round(cw / 3) + 1);
      for (i = 0; i < nb; i++) {
        var xb = xc - cw / 2 + 0.15 + i * (cw - 0.3) / (nb - 1);
        [-1, 1].forEach(function (s) { b.boxB("body", "steel", xb, fh, s * (dd / 2 + 0.15), 0.3, rh, 0.3); });
      }
      [-1, 1].forEach(function (s) {
        var nz = Math.max(2, Math.round(dd / 3) + 1);
        for (var j = 0; j < nz; j++) b.boxB("body", "steel", xc + s * (cw / 2 + 0.15), fh, -dd / 2 + j * dd / (nz - 1), 0.3, rh, 0.3);
        [fh + rh * 0.5, yR - 0.15].forEach(function (yg) {
          b.box("body", "steel", xc, yg, s * (dd / 2 + 0.13), cw, 0.28, 0.26);
          b.box("body", "steel", xc + s * (cw / 2 + 0.13), yg, 0, 0.26, 0.28, dd);
        });
      });
      for (i = 0; i < nb - 1; i++) {
        var xp = xc - cw / 2 + (i + 0.5) * cw / (nb - 1);
        [-1, 1].forEach(function (s) {
          [fh + 1.3, fh + rh * 0.45 + 1.0].forEach(function (yp) { b.box("detail", "dark", xp, yp, s * (dd / 2 + 0.06), 0.5, 0.5, 0.14); });
        });
      }
      var nbx = Math.max(2, Math.round(cw / 2.2));
      for (i = 0; i < nbx; i++) {
        var xq = xc - cw / 2 + (i + 0.5) * cw / nbx;
        [-0.22, 0.22].forEach(function (f) { b.vcyl("detail", "dark", xq, fh - 1.9, f * dd, 0.38, 1.4, {seg: 10}); });
      }
    }
    var hc = yC1 - yRoof;
    b.boxB("body", "casing", 0, yRoof, 0, wcv, hc, dc, 0, true);
    [-1, 1].forEach(function (s) {
      b.boxB("body", "metalDark", s * (wcv / 2 + 0.6), yRoof + 0.4, 0, 1.2, hc * 0.8, dc * 0.85, 0, true);
      for (var j = 0; j <= Math.round(wcv / 3); j++) b.boxB("body", "steel", -wcv / 2 + j * wcv / Math.round(wcv / 3), yRoof, s * (dc / 2 + 0.12), 0.26, hc, 0.24);
    });
    b.frustum("body", "casing", 0, yC1, 0, wcv * 0.7, dc, rs * 2.2, rs * 2.2, hood, true);
    b.vcyl("body", "metalDark", 0, h, 0, rs, sTop - h, {seg: 28});
    b.vcyl("body", "steel", 0, h, 0, rs * 1.08, 0.5, {seg: 28});
    b.vcyl("body", "steel", 0, sTop - 0.4, 0, rs * 1.08, 0.4, {seg: 28});
    b.ring(0, sTop, 0, rs * 1.003);
    stackBands(b, 0, 0, rs, sTop, sTop - h);
    var yP = yRoof + 0.3, ox = wcv / 2 + 1.6, oz = dc / 2 + 1.6;
    b.box("deck", "deck", 0, yP - 0.125, oz - 0.8, 2 * ox, 0.25, 1.6, 0, true);
    b.box("deck", "deck", 0, yP - 0.125, -oz + 0.8, 2 * ox, 0.25, 1.6, 0, true);
    b.box("deck", "deck", ox - 0.8, yP - 0.125, 0, 1.6, 0.25, dc, 0, true);
    b.box("deck", "deck", -ox + 0.8, yP - 0.125, 0, 1.6, 0.25, dc, 0, true);
    b.railRect(-ox, -oz, ox, oz, yP, "nse");
    var Wt = 2.3, stx = -w / 2 - 1.4 - Wt / 2, st = b.stairTower(stx, 0, 0.3, yP, PI / 2);
    var zl = -(st.run / 2 + 0.65) * ((st.lands.length - 1) % 2 ? 1 : -1);
    b.box("deck", "deck", (stx + Wt / 2 + (-ox)) / 2, yP - 0.125, 0, Math.abs(-ox - (stx + Wt / 2)) + 0.4, 0.25, 2 * oz, 0, true);
    b.rail([[stx + Wt / 2, oz], [-ox, oz]], yP);
    b.rail([[stx + Wt / 2, -oz], [-ox, -oz]], yP);
    var yPe = fh + rh * 0.45;
    [-1, 1].forEach(function (s) {
      var z0 = s * (dd / 2 + 0.3), z1 = s * (dd / 2 + 1.5);
      b.platform(-w / 2, Math.min(z0, z1), w / 2, Math.max(z0, z1), yPe, s > 0 ? "nwe" : "swe");
      for (var j = 0; j <= Math.round(w / 4); j++) {
        var xj = -w / 2 + j * w / Math.round(w / 4);
        b.bar("deck", "steel", [xj, yPe - 1.4, s * (dd / 2 + 0.3)], [xj, yPe - 0.25, z1], 0.14);
      }
      b.ladder(w / 2 - 1.2, s * (dd / 2 + 1.5), 0.3, yPe + 1.1, 0, s, 2.6);
    });
    var yU = yC1 + 0.3, ux = wcv / 2 + 1.2, uz = dc / 2 + 1.6;
    b.box("deck", "deck", 0, yU - 0.125, uz - 0.7, 2 * ux, 0.25, 1.4, 0, true);
    b.box("deck", "deck", 0, yU - 0.125, -uz + 0.7, 2 * ux, 0.25, 1.4, 0, true);
    b.railRect(-ux, -uz, ux, uz, yU, "ns");
    b.ladder(wcv / 2 - 0.5, oz - 0.3, yP, yU + 1.1, 0, 1, yP + 2.2);
    var yDm = h + 2.0;
    b.slab("deck", "deck", -(rs + 1.4), -(rs + 1.4), rs + 1.4, Math.max(rs + 1.4, uz), yDm - 0.25, 0.25, [[0, 0, rs + 0.05]], true);
    b.railRect(-(rs + 1.4), -(rs + 1.4), rs + 1.4, Math.max(rs + 1.4, uz), yDm, "nsew");
    b.ladder(0, uz - 0.5, yU, yDm + 1.1, 0, 1, yU + 2.2);
    var yTp = sTop - 2.5;
    b.annulus("deck", "deck", 0, 0, yTp - 0.25, rs + 0.08, rs + 1.3, 0, TAU, 0.25, true);
    b.rail(arcPts(0, 0, rs + 1.24, 0, TAU, true), yTp, true);
    b.ladder(0, rs + 0.3, yDm, yTp + 1.1, 0, 1, yDm + 2.2);
    b.blob(0, 0, w + 6, dd + 6, true);
  });
  reg("heater_cyl", {dims: {d: 9, h: 24}, opts: {stack_h: 45}}, function (b, D, O) {
    var d = D.d, h = D.h, r = d / 2, fh = 2.8, H = h - fh, rh = H * 0.62, yR = fh + rh, i;
    var a = r * 0.55, coneH = Math.max(1.2, (r - a) * 0.7), yCone = yR + coneH, hood = clamp(H * 0.08, 1.2, 2.5), yC1 = h - hood;
    var rs = clamp(r * 0.24, 0.8, 2.2), sTop = stackTopOf(O.stack_h, h, Math.max(14, d * 2));
    b.vcyl("body", "concrete", 0, 0, 0, r + 1.5, 0.3, {seg: 8, ry: PI / 8, edge: true});
    var nl = Math.max(6, Math.round(TAU * r / 3.2));
    for (i = 0; i < nl; i++) {
      var al = TAU * i / nl, pl = P3(0, 0, r * 0.95, al, 0);
      b.boxB("body", "steel", pl[0], 0.3, pl[2], 0.4, fh - 0.7, 0.4, -al);
      if (i % 2 === 0) {
        var pn = P3(0, 0, r * 0.95, TAU * (i + 1) / nl, 0);
        b.bar("body", "steel", [pl[0], 0.4, pl[2]], [pn[0], fh - 0.5, pn[2]], 0.16);
      }
    }
    b.vcyl("body", "steel", 0, fh - 0.4, 0, r * 1.02, 0.4, {edge: true});
    shell(b, "body", "casing", 0, 0, [[fh, r], [yR, r]], 0);
    b.vcyl("body", "casing", 0, yR, 0, r, coneH, {rTop: a * 1.3});
    var nbs = Math.max(8, Math.round(TAU * r / 2.4));
    for (i = 0; i < nbs; i++) {
      var ab = TAU * i / nbs, pb = P3(0, 0, r + 0.12, ab, 0);
      b.boxB("body", "steel", pb[0], fh, pb[2], 0.26, rh, 0.26, -ab);
    }
    [fh + 0.2, fh + rh * 0.5, yR - 0.3].forEach(function (y) { b.vcyl("body", "steel", 0, y, 0, r * 1.04, 0.3, {open: true}); });
    for (i = 0; i < 6; i++) { var ap = TAU * (i + 0.5) / 6, pp = P3(0, 0, r + 0.05, ap, fh + 1.4); b.box("detail", "dark", pp[0], pp[1], pp[2], 0.15, 0.5, 0.5, -ap); }
    for (i = 0; i < 7; i++) {
      var pq = i === 0 ? [0, 0, 0] : P3(0, 0, r * 0.5, TAU * i / 6, 0);
      b.vcyl("detail", "dark", pq[0], fh - 1.8, pq[2], 0.4, 1.4, {seg: 10});
    }
    if (yC1 > yCone + 1) {
      b.boxB("body", "casing", 0, yCone, 0, 2 * a, yC1 - yCone, 2 * a, 0, true);
      [-1, 1].forEach(function (s) { b.boxB("body", "metalDark", s * (a + 0.4), yCone + 0.3, 0, 0.8, (yC1 - yCone) * 0.8, 2 * a * 0.85, 0, true); });
      b.frustum("body", "casing", 0, yC1, 0, 2 * a, 2 * a, rs * 2.2, rs * 2.2, hood, true);
    } else b.vcyl("body", "casing", 0, yCone, 0, a * 1.3, h - yCone, {rTop: rs * 1.1});
    b.vcyl("body", "metalDark", 0, h, 0, rs, sTop - h, {seg: 24});
    b.vcyl("body", "steel", 0, h, 0, rs * 1.1, 0.4, {seg: 24});
    b.ring(0, sTop, 0, rs * 1.003);
    stackBands(b, 0, 0, rs, sTop, sTop - h);
    var th0 = 0.7;
    b.annulus("deck", "deck", 0, 0, yR + 0.05, r + 0.3, r + 1.6, 0, TAU, 0.25, true);
    b.rail(arcPts(0, 0, r + 1.54, 0, TAU, true), yR + 0.3, true);
    for (i = 0; i < 10; i++) { var ak = TAU * i / 10; b.bar("deck", "steel", P3(0, 0, r + 0.12, ak, yR - 1.3), P3(0, 0, r + 1.5, ak, yR + 0.04), 0.14); }
    b.ladder((r + 0.9) * Math.cos(th0), (r + 0.9) * Math.sin(th0), 0.3, yR + 1.4, Math.cos(th0), Math.sin(th0), 2.7);
    if (yC1 > yCone + 1) {
      var yU = yC1 + 0.3;
      b.platform(-a - 1.2, -a - 1.2, r + 1.0, a + 1.2, yU, "nsew");
      b.ladder(r + 0.7, 0, yR + 0.3, yU + 1.1, 1, 0, yR + 2.5);
    }
    b.blob(0, 0, d + 5, d + 5);
  });
  reg("coker", {dims: {d: 9.8, h: 28.6}, opts: {pairs: 4, table_h: 12, deck_h: 45.5, derrick_h: 75}}, function (b, D, O, eq) {
    var d = D.d, h = D.h, r = d / 2, pairs = clamp(Math.round(+O.pairs || 4), 1, 6), yD = +O.table_h > 0 ? +O.table_h : 12;
    var pitch = +O.drum_pitch > d + 1 ? +O.drum_pitch : 0, inPair = Math.min(pitch ? pitch - d : 4.4, 3.0), between = (pitch ? pitch - d : 6.5) + 6;
    var xs = [], x = 0, i, k;
    for (i = 0; i < pairs; i++) { xs.push(x); x += d + inPair; xs.push(x); x += d + between; }
    var x0 = xs[0], xN = xs[xs.length - 1], mid = (x0 + xN) / 2;
    xs = xs.map(function (v) { return v - mid; });
    var sx0 = xs[0] - r - 2.6, sx1 = xs[xs.length - 1] + r + 2.6, sz = r + 2.6;
    var slabT = 1.6, coneH = r * 0.85, ysh0 = yD + 0.8, yT = ysh0 + h, hr = r * 0.42;
    var yCut = Math.max(yT + hr + 1.2, +O.deck_h > 0 ? +O.deck_h : 0);
    var hd = +O.derrick_h > yCut + 14 ? +O.derrick_h - yCut - 2.4 : clamp(h * 1.0, 18, 42);
    var rnd = rng(eq.id || "coker");
    var cols = [sx0 + 0.9];
    for (i = 0; i + 1 < xs.length; i++) cols.push((xs[i] + xs[i + 1]) / 2);
    cols.push(sx1 - 0.9);
    cols.forEach(function (cx) { [-1, 1].forEach(function (s) { b.boxB("body", "concrete", cx, 0, s * (sz - 0.9), 1.8, yD - slabT, 1.8, 0, true); }); });
    cols.forEach(function (cx) { b.boxB("body", "concrete", cx, yD - slabT - 1.4, 0, 1.2, 1.4, 2 * sz, 0, true); });
    b.slab("body", "concrete", sx0, -sz, sx1, sz, yD - slabT, slabT, xs.map(function (v) { return [v, 0, r + 0.4]; }), true);
    var pIn = -1.6, pz0 = -(sz + 0.6), pw = clamp(d * 2.0, 16, 24), pz1 = pz0 - pw, px0 = sx0 - 2, px1 = sx1 + 2, pwI = 1.4, pwO = 4.2;
    xs.forEach(function (xd) {
      b.vcyl("body", "metalDark", xd, yD - coneH, 0, 1.1, coneH + 0.8, {rTop: r, seg: 40, open: true, edge: true});
      b.ring(xd, yD - coneH, 0, 1.1);
      b.vcyl("body", "dark", xd, yD - coneH - 0.6, 0, 1.25, 0.6, {seg: 20});
      b.vcyl("body", "steel", xd, yD, 0, r * 1.06, 0.8, {seg: 40});
      shell(b, "body", "metal", xd, 0, [[ysh0, r], [yT, r]], 2.4);
      b.head("body", "metal", xd, yT, 0, r, hr, false, 40);
      b.vcyl("body", "metalDark", xd, yT + hr - 0.15, 0, 1.0, 0.55, {edge: true});
      var yu = yD - coneH - 0.6;
      b.boxB("body", "valve", xd, yu - 1.3, 0, 3.4, 1.3, 2.2, 0, true);
      b.cyl2("body", "metalDark", [xd + 1.7, yu - 0.65, 0], [xd + 4.2, yu - 0.65, 0], 0.45, {seg: 12});
      b.frustum("body", "metalDark", xd, yu - 2.6, -0.4, 2.2, 2.2, 3.0, 2.6, 1.3, true);
      var c0 = [xd, yu - 2.4, -0.9], c1 = [xd, 1.9, -(sz - 1.0)], dz = c1[2] - c0[2], dy = c1[1] - c0[1], L = Math.sqrt(dz * dz + dy * dy);
      var ny = -dz / L, nz = dy / L;
      var m = mSeg(c0, c1, 2.8, 0.25);
      b.put("body", "metalDark", gBox(), m);
      b.edge(gEdges(gBox()), m);
      [-1, 1].forEach(function (s) {
        var o = [s * 1.35, ny * 0.6, nz * 0.6];
        var ms = mSeg([c0[0] + o[0], c0[1] + o[1], c0[2] + o[2]], [c1[0] + o[0], c1[1] + o[1], c1[2] + o[2]], 0.18, 1.2);
        b.put("body", "metalDark", gBox(), ms);
        b.edge(gEdges(gBox()), ms);
      });
      b.pipe("body", "metalDark", [[xd + r * 0.3, yu + 0.2, 0], [xd + r * 0.3, yu + 0.2, sz - 0.5], [xd + r * 0.3, yD - slabT - 2.2, sz - 0.5]], 0.3);
      b.pipe("body", "metal", [[xd + r * 0.35, yT + hr * 0.75, r * 0.3], [xd + r * 0.35, yT + hr + 2.4, r * 0.3], [xd + r * 0.35, yT + hr + 2.4, sz + 1.2]], 0.55);
    });
    var yVap = yT + hr + 2.4;
    b.pipe("body", "metal", [[xs[0] + r * 0.35, yVap, sz + 1.2], [sx1 + 2.5, yVap, sz + 1.2], [sx1 + 2.5, 12, sz + 1.2], [sx1 + 8, 12, sz + 1.2]], 0.9);
    var yMid = ysh0 + h * 0.5;
    cols.forEach(function (cx) { [-1, 1].forEach(function (s) { b.boxB("body", "concrete", cx, yD, s * (sz - 0.7), 1.3, yCut - yD, 1.3, 0, true); }); });
    [yMid, yCut].forEach(function (yb) {
      [-1, 1].forEach(function (s) { b.box("body", "concrete", (sx0 + sx1) / 2, yb - 0.6, s * (sz - 0.7), sx1 - sx0, 1.2, 1.0, 0, true); });
      cols.forEach(function (cx) { b.box("body", "concrete", cx, yb - 0.6, 0, 1.0, 1.2, 2 * sz - 1.4, 0, true); });
    });
    var holes = xs.map(function (v) { return [v, 0, r + 0.25]; });
    b.slab("body", "concrete", sx0, -sz, sx1, sz, yMid - 0.5, 0.5, holes, true);
    b.railRect(sx0, -sz, sx1, sz, yMid, "nsew");
    b.slab("body", "concrete", sx0, -sz, sx1, sz, yCut - 0.5, 0.5, xs.map(function (v) { return [v, 0, 1.4]; }), true);
    b.railRect(sx0, -sz, sx1, sz, yCut, "nsew");
    var bw = clamp(d * 0.75, 5, 8), wtp = 2.6, yC = yCut + hd;
    xs.forEach(function (xd, j) {
      b.lattice(xd, 0, yCut, hd, bw, wtp, 8, {tl: 0.32, tb: 0.17});
      var cw2 = wtp / 2 + 0.1, cc = [[-cw2, -cw2], [cw2, -cw2], [cw2, cw2], [-cw2, cw2]];
      cc.forEach(function (q, iq) {
        var q2 = cc[(iq + 1) % 4];
        b.bar("body", "steel", [xd + q[0], yC, q[1]], [xd + q[0], yC + 1.6, q[1]], 0.28);
        b.bar("body", "steel", [xd + q[0], yC + 1.6, q[1]], [xd + q2[0], yC + 1.6, q2[1]], 0.26);
        b.bar("body", "steel", [xd + q[0], yC, q[1]], [xd + q2[0], yC + 1.6, q2[1]], 0.14);
      });
      [-0.55, 0.55].forEach(function (zz) { b.cyl2("body", "crane", [xd, yC + 1.9, zz - 0.18], [xd, yC + 1.9, zz + 0.18], 1.05, {seg: 20}); });
      b.bar("body", "steel", [xd, yC + 1.9, -1.0], [xd, yC + 1.9, 1.0], 0.3);
      b.platform(xd - 1.6, -1.6, xd + 1.6, 1.6, yC + 0.25, "nsew");
      if (j % 2 === 1) {
        var xa = xs[j - 1] + cw2, xb2 = xd - cw2;
        [-cw2, cw2].forEach(function (zz) {
          b.bar("body", "steel", [xa, yC, zz], [xb2, yC, zz], 0.3);
          b.bar("body", "steel", [xa, yC + 1.6, zz], [xb2, yC + 1.6, zz], 0.3);
          var nbp = Math.max(2, Math.round((xb2 - xa) / 1.6));
          for (var ib = 0; ib < nbp; ib++) {
            var xq0 = xa + (xb2 - xa) * ib / nbp, xq1 = xa + (xb2 - xa) * (ib + 1) / nbp;
            b.bar("body", "steel", [xq0, ib % 2 ? yC + 1.6 : yC, zz], [xq1, ib % 2 ? yC : yC + 1.6, zz], 0.16);
          }
        });
        b.box("deck", "deck", (xa + xb2) / 2, yC + 0.12, 0, xb2 - xa, 0.25, 2 * cw2, 0, true);
      }
      var yX = yCut + hd * 0.5, yTB = yX + hd * 0.22, gx = 1.25;
      [-1, 1].forEach(function (s) { b.bar("body", "steel", [xd + s * gx, yCut + 2.6, 0], [xd + s * gx, yC, 0], 0.16); });
      [[-0.45, -0.25], [-0.15, 0.25], [0.15, -0.25], [0.45, 0.25]].forEach(function (q) {
        b.bar("detail", "cable", [xd + q[0], yC, q[1]], [xd + q[0], yTB + 1.0, q[1]], 0.09);
      });
      b.boxB("body", "crane", xd, yTB - 1.2, 0, 1.3, 2.2, 1.0, 0, true);
      b.cyl2("body", "metalDark", [xd, yTB + 0.3, -0.6], [xd, yTB + 0.3, 0.6], 0.62, {seg: 16});
      b.bar("body", "steel", [xd - 0.35, yTB - 1.2, 0], [xd - 0.35, yX + 2.2, 0], 0.16);
      b.bar("body", "steel", [xd + 0.35, yTB - 1.2, 0], [xd + 0.35, yX + 2.2, 0], 0.16);
      b.boxB("body", "crane", xd, yX, 0, 2 * gx + 0.5, 1.4, 1.5, 0, true);
      b.vcyl("body", "dark", xd, yX + 1.4, 0, 0.7, 0.9, {seg: 14});
      b.pipe("body", "cable", [[xd, yX + 2.3, 0], [xd, yX + 2.9, 0], [xd + 0.9, yX + 3.6, 0], [xd + 1.9, yX + 2.4, 0.5],
        [xd + bw * 0.3 + 0.4, yX - 3.0, 0.9]], 0.22);
      b.vcyl("body", "white", xd, yCut + 2.4, 0, 0.3, yX - yCut - 2.4, {seg: 12});
      b.vcyl("body", "metalDark", xd, yCut + 2.4, 0, 0.62, 0.35, {seg: 14});
      b.vcyl("body", "white", xd, yX - 0.5, 0, 0.6, 0.5, {seg: 14});
      b.vcyl("body", "metalDark", xd, yCut + 0.1, 0, 0.75, 2.3, {seg: 16, edge: true});
      b.vcyl("body", "crane", xd, yCut + 1.6, 0, 0.8, 0.35, {seg: 16});
      for (k = 0; k < 4; k++) { var an = k * PI / 2 + 0.4; b.cyl2("detail", "dark", [xd, yCut + 0.9, 0], P3(xd, 0, 1.1, an, yCut + 0.9), 0.14, {seg: 6}); }
      b.boxB("body", "building", xd + (j % 2 ? -1 : 1) * (r * 0.6), yCut, sz - 2.0, 3.2, 2.6, 2.4, 0, true);
      b.ladder(xd + 0.45, 0.82, yCut, yC + 1.35, 0, 1, null);
    });
    var pzm = (pIn + pz1) / 2, pL = pIn - pz1;
    b.boxB("body", "concrete", (px0 + px1) / 2, 0, pzm, px1 - px0, 0.2, pL, 0, false);
    b.boxB("body", "concrete", (px0 + px1) / 2, 0, pIn - 0.5, px1 - px0, pwI, 1.0, 0, true);
    b.boxB("body", "concrete", (px0 + px1) / 2, 0, pz1 + 0.6, px1 - px0, pwO, 1.2, 0, true);
    b.boxB("body", "concrete", px0 + 0.6, 0, pzm, 1.2, pwO, pL, 0, true);
    b.boxB("body", "concrete", px1 - 0.6, 0, pzm, 1.2, pwO, pL, 0, true);
    b.boxB("body", "dark", (px0 + px1) / 2, 0.2, pz1 + 2.0, px1 - px0 - 3.0, 0.06, 1.4, 0, false);
    b.boxB("body", "coke", (px0 + px1) / 2, 0.2, pzm - 1.0, px1 - px0 - 4, 0.35, pL - 6, 0, false);
    xs.forEach(function (xd) {
      var hz = -(sz + 1.5) + (rnd() - 0.5) * 2;
      for (var q = 0; q < 3; q++) {
        var hx = xd + (rnd() - 0.5) * 6, hzq = hz + 1.5 - rnd() * 7, rr = (q ? 2.6 : 4.2) + rnd() * 1.6, hh = (q ? 1.8 : 3.4) + rnd() * 1.2;
        b.vcyl("body", "coke", hx, 0.45, hzq, rr, hh, {rTop: rr * 0.12, seg: 7, ry: rnd() * PI});
      }
    });
    b.boxB("body", "concrete", (px0 + px1) / 2, 0, pz1 - 1.5, px1 - px0 + 6, pwO, 3.0, 0, true);
    [px0 - 1.5, px1 + 1.5].forEach(function (xa) { b.boxB("body", "concrete", xa, 0, pzm - 0.75, 3.0, pwO, pL + 1.5, 0, true); });
    b.rail([[px0 - 3, pz1 - 0.2], [px1 + 3, pz1 - 0.2]], pwO, false);
    var yRw = 9.6, ncr = Math.max(3, Math.round((px1 - px0) / 14) + 1), zc = (pz0 + pz1) / 2;
    [pz0, pz1 + 0.6].forEach(function (zr, j) {
      var yb0 = j ? pwO : 0.2;
      for (var q = 0; q < ncr; q++) b.boxB("body", "steel", px0 + 0.6 + q * (px1 - px0 - 1.2) / (ncr - 1), yb0, zr, 0.7, yRw - yb0, 0.7);
      b.boxB("body", "steel", (px0 + px1) / 2, yRw, zr, px1 - px0, 1.0, 0.7, 0, true);
    });
    var xcr = xs[2] + 1.5, zg = pz0 - 4.5;
    [-0.9, 0.9].forEach(function (dx) { b.boxB("body", "crane", xcr + dx, yRw + 1.0, zc, 0.8, 1.8, pw + 1.6, 0, true); });
    [pz0, pz1 + 0.6].forEach(function (zr) { b.boxB("body", "crane", xcr, yRw + 1.0, zr, 3.4, 1.1, 1.6, 0, true); });
    b.boxB("body", "crane", xcr, yRw + 2.8, zg, 3.0, 1.2, 2.6, 0, true);
    b.boxB("body", "building", xcr + 2.2, yRw - 1.6, zg + 3.5, 1.8, 2.4, 2.0, 0, true);
    [-0.5, 0.5].forEach(function (dx) { b.bar("detail", "cable", [xcr + dx, yRw + 1.0, zg], [xcr + dx, 6.6, zg], 0.08); });
    b.boxB("body", "crane", xcr, 5.6, zg, 1.6, 1.0, 1.0, 0, true);
    [-1, 1].forEach(function (s) {
      b.put("body", "crane", gHead(16), mTRS(xcr + s * 0.9, 5.4, zg, 1.5, 2.4, 1.4, 0, PI, s * 0.45));
    });
    var Wt = 2.3;
    b.stairTower(sx0 - Wt / 2 - 0.3, sz - 4.5, 0, yCut, PI / 2);
    b.stairTower(sx1 + Wt / 2 + 0.3, sz - 4.5, 0, yCut, PI / 2);
    b.blob((px0 + px1) / 2, (pz1 + sz) / 2, px1 - px0 + 8, sz - pz1 + 8, true);
  });
  reg("rfcc", {dims: {h: 62}, opts: {reactor_d: 7, regen_d: 13}}, function (b, D, O) {
    var h = D.h, Rg = (+O.regen_d > 0 ? +O.regen_d : 13) / 2, Rr = (+O.reactor_d > 0 ? +O.reactor_d : 7) / 2;
    var sepx = Rg + Rr + 10, xg = -sepx / 2, xr = sepx / 2, th0 = 0.7, i;
    var sk = clamp(h * 0.13, 6, 10), Rc = Rg * 0.74, yc1 = sk + h * 0.2, yu0 = yc1 + (Rg - Rc) * 1.4, yu1 = h * 0.6, hrg = Rg * 0.5;
    var profG = [[sk, Rc], [yc1, Rc], [yu0, Rg], [yu1, Rg]];
    function rAtG(y) { if (y > yu1) { var f = Math.min(1, (y - yu1) / hrg); return Math.max(0.01, Rg * Math.sqrt(1 - f * f)); } return y < sk ? Rc * 1.05 : profR(profG, y); }
    plinth(b, xg, 0, Rc * 1.3 + 0.8, 0.8);
    b.vcyl("body", "concrete", xg, 0.8, 0, Rc * 1.05, sk - 0.8, {rTop: Rc, open: true});
    shell(b, "body", "metal", xg, 0, profG, 3.0);
    b.head("body", "metal", xg, yu1, 0, Rg, hrg, false, 48);
    var yApG = yu1 + hrg;
    for (i = 0; i < 6; i++) {
      var ac = TAU * i / 6 + 0.3, pc = P3(xg, 0, Rg * 0.5, ac, 0), yb2 = yu1 + hrg * Math.sqrt(1 - 0.25);
      b.vcyl("body", "metalDark", pc[0], yb2 - 0.4, pc[2], 0.55, yApG - yb2 + 2.0, {});
      b.head("body", "metalDark", pc[0], yApG + 1.6, pc[2], 0.55, 0.4);
    }
    b.vcyl("body", "metal", xg, yApG - 0.5, 0, Rg * 0.22, 3.2, {});
    b.head("body", "metal", xg, yApG + 2.7, 0, Rg * 0.22, Rg * 0.12);
    var rfg = clamp(Rg * 0.16, 0.7, 1.4);
    b.pipe("body", "metal", [[xg, yApG + 2.6, 0], [xg, yApG + 5, 0], [xg - Rg - 7, yApG + 5, 0], [xg - Rg - 7, 10, 0], [xg - Rg - 12, 10, 0]], rfg);
    var Rs = Math.max(Rr * 0.5, 1.6), ys0 = h * 0.33, ys1 = h * 0.5, yd0 = ys1 + (Rr - Rs) * 1.3, hrr = Rr * 0.5, yd1 = h - hrr;
    shell(b, "body", "metal", xr, 0, [[ys0, Rs], [ys1, Rs], [yd0, Rr], [yd1, Rr]], 3.0);
    b.head("body", "metal", xr, yd1, 0, Rr, hrr, false, 40);
    b.vcyl("body", "metal", xr, ys0 - 2.8, 0, 0.7, 2.8, {rTop: Rs, open: true});
    var rvl = clamp(Rr * 0.22, 0.6, 1.1);
    b.pipe("body", "metal", [[xr, h - 0.3, 0], [xr, h + 2.6, 0], [xr + Rr + 9, h + 2.6, 0], [xr + Rr + 9, h * 0.35, 0], [xr + Rr + 14, h * 0.35, 0]], rvl);
    var xri = xr - Rr - 3.6, rri = 1.22, yRb = 5, yRt = yd1 - 4.5;
    b.vcyl("body", "metal", xri, yRb, 0, rri, yRt - yRb, {});
    b.pipe("body", "metal", [[xri, yRt, 0], [xri, yRt + 1.8, 0], [xr - Rr * 0.5, yRt + 1.8, 0]], rri);
    b.vcyl("body", "metal", xri - 0.3, 1.5, 0, rri * 1.25, yRb - 1.5, {rTop: rri});
    var zA = -1.6, zB = 2.0;
    var gx = xg + Math.sqrt(Math.max(0.1, Rc * Rc - zA * zA)), gx2 = xg + Math.sqrt(Math.max(0.1, Rc * Rc - zB * zB));
    b.pipe("body", "metal", [[gx - 0.3, sk + 2.5, zA], [gx + 1.5, sk + 1.0, zA], [xri - 1.5, yRb + 2.0, zA], [xri, yRb + 1.2, 0]], 0.75);
    b.pipe("body", "metal", [[xr, ys0 - 2.8, 0], [xr, ys0 - 4.0, zB], [gx2 + 1.2, sk + 7.0, zB], [gx2 - 0.3, sk + 6.2, zB]], 0.7);
    b.boxB("detail", "metalDark", (gx + xri) / 2, (sk + yRb) / 2 + 1.0, zA, 1.6, 1.4, 1.8, 0, true);
    b.boxB("detail", "metalDark", (gx2 + xr) / 2, (ys0 + sk) / 2 + 1.2, zB, 1.6, 1.4, 1.8, 0, true);
    var fx0 = xr - Rr - 1.6, fx1 = xr + Rr + 2.4, fz = Rr + 2.4, yLev = [ys0 - 3.5, h * 0.5, yd1 - 1.0];
    [fx0, (fx0 + fx1) / 2, fx1].forEach(function (cx) { [-1, 1].forEach(function (s) { b.boxB("body", "steel", cx, 0, s * fz, 0.55, yLev[2] + 1.2, 0.55); }); });
    for (var yb3 = yRb + 6; yb3 < yRt - 2; yb3 += 9) b.bar("detail", "steel", [xri + rri, yb3, 0], [fx0, yb3, 0], 0.3);
    [-1, 1].forEach(function (s) {
      [[0, yLev[0]], [yLev[0], yLev[1]], [yLev[1], yLev[2]]].forEach(function (yy, j) {
        var ca = j % 2 ? (fx0 + fx1) / 2 : fx0, cb = j % 2 ? fx1 : (fx0 + fx1) / 2;
        b.bar("body", "steel", [ca, yy[0], s * fz], [cb, yy[1], s * fz], 0.35);
        b.bar("body", "steel", [cb, yy[0], s * fz], [ca, yy[1], s * fz], 0.35);
      });
    });
    yLev.forEach(function (yl, j) {
      var holes = [[xr, 0, (j === 0 ? Rs : Rr) + 0.3]];
      b.slab("deck", "deck", fx0, -fz, fx1, fz, yl - 0.3, 0.3, holes, true);
      b.railRect(fx0, -fz, fx1, fz, yl, "nsew");
      [-1, 1].forEach(function (s) { b.box("body", "steel", (fx0 + fx1) / 2, yl - 0.6, s * fz, fx1 - fx0, 0.6, 0.45); });
    });
    b.boxB("body", "steel", fx1 - 0.4, yLev[2], 0, 0.5, 8, 0.5);
    b.box("body", "steel", (fx1 + xr) / 2, yLev[2] + 8, 0, fx1 - xr + 1, 0.6, 0.5);
    b.stairTower(fx1 + 2.0, 0, 0, yLev[2], PI / 2);
    var lv = levelsFrom(sk + 3, yu1 - 0.8, 8.5).filter(function (y) { return y < yc1 - 2 || y > yu0 + 1.5; });
    vesselAccess(b, rAtG, lv, PI + 0.6, {cx: xg, cz: 0, topFull: true});
    b.blob(0, 0, sepx + Rg * 2 + 12, Rg * 2 + 10, true);
  });
  reg("reformer", {dims: {w: 44, d: 16, h: 16}, opts: {}}, function (b, D, O) {
    var w = D.w, dd = D.d, h = D.h, fh = 2.6, i, k;
    var nrow = Math.max(2, Math.round(dd / 4.2)), rowZ = [];
    for (i = 0; i < nrow; i++) rowZ.push(-dd / 2 + dd * (i + 0.5) / nrow);
    b.boxB("body", "concrete", 0, 0, 0, w + 4, 0.3, dd + 4, 0, true);
    for (i = 0; i <= nrow; i++) b.boxB("body", "concrete", 0, 0.3, -dd / 2 + dd * i / nrow, w, 1.5, 0.9, 0, true);
    var nx = Math.max(2, Math.round(w / 4.5) + 1);
    for (i = 0; i < nx; i++) [-1, 1].forEach(function (s) { b.boxB("body", "steel", -w / 2 + 0.3 + i * (w - 0.6) / (nx - 1), 0.3, s * (dd / 2 - 0.3), 0.45, fh - 0.3, 0.45); });
    b.boxB("body", "casing", 0, fh, 0, w, h - fh, dd, 0, true);
    var nb = Math.max(2, Math.round(w / 3.2) + 1);
    for (i = 0; i < nb; i++) [-1, 1].forEach(function (s) { b.boxB("body", "steel", -w / 2 + 0.15 + i * (w - 0.3) / (nb - 1), fh, s * (dd / 2 + 0.15), 0.3, h - fh + 0.4, 0.3); });
    [-1, 1].forEach(function (s) {
      var nz = Math.max(2, Math.round(dd / 3.2) + 1);
      for (var j = 0; j < nz; j++) b.boxB("body", "steel", s * (w / 2 + 0.15), fh, -dd / 2 + j * dd / (nz - 1), 0.3, h - fh + 0.4, 0.3);
      [fh + (h - fh) * 0.35, fh + (h - fh) * 0.7].forEach(function (yg) {
        b.box("body", "steel", 0, yg, s * (dd / 2 + 0.13), w, 0.28, 0.26);
        b.box("body", "steel", s * (w / 2 + 0.13), yg, 0, 0.26, 0.28, dd);
      });
    });
    for (i = 0; i < nb - 1; i++) [-1, 1].forEach(function (s) {
      var xp = -w / 2 + (i + 0.5) * w / (nb - 1);
      [fh + 1.5, fh + (h - fh) * 0.55].forEach(function (yp) { b.box("detail", "dark", xp, yp, s * (dd / 2 + 0.06), 0.45, 0.45, 0.14); });
    });
    var ntube = Math.max(6, Math.round((w - 2) / 0.9));
    rowZ.forEach(function (z) {
      for (var t = 0; t < ntube; t++) {
        var xt = -w / 2 + 1 + (w - 2) * (t + 0.5) / ntube;
        b.vcyl("detail", "metalDark", xt, h, z, 0.1, 1.5, {seg: 6, open: true});
        b.vcyl("body", "metalDark", xt, h, z, 0.14, 0.7, {seg: 6});
      }
      b.cyl2("body", "metal", [-w / 2 + 0.5, h + 1.9, z], [w / 2 - 0.5, h + 1.9, z], 0.4, {seg: 12});
      for (var j = 0; j < 6; j++) b.bar("detail", "steel", [-w / 2 + 1 + j * (w - 2) / 5, h, z], [-w / 2 + 1 + j * (w - 2) / 5, h + 1.5, z], 0.2);
    });
    for (i = 0; i <= nrow; i++) {
      var zb = -dd / 2 + dd * i / nrow;
      if (i === 0 || i === nrow) continue;
      for (k = 0; k < Math.round(w / 2.2); k++) b.boxB("detail", "dark", -w / 2 + 1.1 + k * 2.2, h, zb, 0.7, 0.6, 0.7);
    }
    rowZ.forEach(function (z) { b.cyl2("detail", "metal", [-w / 2 + 0.5, fh - 1.0, z], [w / 2 - 0.5, fh - 1.0, z], 0.35, {seg: 10}); });
    var Lc = w * 0.5, dcz = dd * 0.5, hcv = h * 0.55, xcv0 = w / 2 + 0.4, sTop = stackTopOf(O.stack_h, h, 26), rs = clamp(w * 0.04, 1.2, 2.6);
    b.boxB("body", "casing", xcv0 + Lc / 2, 1.8, 0, Lc, hcv, dcz, 0, true);
    for (i = 0; i <= Math.round(Lc / 4); i++) [-1, 1].forEach(function (s) { b.boxB("body", "steel", xcv0 + i * Lc / Math.round(Lc / 4), 0.3, s * (dcz / 2 + 0.15), 0.3, hcv + 1.5, 0.3); });
    b.boxB("body", "metalDark", xcv0 + Lc + 2.0, 0.3, 0, 4.0, 4.5, dcz * 0.8, 0, true);
    b.cyl2("body", "metalDark", [xcv0 + Lc + 2.0, 2.8, -dcz * 0.4 - 1.2], [xcv0 + Lc + 2.0, 2.8, dcz * 0.4 + 1.2], 1.8, {edge: true});
    var xst = xcv0 + Lc + 6.0;
    b.boxB("body", "metalDark", xst - 2.4, 0.3, 0, 3.0, 3.0, 2.5, 0, false);
    b.vcyl("body", "concrete", xst, 0, 0, rs + 1.0, 0.8, {seg: 8, ry: PI / 8});
    b.vcyl("body", "metalDark", xst, 0.8, 0, rs, sTop - 0.8, {seg: 24});
    b.ring(xst, sTop, 0, rs * 1.003);
    stackBands(b, xst, 0, rs, sTop, sTop);
    b.railRect(-w / 2, -dd / 2, w / 2, dd / 2, h, "nsew");
    [-1, 1].forEach(function (s) {
      var yPe = fh + (h - fh) * 0.55 - 1.0, z0 = s * (dd / 2 + 0.3), z1 = s * (dd / 2 + 1.5);
      b.platform(-w / 2, Math.min(z0, z1), w / 2, Math.max(z0, z1), yPe, s > 0 ? "nwe" : "swe");
      b.ladder(-w / 2 + 2.5, z1, 0.3, yPe + 1.1, 0, s, 2.6);
    });
    b.stairTower(-w / 2 - 1.5 - 1.15, 0, 0.3, h, PI / 2);
    b.blob(w * 0.15, 0, w * 1.6, dd + 6, true);
  });
  function rackLevels(tiers, h) {
    var lv = [], i, top = h > 0 ? h : 5 + 3.5 * (tiers - 1), y1 = Math.min(5, top - 1.5 * (tiers - 1));
    for (i = 0; i < tiers; i++) lv.push(tiers > 1 ? y1 + (top - y1) * i / (tiers - 1) : top);
    return lv;
  }
  function rackFrame(b, o) {
    var x0 = o.x0, x1 = o.x1, w = o.w, y0 = o.y0 || 0, lv = o.levels, tiers = lv.length, rnd = o.rnd, i, k;
    var l = x1 - x0, nbay = Math.max(1, Math.round(l / 6)), bay = l / nbay, ytop = lv[tiers - 1];
    var ncz = w > 12 ? 3 : 2, czs = [];
    for (i = 0; i < ncz; i++) czs.push(-w / 2 + w * i / (ncz - 1));
    var cs = clamp(w * 0.03, 0.4, 0.5);
    for (i = 0; i <= nbay; i++) {
      var x = x0 + i * bay;
      czs.forEach(function (z) {
        b.boxB("body", "concrete", x, y0, z, 1.2, 0.6, 1.2, 0, false);
        b.boxB("body", "steel", x, y0 + 0.6, z, cs, ytop - 0.6, cs, 0, o.solo);
      });
      for (k = 0; k < tiers; k++) b.box("body", "steel", x, y0 + lv[k] - 0.25, 0, cs * 0.9, 0.5, w + 0.5, 0, o.solo);
      [-1, 1].forEach(function (s) {
        b.bar("body", "steel", [x, y0 + ytop - 1.6, s * (w / 2)], [x, y0 + ytop - 0.45, s * (w / 2 - 1.3)], 0.22);
      });
    }
    [-w / 2, w / 2].forEach(function (z) {
      for (k = 0; k < tiers; k++) b.box("body", "steel", (x0 + x1) / 2, y0 + lv[k] - 0.3, z, l, 0.35, 0.3);
      for (i = 1; i < nbay; i += 4) {
        var xa = x0 + i * bay, xb = xa + bay;
        b.bar("body", "steel", [xa, y0 + 0.6, z], [xb, y0 + lv[0] - 0.4, z], 0.26);
        b.bar("body", "steel", [xb, y0 + 0.6, z], [xa, y0 + lv[0] - 0.4, z], 0.26);
        if (tiers > 1) {
          b.bar("body", "steel", [xa, y0 + lv[0], z], [xb, y0 + lv[1] - 0.4, z], 0.22);
          b.bar("body", "steel", [xb, y0 + lv[0], z], [xa, y0 + lv[1] - 0.4, z], 0.22);
        }
      }
    });
    var sizes = [0.1, 0.15, 0.15, 0.2, 0.25, 0.3, 0.3, 0.4, 0.45, 0.55], loopPipe = null;
    for (k = 0; k < tiers; k++) {
      var yb = y0 + lv[k], z = -w / 2 + 0.5, list = [];
      while (true) {
        var rp = sizes[Math.floor(rnd() * sizes.length)] * (k === 0 ? 1.2 : k === tiers - 1 ? 0.8 : 1);
        if (z + 2 * rp > w / 2 - 0.4) break;
        var mat = rnd() < 0.5 ? "metal" : (rnd() < 0.55 ? "metalDark" : (rnd() < 0.6 ? "pipeA" : "white"));
        list.push({zc: z + rp, yc: yb + rp + 0.05, rp: rp, mat: mat});
        z += 2 * rp + 0.35 + rnd() * 0.6;
        if (rnd() < 0.18) z += 0.9;
      }
      if (k === tiers - 1 && o.loop && l >= 36 && list.length) loopPipe = list.pop();
      list.forEach(function (q) {
        b.cyl2("body", q.mat, [x0 - 0.6, q.yc, q.zc], [x1 + 0.6, q.yc, q.zc], q.rp, {seg: q.rp < 0.2 ? 8 : q.rp < 0.4 ? 12 : 16});
      });
    }
    if (loopPipe) {
      var p = loopPipe, xm = (x0 + x1) / 2, xl0 = xm - bay * 0.5 - 2.0, xl1 = xm + bay * 0.5 + 2.0, zo = w / 2 + 4.5;
      b.pipe("body", p.mat, [[x0 - 0.6, p.yc, p.zc], [xl0, p.yc, p.zc], [xl0, p.yc, zo], [xl1, p.yc, zo], [xl1, p.yc, p.zc], [x1 + 0.6, p.yc, p.zc]], p.rp);
      b.box("body", "steel", xm - bay * 0.5, y0 + ytop - 0.15, w / 2 + 2.5, 0.3, 0.3, 5.0);
      b.box("body", "steel", xm + bay * 0.5, y0 + ytop - 0.15, w / 2 + 2.5, 0.3, 0.3, 5.0);
    }
  }
  reg("rack", {dims: {l: 60, w: 10}, opts: {tiers: 3}}, function (b, D, O, eq) {
    var l = D.l, w = D.w, tiers = clamp(Math.round(+O.tiers || 3), 1, 4);
    rackFrame(b, {x0: -l / 2, x1: l / 2, w: w, levels: rackLevels(tiers, +O.h), rnd: rng(eq.id || "rack"), loop: true});
    b.blob(0, 0, l + 4, w + 4, true);
  });
  reg("air_cooler", {dims: {l: 12, w: 10}, opts: {}}, function (b, D, O, eq) {
    var l = D.l, w = D.w, z0 = +eq.z0 || 0, onRack = O.on_rack === true || z0 > 0, i, k, j;
    var ye = onRack ? 1.0 : (+O.elev > 0 ? +O.elev : 9), induced = O.draft !== "forced";
    var nbay = Math.max(1, Math.round(+O.bays > 0 ? +O.bays : l / 12)), bl = l / nbay;
    var nrow = Math.max(1, Math.round(w / 8)), wr = w / nrow, nbu = Math.max(1, Math.round(wr / 3.0)), bw = wr / nbu;
    var nf = Math.max(1, Math.round(bl / 6)), fl = (bl - 1.6) / nf, fr = Math.min(wr, fl) * 0.42;
    var yMot = ye + 1.6, yRing = ye + 2.9, yPl = yRing + 1.0, yBu = yPl + Math.max(1.4, fr * 0.55), tb = 0.95;
    if (induced) { yBu = ye + 1.6; yPl = yBu + tb; yRing = yPl + Math.max(1.2, fr * 0.45); yMot = yRing + 1.2; }
    var yB1 = yBu + tb, yOH = onRack ? 0.75 : ye + 0.6;
    for (i = 0; i < nbay; i++) {
      var xb0 = -l / 2 + i * bl, xbc = xb0 + bl / 2;
      for (k = 0; k < nrow; k++) {
        var zr = -w / 2 + wr * (k + 0.5);
        for (j = 0; j < nbu; j++) {
          var zb = zr - wr / 2 + bw * (j + 0.5);
          b.boxB("body", "fan", xbc, yBu, zb, bl - 1.5, tb, bw - 0.14, 0, true);
          [-1, 1].forEach(function (s) { b.boxB("body", "steel", xbc, yBu - 0.05, zb + s * (bw / 2 - 0.1), bl - 1.4, tb + 0.1, 0.12); });
          for (var t = 1; t < 4; t++) {
            var zt = zb - bw / 2 + 0.1 + (bw - 0.2) * t / 4;
            b.seg([xb0 + 0.75, yB1 + 0.01, zt], [xb0 + bl - 0.75, yB1 + 0.01, zt]);
          }
        }
        [-1, 1].forEach(function (s) {
          for (var t2 = 1; t2 < 7; t2++) b.seg([xb0 + 0.75, yBu + tb * t2 / 7, zr + s * (wr / 2 - 0.01)], [xb0 + bl - 0.75, yBu + tb * t2 / 7, zr + s * (wr / 2 - 0.01)]);
        });
        for (var f = 0; f < nf; f++) {
          var xf = xb0 + 0.8 + fl * (f + 0.5);
          if (induced) b.frustum("body", "casing", xf, yPl, zr, fl - 0.1, wr - 0.2, fr * 2.05, fr * 2.05, yRing - yPl, true);
          else b.frustum("body", "casing", xf, yPl, zr, fr * 2.05, fr * 2.05, fl - 0.1, wr - 0.2, yBu - yPl, true);
          b.vcyl("body", "dark", xf, induced ? yRing : yRing, zr, fr, 1.0, {seg: 32, open: true, edge: true});
          b.vcyl("body", "metalDark", xf, (induced ? yRing + 0.95 : yRing - 0.05), zr, fr * 1.06, 0.12, {seg: 32, open: true});
          var yDisc = yRing + 0.5;
          b.vcyl("detail", "fan", xf, yDisc, zr, fr * 0.96, 0.04, {seg: 32});
          for (var bl2 = 0; bl2 < 3; bl2++) b.box("detail", "dark", xf, yDisc + 0.06, zr, fr * 1.85, 0.05, 0.45, bl2 * PI / 3 + 0.3);
          b.vcyl("detail", "dark", xf, yDisc - 0.2, zr, fr * 0.16, 0.45, {seg: 12});
          var ym = induced ? yMot : yMot - 1.1;
          b.vcyl("body", "metalDark", xf, ym, zr, 0.42, 1.1, {seg: 14, edge: true});
          b.vcyl("detail", "dark", xf, ym + 1.1, zr, 0.12, yDisc - ym - 1.1 - 0.15, {seg: 8});
          b.box("body", "steel", xf, induced ? ym - 0.15 : ym - 0.15, zr, 0.3, 0.3, wr - 0.3);
        }
      }
      [0, 1].forEach(function (e) {
        var xh = e ? xb0 + bl - 0.4 : xb0 + 0.4;
        b.boxB("body", "metalDark", xh, yBu - 0.2, 0, 0.75, tb + 0.45, w - 0.2, 0, true);
        for (k = 0; k < nrow; k++) {
          var zr2 = -w / 2 + wr * (k + 0.5);
          if (e === 0) b.nozzle("detail", [xh, yB1 + 0.2, zr2 - wr * 0.25], [xh, yB1 + 0.85, zr2 - wr * 0.25], 0.22);
          else if (!induced) b.pipe("detail", "metal", [[xh, yBu - 0.2, zr2 + wr * 0.2], [xh, yRing - 0.4, zr2 + wr * 0.2]], 0.16);
          else b.pipe("body", "metalDark", [[xh, yBu - 0.2, zr2 + wr * 0.2], [xh, yOH, zr2 + wr * 0.2]], 0.24);
        }
      });
      var yw = yBu - 0.35, xw = xb0;
      b.box("deck", "deck", xw, yw - 0.12, 0, 1.2, 0.24, w, 0, true);
      if (i === 0) b.rail([[xw - 0.6, -w / 2], [xw - 0.6, w / 2]], yw);
      if (i === nbay - 1) { b.box("deck", "deck", xb0 + bl, yw - 0.12, 0, 1.2, 0.24, w, 0, true); b.rail([[xb0 + bl + 0.6, -w / 2], [xb0 + bl + 0.6, w / 2]], yw); }
    }
    var rv = clamp(w * 0.04, 0.35, 0.8), yv = yB1 + (induced ? 2.6 : 1.8) + rv, zv = induced ? -w / 2 - 0.6 : -w / 2 + 0.9;
    b.cyl2("body", "metal", [-l / 2 - 1.5, yv, zv], [l / 2 - 0.5, yv, zv], rv, {seg: 16});
    for (i = 0; i < nbay; i++) {
      var xi = -l / 2 + i * bl + 0.4;
      for (k = 0; k < nrow; k++) {
        var zn = -w / 2 + wr * (k + 0.25);
        b.pipe("body", "metal", [[xi, yv, zv], [xi, yv, zn], [xi, yB1 + 0.85, zn]], rv * 0.45);
      }
      b.bar("detail", "steel", [xi, yB1 + 0.3, zv], [xi, yv - rv, zv], 0.18);
    }
    b.pipe("body", "metal", [[-l / 2 - 1.5, yv, zv], [-l / 2 - 1.5, ye + 0.6, zv]], rv);
    if (induced) for (k = 0; k < nrow; k++) {
      var zo = -w / 2 + wr * (k + 0.5) + wr * 0.2;
      b.pipe("body", "metalDark", [[-l / 2 + 0.4, yOH, zo], [l / 2 + 1.6, yOH, zo], [l / 2 + 1.6, yOH - (onRack ? 3.0 : 0), zo]], 0.36);
    }
    var ybase = onRack ? 0 : 0.4;
    for (i = 0; i <= nbay; i++) {
      var xp = -l / 2 + i * bl;
      for (k = 0; k <= nrow; k++) {
        var zp = -w / 2 + wr * k;
        if (!onRack) b.boxB("body", "concrete", xp, 0, zp, 0.9, 0.4, 0.9, 0, false);
        b.boxB("body", "steel", xp, ybase, zp, 0.4, (induced ? yBu : yBu) - ybase, 0.4);
      }
      b.box("body", "steel", xp, yBu - 0.2, 0, 0.4, 0.4, w);
    }
    [-w / 2, w / 2].forEach(function (z) {
      b.box("body", "steel", 0, yBu - 0.2, z, l, 0.4, 0.4);
      if (!onRack) b.box("body", "steel", 0, ye - 0.2, z, l, 0.4, 0.4);
      for (i = 0; i < nbay; i += Math.max(1, nbay - 1)) {
        var xa = -l / 2 + i * bl, xc = xa + bl;
        b.bar("body", "steel", [xa, ybase, z], [xc, yBu - 0.4, z], 0.22);
        b.bar("body", "steel", [xc, ybase, z], [xa, yBu - 0.4, z], 0.22);
      }
    });
    var ymw = induced ? yB1 + 0.3 : Math.max(ybase + 0.3, yMot - 1.4);
    b.box("deck", "deck", 0, ymw - 0.12, w / 2 + 0.7, l, 0.24, 1.2, 0, true);
    b.rail([[-l / 2, w / 2 + 1.3], [l / 2, w / 2 + 1.3]], ymw);
    b.ladder(l / 2 + 0.6, w / 2 + 0.7, ymw, yw + 1.1, 1, 0, ymw + 2.2);
    if (!onRack) b.ladder(l / 2 + 1.0, w / 2 - 1.0, 0, ymw + 1.1, 1, 0, 2.4);
    var sid = b.ctx && b.ctx.solo;
    if (onRack && z0 > 3 && sid && sid === eq.id) {
      var ext = 6 * Math.max(1, Math.round(Math.min(18, l * 0.15) / 6));
      rackFrame(b, {x0: -l / 2 - ext, x1: l / 2 + ext, w: w, levels: rackLevels(z0 > 10 ? 3 : 2, z0), y0: -z0,
        rnd: rng(eq.id + "-rack"), loop: false, solo: true});
      b.blobs.push([0, 0, l + 2 * ext + 4, w + 4, 6]);
      b.blobY = -z0;
    } else b.blob(0, 0, l + 4, w + 4, true);
  });
  reg("compressor_house", {dims: {w: 30, d: 16, h: 14}}, function (b, D) {
    var w = D.w, dd = D.d, h = D.h, i, hr = dd * 0.09;
    b.boxB("body", "concrete", 0, 0, 0, w + 2, 0.3, dd + 2, 0, true);
    var nx = Math.max(2, Math.round(w / 6) + 1);
    for (i = 0; i < nx; i++) [-1, 1].forEach(function (s) { b.boxB("body", "steel", -w / 2 + i * w / (nx - 1), 0.3, s * dd / 2, 0.5, h - 0.3, 0.5); });
    b.prismX("body", "roof", 0, h, 0, w + 1.0, [[-dd / 2 - 0.6, 0], [0, hr], [dd / 2 + 0.6, 0], [dd / 2 + 0.6, 0.35], [0, hr + 0.35], [-dd / 2 - 0.6, 0.35]], true);
    [-1, 1].forEach(function (s) {
      b.box("body", "roof", 0, h - 0.6, s * (dd / 2 + 0.3), w + 0.5, 1.2, 0.12, 0, true);
      b.prismX("body", "roof", s * (w / 2 + 0.3), h - 1.2, 0, 0.12, [[-dd / 2, 0], [dd / 2, 0], [dd / 2, 1.2], [0, 1.2 + hr], [-dd / 2, 1.2]], true);
      b.box("body", "steel", 0, h - 0.2, s * dd / 2, w, 0.45, 0.35);
    });
    for (i = 0; i < nx; i++) b.box("body", "steel", -w / 2 + i * w / (nx - 1), h - 0.25, 0, 0.35, 0.5, dd);
    [-1, 1].forEach(function (s) { b.box("body", "steel", 0, h - 3.6, s * (dd / 2 - 0.5), w, 0.7, 0.45); });
    b.box("body", "crane", -w * 0.25, h - 2.8, 0, 1.1, 0.9, dd - 1.0, 0, true);
    b.box("body", "crane", -w * 0.25, h - 3.6, 0, 1.6, 0.9, 1.8, 0, true);
    var yd = clamp(h * 0.36, 4, 6), tx = w * 0.4, tz = dd * 0.3, trains = dd >= 20 ? [-dd * 0.18, dd * 0.18] : [0];
    [-tx + 0.6, -tx / 3, tx / 3, tx - 0.6].forEach(function (x) { [-1, 1].forEach(function (s) { b.boxB("body", "concrete", x, 0.3, s * (tz - 0.6), 1.0, yd - 1.1, 1.0); }); });
    b.boxB("body", "concrete", 0, yd - 0.8, 0, 2 * tx, 0.8, 2 * tz, 0, true);
    b.railRect(-tx, -tz, tx, tz, yd, "nsw");
    trains.forEach(function (z) {
      var x0 = -tx + 1.0;
      b.boxB("body", "metalDark", x0 + 2.4, yd, z, 4.8, 2.5, 2.6, 0, true);
      b.cyl2("body", "metalDark", [x0 + 0.1, yd + 1.5, z], [x0 + 4.9, yd + 1.5, z], 1.25, {edge: true});
      b.cyl2("detail", "dark", [x0 + 4.9, yd + 1.5, z], [x0 + 5.9, yd + 1.5, z], 0.35, {});
      b.boxB("body", "metal", x0 + 6.6, yd, z, 1.6, 2.0, 2.0, 0, true);
      var xc = x0 + 7.6;
      [[xc, 4.0, 1.35], [xc + 5.2, 3.6, 1.2]].forEach(function (c, j) {
        b.cyl2("body", "metal", [c[0], yd + 1.6, z], [c[0] + c[1], yd + 1.6, z], c[2], {edge: true});
        b.cyl2("body", "metalDark", [c[0], yd + 1.6, z], [c[0] + 0.3, yd + 1.6, z], c[2] * 1.12, {});
        b.cyl2("body", "metalDark", [c[0] + c[1] - 0.3, yd + 1.6, z], [c[0] + c[1], yd + 1.6, z], c[2] * 1.12, {});
        b.boxB("body", "metalDark", c[0] + c[1] / 2, yd, z, c[1] * 0.7, 0.5, c[2] * 1.8, 0, false);
        var rp = 0.45 - j * 0.08;
        b.pipe("body", "metal", [[c[0] + c[1] * 0.3, yd + 1.6 + c[2] - 0.1, z], [c[0] + c[1] * 0.3, yd + 1.6 + c[2] + 1.6, z], [c[0] + c[1] * 0.3, yd + 1.6 + c[2] + 1.6, z - dd * 0.5 - 2]], rp);
        b.pipe("body", "metal", [[c[0] + c[1] * 0.7, yd + 0.4, z], [c[0] + c[1] * 0.7, 1.4, z], [c[0] + c[1] * 0.7, 1.4, z - dd * 0.5 - 2]], rp * 0.9);
        if (j === 0) b.cyl2("detail", "dark", [c[0] + c[1], yd + 1.6, z], [c[0] + 5.2, yd + 1.6, z], 0.35, {});
        if (z === trains[0]) {
          var xk = c[0] + c[1] * 0.5, zk = z - dd * 0.5 - 3.3, rk = 1.15, hk = yd + 4.5;
          plinth(b, xk, zk, rk + 0.6, 0.3);
          b.vcyl("body", "metal", xk, 0.3, zk, rk, hk - rk * 0.5 - 0.3, {open: true});
          b.head("body", "metal", xk, hk - rk * 0.5, zk, rk, rk * 0.5);
          b.ring(xk, 0.3, zk, rk * 1.003);
        }
      });
    });
    b.boxB("body", "metalDark", tx * 0.6, 0.3, dd / 2 - 1.8, 4.0, 2.0, 2.4, 0, true);
    b.vcyl("body", "metal", tx * 0.6 - 1.0, 2.3, dd / 2 - 1.8, 0.5, 1.4, {});
    b.vcyl("body", "metal", tx * 0.6 + 1.0, 2.3, dd / 2 - 1.8, 0.5, 1.4, {});
    var fl = yd / Math.tan(38 * PI / 180);
    b.flight([tx + fl + 0.2, 0.3, -tz + 1.2], [tx + 0.2, yd, -tz + 1.2], 1.0);
    b.blob(0, 0, w + 5, dd + 5, true);
  });
  reg("exchanger", {dims: {d: 1.4, l: 8}, opts: {n: 4}}, function (b, D, O) {
    var d = D.d, l = D.l, r = d / 2, n = clamp(Math.round(+O.n || 2), 1, 12), ns = Math.ceil(n / 2), pitch = d + 1.8, k;
    var yA = clamp(r + 1.0, 1.4, 2.2), yB = yA + d + 0.9, lc = Math.max(0.9, l * 0.13), xs0 = -l / 2;
    var xsad = [xs0 + lc + l * 0.12, l / 2 - l * 0.2];
    function oneShell(yc, z) {
      var xa = xs0 + 0.15, xch = xs0 + lc, xe = l / 2 - r * 0.5 - 0.35;
      b.cyl2("body", "metal", [xa, yc, z], [xch, yc, z], r * 1.06, {seg: 24, edge: true});
      b.cyl2("body", "metalDark", [xs0, yc, z], [xa, yc, z], r * 1.2, {seg: 24, edge: true});
      b.cyl2("body", "metalDark", [xch - 0.08, yc, z], [xch + 0.12, yc, z], r * 1.2, {seg: 24});
      b.cyl2("body", "metal", [xch + 0.12, yc, z], [xe, yc, z], r, {seg: 24, open: true});
      b.cyl2("body", "metalDark", [xe, yc, z], [xe + 0.2, yc, z], r * 1.16, {seg: 24});
      b.cyl2("body", "metal", [xe + 0.2, yc, z], [xe + 0.35, yc, z], r * 1.08, {seg: 24, open: true});
      b.headDir("body", "metal", [xe + 0.35, yc, z], [1, 0, 0], r * 1.08, r * 0.5, 24);
      b.ringDir([xe - (xe - xch) * 0.5, yc, z], [1, 0, 0], r * 1.004, 32);
      var rn = clamp(r * 0.32, 0.12, 0.4);
      b.nozzle("detail", [xs0 + lc * 0.55, yc + r * 0.9, z], [xs0 + lc * 0.55, yc + r + 0.45, z], rn);
      b.nozzle("detail", [xs0 + lc * 0.55, yc - r * 0.9, z], [xs0 + lc * 0.55, yc - r - 0.45, z], rn);
      b.nozzle("detail", [xe - 0.9, yc + r * 0.9, z], [xe - 0.9, yc + r + 0.45, z], rn * 0.95);
      b.nozzle("detail", [xch + 0.9, yc - r * 0.9, z], [xch + 0.9, yc - r - 0.45, z], rn * 0.95);
    }
    for (k = 0; k < ns; k++) {
      var z = (k - (ns - 1) / 2) * pitch, two = (2 * k + 1) < n;
      oneShell(yA, z);
      xsad.forEach(function (xs) {
        b.boxB("body", "concrete", xs, 0, z, 0.8, yA - r * 0.75, d + 0.5, 0, true);
        b.boxB("body", "steel", xs, yA - r * 0.75, z, 0.3, r * 0.5, d * 0.9, 0, false);
        if (two) b.boxB("body", "steel", xs, yA + r * 0.7, z, 0.3, yB - yA - r * 1.4, d * 0.8, 0, true);
      });
      if (two) {
        oneShell(yB, z);
        b.pipe("body", "metal", [[xs0 + lc * 0.55, yA + r + 0.45, z], [xs0 + lc * 0.55, yB - r - 0.45, z]], clamp(r * 0.3, 0.12, 0.38));
        b.pipe("body", "metal", [[l / 2 - r * 0.5 - 1.25, yA + r + 0.45, z], [l / 2 - r * 0.5 - 1.25, yB - r * 0.9, z]], clamp(r * 0.28, 0.1, 0.35));
      }
    }
    if (n > 1) {
      var yp = yB - r - 0.2, zA = -(ns - 1) / 2 * pitch - r - 0.6, zB = (ns - 1) / 2 * pitch + r + 0.6;
      b.platform(xs0 - 1.6, zA, xs0 - 0.2, zB, yp, "nsw");
      [zA + 0.2, zB - 0.2].forEach(function (zz) { b.bar("deck", "steel", [xs0 - 1.4, 0, zz], [xs0 - 1.4, yp - 0.25, zz], 0.16); });
      b.ladder(xs0 - 0.9, zB + 0.4, 0, yp + 1.1, 0, 1, null);
    }
    b.blob(0, 0, l + 4, ns * pitch + 3, true);
  });
  KIT.helpers.process = {Builder: Builder, getMat: getMat, lod: lod, vesselAccess: vesselAccess, profR: profR,
    shell: shell, hVessel: hVessel, saddle: saddle, plinth: plinth, rng: rng};
})();
