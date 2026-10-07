/* ============================================================
 * SpaceSim — Heliocentric Mission Planner
 * 3D solar system + real transfer-orbit mission simulation.
 *
 * Coordinate mapping: heliocentric ecliptic J2000 (x, y, z-north)
 *   -> three.js (x, z, -y)  [three +Y = ecliptic north]
 * Scale: 1 AU = 10 scene units. Body radii are sqrt-scaled so the
 * system stays visible at system view while preserving relative
 * proportions; moon orbits are per-system scaled (constant factor
 * per moon) so relative spacing within each system is preserved.
 * ============================================================ */
(function () {
  "use strict";
  var P = window.SpacePhysics;
  var AU = 10;                    // scene units per AU
  var AU_KM = P.AU_KM;
  var KMS = P.AU_DAY_KMS;

  function toV3(p) { return new THREE.Vector3(p.x * AU, p.z * AU, -p.y * AU); }
  // scene-space vector (input already in scene units, e.g. a display-scaled moon offset)
  function toV3u(p) { return new THREE.Vector3(p.x, p.z, -p.y); }

  // ------------------------------------------------------------
  // Body catalog
  // ------------------------------------------------------------
  var PLANETS = [
    { id: "mercury", name: "Mercury", tex: "mercury.jpg", tilt: 0.03,   day: 58.646,   rKm: 2439.7 },
    { id: "venus",   name: "Venus",   tex: "venus.jpg",   tilt: 177.4,  day: -243.02,  rKm: 6051.8 },
    { id: "earth",   name: "Earth",   tex: "earth.jpg",   tilt: 23.44,  day: 0.99727,  rKm: 6371 },
    { id: "mars",    name: "Mars",    tex: "mars.jpg",    tilt: 25.19,  day: 1.02596,  rKm: 3389.5 },
    { id: "jupiter", name: "Jupiter", tex: "jupiter.jpg", tilt: 3.13,   day: 0.41354,  rKm: 69911 },
    { id: "saturn",  name: "Saturn",  tex: "saturn.jpg",  tilt: 26.73,  day: 0.44401,  rKm: 58232, ring: "saturn_ring.png" },
    { id: "uranus",  name: "Uranus",  tex: "uranus.jpg",  tilt: 97.77,  day: -0.71833, rKm: 25362 },
    { id: "neptune", name: "Neptune", tex: "neptune.jpg", tilt: 28.32,  day: 0.67125,  rKm: 24622 },
    { id: "pluto",   name: "Pluto",   tex: "pluto.jpg",   tilt: 122.53,  day: -6.387,   rKm: 1188.3 }
  ];

  // Moons without a bitmap texture get a procedural one.
  var MOONS = [
    { id: "moon",     name: "Moon",     tex: "moon.jpg", parent: "earth",   day: 27.322, rKm: 1737.4 },
    { id: "phobos",   name: "Phobos",   proc: { base: "#5a544d", bands: 0.10, speckle: 0.50, lineae: 0 }, parent: "mars", day: 0.31888, rKm: 11.3 },
    { id: "deimos",   name: "Deimos",   proc: { base: "#6e675e", bands: 0.08, speckle: 0.35, lineae: 0 }, parent: "mars", day: 1.26244, rKm: 6.2 },
    { id: "io",       name: "Io",       proc: { base: "#c8b06a", bands: 0.25, speckle: 0.55, lineae: 0.2 }, parent: "jupiter", day: 1.76914, rKm: 1821.6 },
    { id: "europa",   name: "Europa",   proc: { base: "#b8a894", bands: 0.12, speckle: 0.18, lineae: 0.8 }, parent: "jupiter", day: 3.55118, rKm: 1560.8 },
    { id: "ganymede", name: "Ganymede", proc: { base: "#8a7f72", bands: 0.30, speckle: 0.40, lineae: 0 }, parent: "jupiter", day: 7.15456, rKm: 2634.1 },
    { id: "callisto", name: "Callisto", proc: { base: "#5f574e", bands: 0.22, speckle: 0.65, lineae: 0 }, parent: "jupiter", day: 16.689,  rKm: 2410.3 },
    { id: "titan",    name: "Titan",    proc: { base: "#c79a52", bands: 0.35, speckle: 0.12, lineae: 0 }, parent: "saturn",  day: 15.9454, rKm: 2574.7 },
    { id: "triton",   name: "Triton",   proc: { base: "#c4b2a4", bands: 0.15, speckle: 0.30, lineae: 0.15 }, parent: "neptune", day: 5.8769,  rKm: 1353.4 }
  ];

  // Interstellar probes — linear motion from a JPL state vector (see P.PROBES).
  // lenM = overall model length in metres (boom tip to dish), for display scaling.
  var INTERSTELLAR_PROBES = [
    { id: "voyager1", name: "Voyager 1", tag: "PROBE", parent: "Interstellar", lenM: 16.3 },
    { id: "voyager2", name: "Voyager 2", tag: "PROBE", parent: "Interstellar", lenM: 16.3 }
  ];
  // Earth-orbiting probes: Hubble in LEO, JWST on a Sun-Earth L2 halo orbit.
  var EARTH_PROBES = [
    { id: "hubble", name: "Hubble Space Telescope", tag: "PROBE", parent: "Earth LEO" },
    { id: "jwst",   name: "James Webb Space Telescope", tag: "PROBE", parent: "Earth L2" }
  ];

  var DESTINATIONS = [];
  DESTINATIONS.push({ id: "earth", name: "Earth (Return)", tag: "HOME", parent: "Sun" });
  PLANETS.forEach(function (p) { if (p.id !== "earth") DESTINATIONS.push({ id: p.id, name: p.name, tag: "PLANET", parent: "Sun" }); });
  MOONS.forEach(function (m) {
    var parentName = PLANETS.filter(function (p) { return p.id === m.parent; })[0].name;
    DESTINATIONS.push({ id: m.id, name: m.name, tag: "MOON", parent: parentName });
  });
  INTERSTELLAR_PROBES.forEach(function (pr) { DESTINATIONS.push({ id: pr.id, name: pr.name, tag: pr.tag, parent: pr.parent }); });
  EARTH_PROBES.forEach(function (pr) { DESTINATIONS.push({ id: pr.id, name: pr.name, tag: pr.tag, parent: pr.parent }); });

  // ------------------------------------------------------------
  // Display sizing
  // ------------------------------------------------------------
  function planetDisplayR(p) { return 10 * Math.sqrt(p.rKm / AU_KM); }
  function moonDisplayR(m)  { return Math.max(6 * Math.sqrt(m.rKm / AU_KM), 0.0045); }
  function moonOrbitR(m) {
    // Per-system scaling: innermost moon sits at 1.9x the parent's display
    // radius, outermost at 5.5x; power curve preserves relative spacing.
    var parent = PLANETS.filter(function (p) { return p.id === m.parent; })[0];
    var siblings = MOONS.filter(function (o) { return o.parent === m.parent; });
    var aOuter = 0;
    siblings.forEach(function (s) { aOuter = Math.max(aOuter, P.MOONS[s.id].aKm); });
    var t = Math.pow(P.MOONS[m.id].aKm / aOuter, 0.55);
    return planetDisplayR(parent) * (1.9 + 3.6 * t);
  }
  function moonScaleFactor(m) { return moonOrbitR(m) / (P.MOONS[m.id].aKm / AU_KM); }

  // camera distance used when focusing a body: far enough that the whole
  // displayed moon system (outermost visual orbit) stays in frame
  function outerMoonOrbitR(bodyId) {
    var r = 0;
    MOONS.forEach(function (m) { if (m.parent === bodyId) r = Math.max(r, moonOrbitR(m)); });
    return r;
  }
  function bodyFocusDist(bodyId) {
    var R = planetObjs[bodyId] ? planetObjs[bodyId].R : 0;
    return Math.max(R * 4.2, outerMoonOrbitR(bodyId) * 2.5, 0.30);
  }

  // ------------------------------------------------------------
  // Simulation state
  // ------------------------------------------------------------
  var simDays = P.daysFromUTC(new Date());   // sim time, days since J2000
  var daysPerSec = 1;
  var paused = false;
  var mission = null;                        // { destId, plan, orb, tLaunch, line, marker, isBallistic }
  var followRocket = false;
  var followBody = null;                     // body id camera target is locked to
  var flyAnim = null;                        // { t0, dur, fromTarget, fromCam, targetFn, endDist }

  // ------------------------------------------------------------
  // Three.js core
  // ------------------------------------------------------------
  var viewport = document.getElementById("viewport");
  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  viewport.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  var camera = new THREE.PerspectiveCamera(55, viewport.clientWidth / viewport.clientHeight, 0.004, 20000);
  // default "system view": frames the full 30 AU span (Neptune's orbit)
  camera.position.set(0, 520, 240);

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.04;
  // 4000 scene units = 400 AU: well past Neptune, with room for the
  // Voyager probes drifting outward into interstellar space
  controls.maxDistance = 4000;

  var ambient = new THREE.AmbientLight(0x223344, 0.35);
  scene.add(ambient);
  var sunLight = new THREE.PointLight(0xffffff, 1.7, 0, 0);
  scene.add(sunLight);

  // ------------------------------------------------------------
  // Texture helpers
  // ------------------------------------------------------------
  function glowTexture(inner, outer, size) {
    size = size || 256;
    var c = document.createElement("canvas"); c.width = c.height = size;
    var ctx = c.getContext("2d");
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.25, outer);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function ringMarkerTexture() {
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var ctx = c.getContext("2d");
    ctx.strokeStyle = "rgba(255,179,71,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(64, 64, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,179,71,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.stroke();
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // Procedural texture for moons without a bitmap: base color + latitude
  // banding + speckle + optional lineae (crack lines, Europa-style).
  function proceduralTexture(spec) {
    var w = 256, h = 128;
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var ctx = c.getContext("2d");
    ctx.fillStyle = spec.base;
    ctx.fillRect(0, 0, w, h);
    // latitude bands
    var nb = 14;
    for (var i = 0; i < nb; i++) {
      var y0 = (i / nb) * h, y1 = ((i + 1) / nb) * h;
      var l = (Math.sin(i * 2.7) * 0.5 + 0.5) * spec.bands;
      ctx.fillStyle = "rgba(255,255,255," + (l * 0.35).toFixed(3) + ")";
      if (i % 2 === 0) ctx.fillRect(0, y0, w, y1 - y0);
      else { ctx.fillStyle = "rgba(0,0,0," + (l * 0.30).toFixed(3) + ")"; ctx.fillRect(0, y0, w, y1 - y0); }
    }
    // speckle
    var n = Math.floor(spec.speckle * 900);
    for (var s = 0; s < n; s++) {
      var x = Math.random() * w, y = Math.random() * h, r = 0.5 + Math.random() * 1.6;
      var bright = Math.random() > 0.45;
      ctx.fillStyle = bright ? "rgba(255,244,214," + (0.05 + Math.random() * 0.14).toFixed(3) + ")"
                             : "rgba(20,14,8," + (0.05 + Math.random() * 0.16).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // lineae (thin crack lines)
    if (spec.lineae > 0) {
      var nl = Math.floor(spec.lineae * 26);
      ctx.strokeStyle = "rgba(120,70,40,0.35)";
      ctx.lineWidth = 0.7;
      for (var l2 = 0; l2 < nl; l2++) {
        var x2 = Math.random() * w, y2 = Math.random() * h;
        var len = 20 + Math.random() * 70, ang = Math.random() * 1.2 - 0.6;
        ctx.beginPath(); ctx.moveTo(x2, y2);
        ctx.quadraticCurveTo(x2 + len * 0.5, y2 + Math.sin(ang) * len * 0.5, x2 + len, y2 + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ------------------------------------------------------------
  // World construction
  // ------------------------------------------------------------
  var pickables = [];            // meshes for raycast picking
  var planetObjs = {};           // id -> { group, mesh, tiltG, label, data }
  var moonObjs = {};             // id -> { mesh, orbitLine, data, parentGroup }
  var probeObjs = {};            // id -> { group, proxy, data, focusDist }
  var orbitLines = [];
  var beltGroups = [];
  var labelObjs = [];            // { el, getPos(), kind, parentRef }

  var labelLayer = document.getElementById("labels");
  function makeLabel(text, kind) {
    var el = document.createElement("div");
    el.className = "body-label" + (kind === "moon" ? " moon-label" : kind === "rocket" ? " rocket-label" : kind === "dest" ? " dest-label" : "");
    el.innerHTML = text + '<span class="tick"></span>';
    labelLayer.appendChild(el);
    return el;
  }
  function addLabelObj(el, getPos, kind, parentRef, aUnits, thresh) {
    labelObjs.push({ el: el, getPos: getPos, kind: kind, parentRef: parentRef || null, aUnits: aUnits || 0, thresh: thresh || 0 });
  }

  function buildSkybox(tex) {
    var geo = new THREE.SphereGeometry(1600, 48, 24);
    var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false });
    scene.add(new THREE.Mesh(geo, mat));
    // extra procedural star points for density + sparkle
    var N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      var r2 = Math.sqrt(1 - u * u);
      var R = 1480;
      pos[i * 3] = r2 * Math.cos(th) * R; pos[i * 3 + 1] = u * R; pos[i * 3 + 2] = r2 * Math.sin(th) * R;
      var b = 0.35 + Math.pow(Math.random(), 2.2) * 0.65;
      var tint = Math.random();
      col[i * 3] = b * (tint > 0.85 ? 1.0 : 0.92);
      col[i * 3 + 1] = b * 0.94;
      col[i * 3 + 2] = b * (tint < 0.3 ? 1.0 : 0.92);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var m = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
    scene.add(new THREE.Points(g, m));
  }

  var sunMesh, sunGlow, sunCorona;
  function buildSun(tex) {
    var R = 10 * Math.sqrt(695700 / AU_KM); // ~0.68
    sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 32),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    scene.add(sunMesh);
    pickables.push(sunMesh);
    sunMesh.userData = { bodyId: "sun" };

    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture("rgba(255,244,214,1)", "rgba(255,170,60,0.55)"),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    sunGlow.scale.set(R * 5.2, R * 5.2, 1);
    scene.add(sunGlow);
    sunCorona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture("rgba(255,220,150,0.5)", "rgba(255,140,40,0.16)"),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8
    }));
    sunCorona.scale.set(R * 13, R * 13, 1);
    scene.add(sunCorona);

    var el = makeLabel("SOL", "sun");
    addLabelObj(el, function () { return sunMesh.position; }, "sun");
  }

  function orbitPathFor(id, t0) {
    var a = P.ELEMENTS[id].a;
    var T = P.TAU * Math.sqrt(a * a * a / P.MU_SUN);
    var pts = [];
    var N = 256;
    for (var i = 0; i < N; i++) {
      pts.push(toV3(P.planetPosition(id, t0 + T * i / N)));
    }
    return pts;
  }

  function makeOrbitLine(pts, opacity, parent) {
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: opacity
    }));
    (parent || scene).add(line);
    orbitLines.push(line);
    return line;
  }

  function buildPlanets(texmap) {
    var t0 = simDays;
    PLANETS.forEach(function (p) {
      var R = planetDisplayR(p);
      var group = new THREE.Group();
      scene.add(group);

      var tiltG = new THREE.Group();
      tiltG.rotation.z = P.DEG * p.tilt;
      group.add(tiltG);

      var mat = new THREE.MeshPhongMaterial({ map: texmap[p.tex], shininess: 10, specular: 0x1a1a1a });
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), mat);
      tiltG.add(mesh);
      pickables.push(mesh);
      mesh.userData = { bodyId: p.id };

      // Earth extras: clouds + night lights
      if (p.id === "earth") {
        var clouds = new THREE.Mesh(
          new THREE.SphereGeometry(R * 1.014, 48, 32),
          new THREE.MeshLambertMaterial({ map: texmap["earth_clouds.jpg"], transparent: true, opacity: 0.55, depthWrite: false })
        );
        tiltG.add(clouds);
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveMap = texmap["earth_night.jpg"];
        mat.emissiveIntensity = 0.55;
        p.clouds = clouds;
      }

      // Saturn ring (radial strip texture -> u = radial fraction)
      if (p.ring) {
        var inner = R * 1.24, outer = R * 2.33;
        var rg = new THREE.RingGeometry(inner, outer, 160, 1);
        var posAttr = rg.attributes.position;
        var uvAttr = rg.attributes.uv;
        for (var vi = 0; vi < posAttr.count; vi++) {
          var vx = posAttr.getX(vi), vy = posAttr.getY(vi);
          var vr = Math.sqrt(vx * vx + vy * vy);
          uvAttr.setXY(vi, (vr - inner) / (outer - inner), 0.5);
        }
        var ringMat = new THREE.MeshLambertMaterial({
          map: texmap[p.ring], side: THREE.DoubleSide, transparent: true, depthWrite: false
        });
        var ring = new THREE.Mesh(rg, ringMat);
        ring.rotation.x = Math.PI / 2;
        tiltG.add(ring);
      }

      // orbit line
      makeOrbitLine(orbitPathFor(p.id, t0), 0.30, null);

      var el = makeLabel(p.name.toUpperCase(), "planet");
      addLabelObj(el, function () { return group.position; }, "planet");

      planetObjs[p.id] = { group: group, mesh: mesh, tiltG: tiltG, data: p, R: R };
    });
  }

  function buildMoons(texmap) {
    var t0 = simDays;
    MOONS.forEach(function (m) {
      var parent = planetObjs[m.parent];
      var R = moonDisplayR(m);
      var tex = m.tex ? texmap[m.tex] : proceduralTexture(m.proc);
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(R, 32, 20),
        new THREE.MeshPhongMaterial({ map: tex, shininess: 6, specular: 0x111111 })
      );
      parent.group.add(mesh);
      pickables.push(mesh);
      mesh.userData = { bodyId: m.id };

      // orbit line (scaled offset sampled over one period)
      var f = moonScaleFactor(m);
      var period = P.MOONS[m.id].periodDays;
      var pts = [];
      var N = 128;
      for (var i = 0; i < N; i++) {
        var off = P.moonOffset(m.id, t0 + period * i / N);
        // offset * f is already in scene units (f derives from display radii)
        pts.push(toV3u(P.scl(off, f)));
      }
      makeOrbitLine(pts, 0.20, parent.group);

      var el = makeLabel(m.name, "moon");
      addLabelObj(el, function () { return mesh.getWorldPosition(new THREE.Vector3()); }, "moon",
        parent, P.ELEMENTS[m.parent].a * AU, bodyFocusDist(m.parent) * 1.35);
      moonObjs[m.id] = { mesh: mesh, data: m, R: R, f: f, el: el };
    });
  }

  // ------------------------------------------------------------
  // Probes (Voyager 1/2) — hi-detail code-built models, real
  // proportions (meters), scaled up for display like other bodies.
  // Built along +Z (dish toward the Sun); origin at bus center.
  // ------------------------------------------------------------
  function buildVoyagerModel() {
    var g = new THREE.Group();
    var mylar = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.38, side: THREE.DoubleSide });
    var dishMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e2, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide });
    var boomMat = new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.6, roughness: 0.45 });
    var rtgMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.5, roughness: 0.6 });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.6, roughness: 0.5 });

    // High-gain antenna: 3.7 m parabolic dish (depth 0.75 m), rim at z=0.9
    var pts = [];
    for (var i = 0; i <= 16; i++) {
      var rr = 1.85 * i / 16;
      pts.push(new THREE.Vector2(rr, 0.75 * (rr / 1.85) * (rr / 1.85)));
    }
    var dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), dishMat);
    dish.rotation.x = Math.PI / 2;   // lathe axis Y -> +Z
    dish.position.z = 0.9;
    g.add(dish);
    // dish back plate
    var back = new THREE.Mesh(new THREE.CircleGeometry(1.85, 40), mylar);
    back.position.z = 0.9;
    g.add(back);
    // feed horn on the boom at the focus (f ~ 1.14 m in front of vertex)
    var feed = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.5, 12), dishMat);
    feed.rotation.x = Math.PI / 2;
    feed.position.z = 2.7;
    g.add(feed);
    // 4 feed struts from rim to feed
    for (var k = 0; k < 4; k++) {
      var ang = k * Math.PI / 2 + Math.PI / 4;
      var rimP = new THREE.Vector3(Math.cos(ang) * 1.7, Math.sin(ang) * 1.7, 1.55);
      var feedP = new THREE.Vector3(0, 0, 2.7);
      var dirV = feedP.clone().sub(rimP);
      var strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, dirV.length(), 6), boomMat);
      strut.position.copy(rimP).add(feedP).multiplyScalar(0.5);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirV.normalize());
      g.add(strut);
    }

    // Main bus: hexagonal prism, 2.6 m across flats, 1.4 m long
    var bus = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.4, 6), mylar);
    bus.rotation.x = Math.PI / 2;
    g.add(bus);
    // instrument block on the sun-facing end
    var inst = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.5), darkMat);
    inst.position.z = 0.95;
    g.add(inst);
    // narrow-angle camera aperture
    var cam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 20), darkMat);
    cam.rotation.x = Math.PI / 2;
    cam.position.set(0.45, 0.45, 1.22);
    g.add(cam);

    // RTG boom (trailing) + 3 SNAP-19 RTGs
    var rtgBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), boomMat);
    rtgBoom.rotation.x = Math.PI / 2;
    rtgBoom.position.z = -0.7 - 1.8;
    g.add(rtgBoom);
    var trun = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.3), darkMat);
    trun.position.z = -4.35;
    g.add(trun);
    for (var r = 0; r < 3; r++) {
      var ra = r * (P.TAU / 3) + Math.PI / 2;
      var rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 14), rtgMat);
      rtg.rotation.x = Math.PI / 2;
      rtg.position.set(Math.cos(ra) * 0.55, Math.sin(ra) * 0.55, -5.0);
      g.add(rtg);
      // RTG exhaust cap (slightly darker tip)
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.2, 14), darkMat);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(Math.cos(ra) * 0.55, Math.sin(ra) * 0.55, -5.9);
      g.add(cap);
    }

    // Magnetometer boom: 12 m, passes through the dish to the sensor
    var magBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 13.2, 8), boomMat);
    magBoom.rotation.x = Math.PI / 2;
    magBoom.position.z = 6.6; // spans z=0 (inside bus) to z=13.2
    g.add(magBoom);
    var magSensor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 14), darkMat);
    magSensor.rotation.x = Math.PI / 2;
    magSensor.position.z = 12.6;
    g.add(magSensor);

    // Plasma-wave antenna boom (~9 m, angled trailing) with end dipole
    var plasma = new THREE.Group();
    var pBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 9.0, 8), boomMat);
    pBoom.rotation.x = Math.PI / 2;
    pBoom.position.z = 4.5;
    plasma.add(pBoom);
    var dipole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8), boomMat);
    dipole.rotation.y = Math.PI / 2;
    dipole.position.z = 9.0;
    plasma.add(dipole);
    plasma.rotation.x = 0.55;      // sweep back ~31 deg
    plasma.rotation.z = 0.4;
    plasma.position.z = -0.5;
    g.add(plasma);

    return g;
  }

  // Hubble: 13.2 m x 4 m optical/servicing module on a truss, two 8.5 m
  // solar-array wings. Built along +Z (aperture toward +Z), origin at bus center.
  function buildHubbleModel() {
    var g = new THREE.Group();
    var white = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.55, roughness: 0.45 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6, roughness: 0.5 });
    var panel = new THREE.MeshStandardMaterial({ color: 0x2456a8, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide });

    // main body cylinder (13.2 m long, 4 m across)
    var body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 13.2, 24), white);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    // aperture door (front, +Z) — slightly larger drum
    var door = new THREE.Mesh(new THREE.CylinderGeometry(2.06, 2.06, 1.6, 24),
      new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 0.5, roughness: 0.5 }));
    door.rotation.x = Math.PI / 2;
    door.position.z = 6.2;
    g.add(door);
    // black primary aperture at the front face
    var aperture = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), dark);
    aperture.position.z = 7.01;
    g.add(aperture);
    // aft service module + thruster nozzles
    var aft = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.0, 1.4, 24), white);
    aft.rotation.x = Math.PI / 2;
    aft.position.z = -7.1;
    g.add(aft);
    for (var n = 0; n < 2; n++) {
      var noz = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 0.7, 10), dark);
      noz.rotation.x = Math.PI / 2;
      noz.position.set(n ? 0.8 : -0.8, 0, -8.0);
      g.add(noz);
    }
    // solar array wings (7.7 m each) deployed ±X
    var wingL = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.12, 1.4), panel);
    wingL.position.set(-2 - 3.85, 0, -0.5);
    g.add(wingL);
    var wingR = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.12, 1.4), panel);
    wingR.position.set(2 + 3.85, 0, -0.5);
    g.add(wingR);
    return g;
  }

  // JWST: 18-hex gold mirror looking anti-sunward (-Z), 5-layer diamond
  // sunshield facing sunward (+Z), bus behind the shield. Origin at shield center.
  function buildJwstModel() {
    var g = new THREE.Group();
    var gold = new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide });
    var shieldMat = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
    var dark = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.5, roughness: 0.6 });

    // sunshield: diamond 21.2 m (long) x 14.2 m (short), 5 stacked layers
    var shape = new THREE.Shape();
    shape.moveTo(10.6, 0); shape.lineTo(0, 7.1); shape.lineTo(-10.6, 0); shape.lineTo(0, -7.1);
    shape.closePath();
    var shieldGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
    for (var ly = 0; ly < 5; ly++) {
      var layer = new THREE.Mesh(shieldGeo, shieldMat);
      layer.position.z = 0.2 + ly * 0.5;
      g.add(layer);
    }

    // primary mirror: 18 gold hexagons (center + 6 + 11), facing -Z
    var hexGeo = new THREE.CylinderGeometry(0.82, 0.82, 0.18, 6);
    hexGeo.rotateX(Math.PI / 2); // hex axis Y -> Z
    function hex(x, y) {
      var m = new THREE.Mesh(hexGeo, gold);
      m.position.set(8 + x, y, -1.5);
      g.add(m);
    }
    hex(0, 0);
    var d1 = Math.sqrt(3) * 0.82;
    for (var a1 = 0; a1 < 6; a1++) {
      var t1 = a1 * Math.PI / 3 + Math.PI / 6;
      hex(d1 * Math.cos(t1), d1 * Math.sin(t1));
    }
    var d2 = 2 * d1;
    for (var a2 = 0; a2 < 12; a2++) {
      if (a2 === 2 || a2 === 6 || a2 === 10) continue; // 18-segment layout
      var t2 = a2 * Math.PI / 6 + Math.PI / 6;
      hex(d2 * Math.cos(t2), d2 * Math.sin(t2));
    }
    // secondary mirror on a 3-boom spider above the primary
    var sec = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), shieldMat);
    sec.rotation.x = Math.PI / 2;
    sec.position.set(8, 0, -3.4);
    g.add(sec);
    for (var b = 0; b < 3; b++) {
      var ba = b * (P.TAU / 3) + Math.PI / 2;
      var boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), dark);
      boom.rotation.x = Math.PI / 2;
      boom.position.set(8 + Math.cos(ba) * 0.55, Math.sin(ba) * 0.55, -2.45);
      g.add(boom);
    }
    // bus at the opposite (anti-mirror) end of the shield
    var bus = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2.4), dark);
    bus.position.set(-8.5, 0, 0.8);
    g.add(bus);
    return g;
  }

  function buildProbes() {
    INTERSTELLAR_PROBES.forEach(function (pr) {
      var group = new THREE.Group();
      var model = buildVoyagerModel();
      var scale = 0.15 / 19.0; // 19 m overall (RTG tip .. mag sensor) -> 0.15 scene units
      model.scale.setScalar(scale);
      group.add(model);
      scene.add(group);

      // invisible picking proxy (the craft is too small to click directly)
      var proxy = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      group.add(proxy);
      pickables.push(proxy);
      proxy.userData = { bodyId: pr.id };

      var el = makeLabel(pr.name.toUpperCase(), "probe");
      addLabelObj(el, function () { return group.position; }, "probe");

      probeObjs[pr.id] = { group: group, proxy: proxy, data: pr, focusDist: 1.35 };
    });

    EARTH_PROBES.forEach(function (pr) {
      var group = new THREE.Group();
      var model = pr.id === "hubble" ? buildHubbleModel() : buildJwstModel();
      var scale = pr.id === "hubble" ? 0.030 / 19.4 : 0.034 / 21.2;
      model.scale.setScalar(scale);
      group.add(model);
      scene.add(group);

      var proxy = new THREE.Mesh(
        new THREE.SphereGeometry(pr.id === "hubble" ? 0.024 : 0.028, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      group.add(proxy);
      pickables.push(proxy);
      proxy.userData = { bodyId: pr.id };

      var el = makeLabel(pr.name.toUpperCase(), "probe");
      addLabelObj(el, function () { return group.position; }, "probe");

      // LEO radius (4.6e-5 AU) sits inside Earth's display sphere, so the
      // displayed Hubble orbit is exaggerated like the moons'. JWST's true
      // L2 distance (0.010 AU) uses the standard 1 AU = 10 scene-units
      // scale (displayScale 10), which lands it at ~1.5x Earth's display
      // radius — just outside the surface, as it really is relative to the
      // sqrt-scaled globe.
      probeObjs[pr.id] = {
        group: group, proxy: proxy, data: pr,
        focusDist: pr.id === "hubble" ? 0.35 : 0.40,
        displayScale: pr.id === "hubble"
          ? 1.35 * planetObjs["earth"].R / (P.EARTH_PROBES.hubble.rKm / AU_KM)
          : 10.0
      };
    });
  }

  // Both belts share a builder: sample static positions from the physics
  // module (heliocentric ecliptic frame: x-y plane, z = height), map them
  // through toV3 into the scene (x-z plane, y up), and rotate each radial
  // sub-band rigidly about the ecliptic normal at its own mid-radius period.
  // NOTE: toV3 is the ONLY valid mapping for points sampled in the physics
  // frame. The old inline mapping (x, z, -y) treated the sampler's axes as
  // a different convention and produced a VERTICAL ring (perpendicular to
  // the ecliptic) that "flipped" as the group spun about scene-y — the
  // belt's sweep traced a sphere.
  function buildBeltBand(sampleFn, band, N, sizeFn, colorFn, beltId) {
    var rockGeo = new THREE.IcosahedronGeometry(1, 0);
    var rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var dummy = new THREE.Object3D();
    var color = new THREE.Color();
    var rMid = (band[0] + band[1]) / 2;
    var T = P.TAU * Math.sqrt(rMid * rMid * rMid / P.MU_SUN);
    var pts = sampleFn(N, Math.random, band[0], band[1]);
    var im = new THREE.InstancedMesh(rockGeo, rockMat, pts.length);
    for (var i = 0; i < pts.length; i++) {
      dummy.position.copy(toV3(pts[i]));
      var s = sizeFn();
      dummy.scale.set(s, s * (0.6 + Math.random() * 0.8), s * (0.6 + Math.random() * 0.8));
      dummy.rotation.set(Math.random() * P.TAU, Math.random() * P.TAU, Math.random() * P.TAU);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, colorFn(color));
    }
    im.instanceMatrix.needsUpdate = true;
    var grp = new THREE.Group();
    grp.add(im);
    grp.userData.T = T;
    grp.userData.belt = beltId;
    scene.add(grp);
    beltGroups.push(grp);
  }

  // Main asteroid belt: one flattened disk, 2.05-3.40 AU, with the
  // Kirkwood-gap depletions (see P.mainBeltProfile). Five overlapping
  // radial sub-bands shear slowly relative to each other (differential
  // rotation at each band's mid-radius period).
  function buildBelt() {
    var bands = [ [2.05, 2.35], [2.25, 2.60], [2.50, 2.85], [2.80, 3.15], [3.10, 3.40] ];
    var sizeFn = function () { return 0.015 + Math.pow(Math.random(), 2.4) * 0.075; };
    var colorFn = function (c) {
      var g = 0.42 + Math.random() * 0.30;
      return c.setRGB(g * 1.02, g * 0.95, g * 0.84);
    };
    bands.forEach(function (band) {
      buildBeltBand(P.mainBeltSample, band, 800, sizeFn, colorFn, "main");
    });
  }

  // Kuiper belt: 30.5-49.5 AU. Icy, sparser, more vertically puffed than
  // the main belt (see P.kuiperBeltProfile). Particles are far larger than
  // main-belt rocks — at 10-15x the distance they need to be a few pixels
  // wide to read in the system view.
  function buildKuiperBelt() {
    var bands = [ [30.5, 43.0], [41.0, 49.5] ];
    var sizeFn = function () { return 0.22 + Math.pow(Math.random(), 2.5) * 0.85; };
    var colorFn = function (c) {
      var g = 0.45 + Math.random() * 0.40;
      return c.setRGB(g * 0.82, g * 0.90, g * 1.12); // icy blue-white
    };
    bands.forEach(function (band) {
      buildBeltBand(P.kuiperBeltSample, band, 1500, sizeFn, colorFn, "kuiper");
    });
  }

  // ------------------------------------------------------------
  // Rocket
  // ------------------------------------------------------------
  var rocketGroup, rocketLabel, rocketPlume;
  // Saturn V: 110.6 m overall. Built along +Z (nose at +Z, origin at the
  // engine end) so lookAt(velocity) orients it. RSCALE = scene units / metre.
  var ROCKET_LEN = 0.075;
  var RSCALE = ROCKET_LEN / 110.6;

  // Canvas texture for cylinder side walls. Canvas top row maps to v=1,
  // which is the cylinder's +Y end (the nose after rotation.x = PI/2).
  function cylTex(w, h, painter) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    painter(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  function buildRocket() {
    rocketGroup = new THREE.Group();

    // ---------- stage textures (procedural NASA-style) ----------
    var s1cTex = cylTex(1024, 1024, function (x, w, h) {
      x.fillStyle = "#eef0f3"; x.fillRect(0, 0, w, h);
      x.strokeStyle = "rgba(50,55,65,0.16)"; x.lineWidth = 1;
      for (var i = 1; i < 16; i++) { x.beginPath(); x.moveTo(i * w / 16, 0); x.lineTo(i * w / 16, h); x.stroke(); }
      x.fillStyle = "rgba(70,75,85,0.55)"; x.fillRect(0, h * 0.03, w, 3); // interstage ring
      x.textAlign = "center";
      x.fillStyle = "#20293a"; x.font = "bold 58px Arial";
      x.fillText("S A T U R N   V", w / 2, h * 0.18);
      x.fillStyle = "#0b3d91"; x.font = "bold 118px Arial";
      x.fillText("NASA", w / 2, h * 0.46);
      var bandTop = h * 0.798, segW = w / 8; // tail banding (bottom 20.2%)
      for (var s = 0; s < 8; s++) {
        x.fillStyle = (s % 2 === 0) ? "#16181d" : "#eef0f3";
        x.fillRect(s * segW, bandTop, segW, h - bandTop);
      }
      x.fillStyle = "#0b3d91"; x.font = "bold 54px Arial";
      x.fillText("USA", segW * 1.5, h * 0.94);
      x.fillStyle = "#b3273a"; x.fillRect(segW * 5.35, h * 0.875, segW * 0.55, h * 0.06); // flag
      x.fillStyle = "#ffffff"; x.fillRect(segW * 5.35, h * 0.905, segW * 0.55, h * 0.025);
    });
    var s2Tex = cylTex(1024, 640, function (x, w, h) {
      x.fillStyle = "#f1f2f4"; x.fillRect(0, 0, w, h);
      x.strokeStyle = "rgba(50,55,65,0.14)"; x.lineWidth = 1;
      for (var i = 1; i < 16; i++) { x.beginPath(); x.moveTo(i * w / 16, 0); x.lineTo(i * w / 16, h); x.stroke(); }
      x.textAlign = "center";
      x.fillStyle = "#0b3d91"; x.font = "bold 96px Arial";
      x.fillText("NASA", w / 2, h * 0.42);
      x.fillStyle = "#5b6470"; x.font = "bold 44px Arial";
      x.fillText("S-II", w / 2, h * 0.64);
    });
    var s4vbTex = cylTex(512, 512, function (x, w, h) {
      x.fillStyle = "#d8dade"; x.fillRect(0, 0, w, h);
      x.textAlign = "center";
      x.fillStyle = "#4a5260"; x.font = "bold 40px Arial";
      x.fillText("S-IVB", w / 2, h * 0.30);
    });
    var adapterTex = cylTex(512, 384, function (x, w, h) {
      x.fillStyle = "#c9cdd3"; x.fillRect(0, 0, w, h);
      x.fillStyle = "rgba(90,95,105,0.5)";
      x.fillRect(0, h * 0.25, w, 2); x.fillRect(0, h * 0.65, w, 2);
    });
    var csmTex = cylTex(256, 256, function (x, w, h) {
      x.fillStyle = "#f3f4f6"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#8d939c"; x.fillRect(0, h * 0.68, w, h * 0.10);
      x.fillStyle = "#14181f";
      x.beginPath(); x.moveTo(w * 0.40, h * 0.10); x.lineTo(w * 0.60, h * 0.10);
      x.lineTo(w * 0.50, h * 0.30); x.closePath(); x.fill();
    });
    var smTex = cylTex(256, 384, function (x, w, h) {
      x.fillStyle = "#eef0f2"; x.fillRect(0, 0, w, h);
      x.textAlign = "center";
      x.fillStyle = "#6a7280"; x.font = "bold 34px Arial";
      x.fillText("APOLLO", w / 2, h * 0.45);
    });

    var mat = function (tex) { return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.2, roughness: 0.62 }); };
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x33363e, metalness: 0.85, roughness: 0.4 });
    var finMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.5, roughness: 0.5 });

    // ---------- stage stack (metres from engine end) ----------
    function stage(rM, lenM, tex, zStartM) {
      var m = new THREE.Mesh(
        new THREE.CylinderGeometry(rM * RSCALE, rM * RSCALE, lenM * RSCALE, 48, 1, true),
        mat(tex)
      );
      m.rotation.x = Math.PI / 2;
      m.position.z = (zStartM + lenM / 2) * RSCALE;
      rocketGroup.add(m);
      return m;
    }
    stage(5.03, 42.0, s1cTex, 0.0);      // S-IC
    stage(5.03, 24.9, s2Tex, 42.0);      // S-II
    stage(2.745, 18.6, s4vbTex, 66.9);   // S-IVB
    stage(1.95, 8.4, adapterTex, 85.5);  // S-IVB/CSM adapter
    stage(1.95, 7.0, smTex, 98.4);       // service module

    // command module (tapering cone toward the nose)
    var lh = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * RSCALE, 1.95 * RSCALE, 4.5 * RSCALE, 32, 1, true), mat(csmTex));
    lh.rotation.x = Math.PI / 2; lh.position.z = (93.9 + 2.25) * RSCALE;
    rocketGroup.add(lh);
    // SPS engine bell (wide end trails)
    var sps = new THREE.Mesh(new THREE.ConeGeometry(0.5 * RSCALE, 2.2 * RSCALE, 20), darkMat);
    sps.rotation.x = Math.PI / 2; sps.position.z = (105.4 + 1.1) * RSCALE;
    rocketGroup.add(sps);
    // launch escape tower
    var let1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * RSCALE, 0.22 * RSCALE, 4.4 * RSCALE, 10), finMat);
    let1.rotation.x = Math.PI / 2; let1.position.z = (106.2 + 2.2) * RSCALE;
    rocketGroup.add(let1);
    var letNose = new THREE.Mesh(new THREE.ConeGeometry(0.3 * RSCALE, 0.8 * RSCALE, 10), darkMat);
    letNose.rotation.x = Math.PI / 2; letNose.position.z = (110.6 - 0.4) * RSCALE;
    rocketGroup.add(letNose);

    // F-1 nozzle cluster (5 bells, wide end trailing)
    var nozGeo = new THREE.ConeGeometry(0.72 * RSCALE, 2.0 * RSCALE, 20);
    [[0, 0], [1.49, 1.49], [-1.49, 1.49], [1.49, -1.49], [-1.49, -1.49]].forEach(function (p) {
      var n = new THREE.Mesh(nozGeo, darkMat);
      n.rotation.x = Math.PI / 2;
      n.position.set(p[0] * RSCALE, p[1] * RSCALE, -1.0 * RSCALE);
      rocketGroup.add(n);
    });
    // engine bay plate closing the open-ended S-IC tail
    var plate = new THREE.Mesh(new THREE.CircleGeometry(5.0 * RSCALE, 32), darkMat);
    plate.rotation.x = Math.PI; plate.position.z = 0.0004;
    rocketGroup.add(plate);

    // tail fins (4, sweeping back and out from the S-IC)
    var finShape = new THREE.Shape();
    finShape.moveTo(0, 5.0 * RSCALE);
    finShape.lineTo(0, 7.1 * RSCALE);
    finShape.lineTo(9.5 * RSCALE, 5.0 * RSCALE);
    finShape.closePath();
    var finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.3 * RSCALE, bevelEnabled: false });
    for (var k = 0; k < 4; k++) {
      var fin = new THREE.Mesh(finGeo, finMat);
      fin.rotation.y = -Math.PI / 2; // shape x (axial) -> +Z
      var holder = new THREE.Group();
      holder.add(fin);
      holder.rotation.z = k * Math.PI / 2;
      rocketGroup.add(holder);
    }

    // exhaust plume (fades shortly after launch; driven in the main loop)
    rocketPlume = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture("rgba(255,196,120,0.95)", "rgba(255,120,40,0.0)", 128),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    rocketPlume.scale.set(ROCKET_LEN * 0.42, ROCKET_LEN * 0.42, 1);
    rocketPlume.position.z = -3.2 * RSCALE;
    rocketGroup.add(rocketPlume);

    // invisible picking proxy (rocket is too thin to click reliably)
    var proxy = new THREE.Mesh(new THREE.SphereGeometry(ROCKET_LEN * 0.4, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.z = ROCKET_LEN * 0.45;
    rocketGroup.add(proxy);

    rocketGroup.visible = false;
    scene.add(rocketGroup);
    pickables.push(rocketGroup);
    rocketGroup.userData = { bodyId: "rocket" };
    rocketLabel = makeLabel("ROCKET", "rocket");
    addLabelObj(rocketLabel, function () { return rocketGroup.position; }, "rocket");
  }

  // ------------------------------------------------------------
  // Mission logic
  // ------------------------------------------------------------
  var missionLine = null, missionMarker = null;

  function rocketStateAt(t) {
    // Returns {pos, vel} in AU / AU-per-day at sim time t.
    if (!mission) return null;
    if (t < mission.tLaunch) {
      return { pos: P.planetPosition("earth", t), vel: P.planetVelocity("earth", t) };
    }
    if (mission.isBallistic) {
      var dt = t - mission.tLaunch;
      return { pos: P.add(mission.r0, P.scl(mission.plan.v0, dt)), vel: mission.plan.v0 };
    }
    var s = P.conicPropagate(mission.orb, t - mission.tLaunch);
    return s;
  }

  function clearMissionGraphics() {
    if (missionLine) { scene.remove(missionLine); missionLine.geometry.dispose(); missionLine.material.dispose(); missionLine = null; }
    if (missionMarker) { scene.remove(missionMarker); missionMarker.material.dispose(); missionMarker = null; }
    if (rocketLabel) rocketLabel.style.display = "none";
  }

  function startMission(destId) {
    var t0 = simDays;
    var r0, v0;
    if (mission && simDays >= mission.tLaunch) {
      // retarget from the rocket's current mid-space state
      var st = rocketStateAt(simDays);
      r0 = st.pos; v0 = st.vel;
    } else {
      r0 = P.planetPosition("earth", t0);
      v0 = P.planetVelocity("earth", t0);
    }
    var plan;
    try {
      plan = P.planTransfer(t0, r0, v0, function (t) { return P.destinationPosition(destId, t); });
    } catch (e) {
      plan = { error: e.message };
    }
    if (plan.error) {
      setFootnote("Transfer solver failed: " + plan.error, true);
      return;
    }

    var isBallistic = plan.p !== undefined;
    var pathPts = [];
    var orb = null;
    if (isBallistic) {
      var nB = 140, ext = 1.18;
      for (var i = 0; i <= nB; i++) {
        var dt = plan.TOF * ext * i / nB;
        pathPts.push(toV3(P.add(r0, P.scl(plan.v0, dt))));
      }
    } else {
      orb = P.conicFromState(r0, plan.v0);
      var tEnd = plan.TOF * 1.2;
      var n = 700;
      for (var j = 0; j <= n; j++) {
        pathPts.push(toV3(P.conicPropagate(orb, tEnd * j / n).pos));
      }
    }

    // approximate path length (for adaptive dash + marker scaling)
    var L = 0;
    for (var k = 1; k < pathPts.length; k++) L += pathPts[k].distanceTo(pathPts[k - 1]);

    clearMissionGraphics();
    var geo = new THREE.BufferGeometry().setFromPoints(pathPts);
    var line = new THREE.Line(geo, new THREE.LineDashedMaterial({
      color: 0x7fd4ff, transparent: true, opacity: 0.9,
      dashSize: Math.max(L / 90, 0.0005), gapSize: Math.max(L / 90, 0.0005)
    }));
    line.computeLineDistances();
    line.visible = document.getElementById("tog-trajectory").checked;
    scene.add(line);
    missionLine = line;

    // destination marker (where the target will be at arrival)
    var targetPos = toV3(P.destinationPosition(destId, plan.tArrival));
    var marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringMarkerTexture(), transparent: true, depthWrite: false
    }));
    marker.position.copy(targetPos);
    var mScale = Math.min(Math.max(L * 0.012, 0.05), 3);
    marker.scale.set(mScale, mScale, 1);
    scene.add(marker);
    missionMarker = marker;

    mission = {
      destId: destId, plan: plan, orb: orb, tLaunch: t0, r0: r0,
      isBallistic: isBallistic,
      destName: DESTINATIONS.filter(function (d) { return d.id === destId; })[0].name
    };
    rocketGroup.visible = true;
    rocketLabel.style.display = "";

    var dv = plan.dV_kms.toFixed(2);
    setFootnote("ΔV " + dv + " km/s" + (plan.dV_over ? " (over " + P.DV_BUDGET_KMS + " km/s budget)" : " (within budget)") +
      " · TOF " + P.fmtDuration(plan.TOF) + " · arrival " + P.fmtDate(plan.tArrival));
    setStats();
  }

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };

  function setFootnote(txt, warn) {
    var el = $("footnote");
    el.textContent = txt;
    el.style.color = warn ? "#ffb347" : "";
  }

  // --- destination picker ---
  var destInput = $("destsearch"), destList = $("destlist");
  (function buildDestList() {
    DESTINATIONS.forEach(function (d) {
      var item = document.createElement("div");
      item.className = "dest-item";
      item.dataset.id = d.id;
      item.innerHTML = '<span class="d-name">' + d.name + '</span><span class="d-tag">' + d.tag + '</span><span class="d-parent">' + d.parent + '</span>';
      item.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        destInput.value = d.name;
        closeDestList();
        startMission(d.id);
      });
      destList.appendChild(item);
    });
  })();
  function closeDestList() { destList.classList.remove("open"); }
  destInput.addEventListener("focus", function () { destList.classList.add("open"); filterDest(""); });
  destInput.addEventListener("input", function () { filterDest(destInput.value); destList.classList.add("open"); });
  destInput.addEventListener("blur", function () { setTimeout(closeDestList, 150); });
  function filterDest(q) {
    q = q.toLowerCase();
    var any = false;
    Array.prototype.forEach.call(destList.children, function (it) {
      var d = DESTINATIONS.filter(function (x) { return x.id === it.dataset.id; })[0];
      var hit = d.name.toLowerCase().indexOf(q) >= 0 || d.parent.toLowerCase().indexOf(q) >= 0;
      it.style.display = hit ? "" : "none";
      if (hit) any = true;
    });
  }

  // --- time warp ---
  var WARP_MIN = Math.log10(0.004), WARP_MAX = Math.log10(3650);
  var slider = $("warpslider");
  function sliderToDps(v) { return Math.pow(10, WARP_MIN + (v / 1000) * (WARP_MAX - WARP_MIN)); }
  function dpsToSlider(dps) { return Math.round((Math.log10(dps) - WARP_MIN) / (WARP_MAX - WARP_MIN) * 1000); }
  slider.addEventListener("input", function () {
    daysPerSec = sliderToDps(+slider.value);
    markPreset(null);
  });
  function markPreset(dpsVal) {
    Array.prototype.forEach.call(document.querySelectorAll("#warppresets button"), function (b) {
      b.classList.toggle("on", Math.abs(parseFloat(b.dataset.dps) - dpsVal) < 1e-9);
    });
  }
  document.querySelectorAll("#warppresets button").forEach(function (b) {
    b.addEventListener("click", function () {
      var dps = parseFloat(b.dataset.dps);
      daysPerSec = dps;
      slider.value = dpsToSlider(dps);
      markPreset(dps);
    });
  });
  function fmtDps(dps) {
    if (dps < 1) return (dps * 24).toFixed(1) + " hr / s";
    if (dps < 60) return (dps < 10 ? dps.toFixed(1) : Math.round(dps)) + " d / s";
    if (dps < 365) return (dps / 30.44).toFixed(1) + " mo / s";
    return (dps / 365.25).toFixed(1) + " yr / s";
  }
  var pauseBtn = $("btn-pause");
  function setPaused(p) {
    paused = p;
    pauseBtn.textContent = paused ? "▶" : "❚❚";
    pauseBtn.classList.toggle("paused", paused);
  }
  pauseBtn.addEventListener("click", function () { setPaused(!paused); });

  // --- view buttons & toggles ---
  var followBtn = $("btn-follow");
  var followDestBtn = $("btn-follow-dest");
  function setFollow(on) {
    followRocket = on;
    if (on) followBody = null;
    followBtn.classList.toggle("active", on);
    if (!on) return;
    // fly in close behind the rocket, slightly askew so it stays in view
    var st = mission ? rocketStateAt(simDays) : null;
    if (st && simDays >= mission.tLaunch) {
      var fwd = toV3u(st.vel);
      if (fwd.lengthSq() < 1e-12) fwd.set(0, 0, 1); else fwd.normalize();
      var up = new THREE.Vector3(0, 1, 0);
      var side = new THREE.Vector3().crossVectors(fwd, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0); else side.normalize();
      var off = fwd.clone().multiplyScalar(-ROCKET_LEN * 5.5)
        .add(up.clone().multiplyScalar(ROCKET_LEN * 2.3))
        .add(side.multiplyScalar(ROCKET_LEN * 1.6));
      flyTo(function () { return rocketGroup.position; }, null, 1.1, off);
    } else if (mission) {
      // pre-launch: frame the launch site
      var eoff = new THREE.Vector3(0.35, 0.28, 0.55);
      flyTo(function () { return planetObjs["earth"].group.position; }, null, 1.1, eoff);
    }
  }
  followDestBtn.addEventListener("click", function () {
    if (!mission) { setFootnote("Select a destination first.", true); return; }
    if (followBody === mission.destId) {
      // toggle off: release the camera lock, stay where the user is
      followBody = null;
      return;
    }
    focusBody(mission.destId);
  });
  followBtn.addEventListener("click", function () { setFollow(!followRocket); });
  $("btn-reset").addEventListener("click", resetView);
  function resetView() {
    setFollow(false);
    followBody = null;
    // system view: frames the full 30 AU span (Neptune's orbit)
    flyTo(function () { return new THREE.Vector3(0, 0, 0); }, new THREE.Vector3(0, 520, 240), 1.0);
  }
  $("tog-trajectory").addEventListener("change", function (e) {
    if (missionLine) missionLine.visible = e.target.checked;
  });
  $("tog-orbits").addEventListener("change", function (e) {
    orbitLines.forEach(function (l) { l.visible = e.target.checked; });
  });
  $("tog-labels").addEventListener("change", function (e) {
    labelLayer.style.display = e.target.checked ? "" : "none";
  });
  $("tog-belt").addEventListener("change", function (e) {
    beltGroups.forEach(function (g) { g.visible = e.target.checked; });
  });

  // --- keyboard ---
  window.addEventListener("keydown", function (ev) {
    if (ev.target === destInput) return;
    if (ev.code === "Space") { ev.preventDefault(); setPaused(!paused); }
    else if (ev.key === "f" || ev.key === "F") setFollow(!followRocket);
    else if (ev.key === "t" || ev.key === "T") {
      var t = $("tog-trajectory"); t.checked = !t.checked;
      t.dispatchEvent(new Event("change"));
    }
    else if (ev.key === "r" || ev.key === "R") resetView();
  });

  // --- zoom slider (logarithmic: close-up .. 400 AU) ---
  var ZOOM_MIN = 0.04, ZOOM_MAX = 4000; // scene units (1 AU = 10)
  var zoomSlider = $("zoomslider");
  var zoomRead = $("zoomread");
  var zoomDragging = false;
  function sliderToDist(v) { return ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, v / 1000); }
  function distToSlider(d) {
    var v = 1000 * Math.log(Math.max(d, ZOOM_MIN) / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
    return Math.max(0, Math.min(1000, v));
  }
  zoomSlider.addEventListener("input", function () {
    var d = sliderToDist(parseFloat(this.value));
    var off = camera.position.clone().sub(controls.target);
    if (off.lengthSq() < 1e-12) off.set(0, 0.4, 1);
    camera.position.copy(controls.target).add(off.setLength(d));
  });
  zoomSlider.addEventListener("pointerdown", function () { zoomDragging = true; });
  window.addEventListener("pointerup", function () { zoomDragging = false; });

  // --- fly-to animation ---
  function flyTo(targetFn, endCamPos, dur, endRelOffset) {
    flyAnim = {
      t0: performance.now(), dur: dur * 1000,
      fromTarget: controls.target.clone(),
      fromCam: camera.position.clone(),
      targetFn: targetFn, endCamPos: endCamPos,
      endRelOffset: endRelOffset || null
    };
  }
  function flyEndPos() {
    return flyAnim.endRelOffset
      ? flyAnim.targetFn().clone().add(flyAnim.endRelOffset)
      : flyAnim.endCamPos;
  }
  function updateFlyAnim() {
    if (!flyAnim) return;
    var t = (performance.now() - flyAnim.t0) / flyAnim.dur;
    if (t >= 1) {
      var tp = flyAnim.targetFn();
      controls.target.copy(tp);
      camera.position.copy(flyEndPos());
      flyAnim = null;
      return;
    }
    var s = t * t * (3 - 2 * t); // smoothstep
    var tp = flyAnim.targetFn();
    controls.target.copy(flyAnim.fromTarget.clone().lerp(tp, s));
    // end camera position should be relative to the (moving) target:
    camera.position.copy(flyAnim.fromCam.clone().lerp(flyEndPos(), s));
  }

  function focusBody(bodyId) {
    setFollow(false);
    followBody = bodyId;
    var isProbe = !!probeObjs[bodyId];
    var obj = bodyId === "sun" ? sunMesh : (planetObjs[bodyId] && planetObjs[bodyId].mesh)
             || (moonObjs[bodyId] && moonObjs[bodyId].mesh)
             || (isProbe && probeObjs[bodyId].proxy);
    if (!obj) return;
    var isPlanet = !!planetObjs[bodyId];
    var outer = isPlanet ? outerMoonOrbitR(bodyId) : 0;
    var R = bodyId === "sun" ? sunMesh.geometry.parameters.radius
          : isProbe ? probeObjs[bodyId].proxy.geometry.parameters.radius
          : (planetObjs[bodyId] ? planetObjs[bodyId].R : moonObjs[bodyId].R);
    var dist = isPlanet ? bodyFocusDist(bodyId)
             : isProbe ? probeObjs[bodyId].focusDist
             : Math.max(R * 4.2, 0.30);
    // camera offset direction: from target toward current camera, biased toward the
    // sun so the lit hemisphere faces us instead of the night side
    var tp = obj.getWorldPosition(new THREE.Vector3());
    var dir = camera.position.clone().sub(tp);
    if (dir.lengthSq() < 1e-9) dir.set(0, 0.4, 1);
    dir.normalize();
    var sunDir = tp.clone().negate().normalize(); // sun sits at the origin
    dir.add(sunDir.multiplyScalar(0.75)).normalize();
    if (outer > 0) {
      // keep the view near the moon orbital plane so all moons stay in frame
      var horiz = Math.sqrt(Math.max(0, 1 - dir.y * dir.y));
      dir.y = Math.max(-0.12 * horiz, Math.min(0.12 * horiz, dir.y));
      dir.normalize();
    } else {
      dir.y += 0.25; dir.normalize();
    }
    var endRel = dir.multiplyScalar(dist);
    var targetFn = function () { return obj.getWorldPosition(new THREE.Vector3()); };
    flyAnim = {
      t0: performance.now(), dur: 0.9,
      fromTarget: controls.target.clone(), fromCam: camera.position.clone(),
      targetFn: targetFn, endCamPos: tp.clone().add(endRel.clone()), endRelOffset: endRel
    };
  }

  // --- picking (hover + click) ---
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();
  var tooltip = $("tooltip");
  var downPos = null;

  function pickAt(clientX, clientY) {
    var rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pickables, true);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o && !o.userData.bodyId) o = o.parent;
      if (o) return o.userData.bodyId;
    }
    return null;
  }

  function bodyInfo(bodyId) {
    if (bodyId === "sun") return { name: "Sun", r: 0, v: 0, isSun: true };
    var po = planetObjs[bodyId];
    if (po) {
      var pos = P.planetPosition(bodyId, simDays), vel = P.planetVelocity(bodyId, simDays);
      return { name: po.data.name, r: P.len(pos), vkms: P.len(vel) * KMS };
    }
    var mo = moonObjs[bodyId];
    if (mo) {
      var p2 = P.moonHeliocentricPosition(bodyId, simDays), v2 = P.moonHeliocentricVelocity(bodyId, simDays);
      return { name: mo.data.name, r: P.len(p2), vkms: P.len(v2) * KMS };
    }
    var pr = probeObjs[bodyId];
    if (pr) {
      var p3 = P.probePosition(bodyId, simDays), v3 = P.probeVelocity(bodyId, simDays);
      return { name: pr.data.name, r: P.len(p3), vkms: P.len(v3) * KMS };
    }
    if (bodyId === "rocket" && mission) {
      var st = rocketStateAt(simDays);
      return { name: "Rocket", r: P.len(st.pos), vkms: P.len(st.vel) * KMS };
    }
    return null;
  }

  renderer.domElement.addEventListener("pointermove", function (ev) {
    var id = pickAt(ev.clientX, ev.clientY);
    if (!id) { tooltip.style.display = "none"; renderer.domElement.style.cursor = ""; return; }
    var info = bodyInfo(id);
    if (!info) return;
    renderer.domElement.style.cursor = "pointer";
    var rect = viewport.getBoundingClientRect();
    tooltip.style.display = "block";
    tooltip.style.left = (ev.clientX - rect.left + 14) + "px";
    tooltip.style.top = (ev.clientY - rect.top + 10) + "px";
    tooltip.innerHTML = '<div class="tt-name">' + info.name.toUpperCase() + '</div>' +
      (info.isSun ? '<div class="tt-row">G2V main-sequence star</div>'
        : '<div class="tt-row">heliocentric <b>' + P.fmtDistance(info.r) + '</b></div>' +
          '<div class="tt-row">velocity <b>' + info.vkms.toFixed(2) + ' km/s</b></div>');
  });
  renderer.domElement.addEventListener("pointerleave", function () { tooltip.style.display = "none"; });
  renderer.domElement.addEventListener("pointerdown", function (ev) { downPos = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener("pointerup", function (ev) {
    if (!downPos) return;
    var dx = ev.clientX - downPos[0], dy = ev.clientY - downPos[1];
    downPos = null;
    if (dx * dx + dy * dy > 25) return; // was a drag
    var id = pickAt(ev.clientX, ev.clientY);
    if (id && id !== "rocket") focusBody(id);
    else if (id === "rocket") setFollow(true);
  });
  window.addEventListener("pointerup", function () { downPos = null; });

  // --- stats ---
  var statTimer = 0;
  function setStats() {
    var dest = mission ? mission.destName : "—";
    $("st-dest").textContent = dest;
    followDestBtn.classList.toggle("active",
      !!(mission && !followRocket && followBody === mission.destId));
    if (!mission) {
      $("st-status").textContent = "STANDBY"; $("st-status").className = "stat-v";
      ["st-vel", "st-ttt", "st-range", "st-tof", "st-arrival", "st-dv", "st-orbit"].forEach(function (id) { $(id).textContent = "—"; $(id).className = "stat-v"; });
      $("livedot").classList.remove("live");
      return;
    }
    $("livedot").classList.add("live");
    var t = simDays, plan = mission.plan;
    var st = rocketStateAt(t);
    var destPos = P.destinationPosition(mission.destId, t);
    var range = P.len(P.sub(st.pos, destPos));
    var ttt = plan.tArrival - t;

    var status, cls;
    if (t < plan.tArrival) { status = "EN ROUTE"; cls = "stat-v accent"; }
    else { status = "COASTING (PAST TARGET)"; cls = "stat-v ok"; }
    $("st-status").textContent = status; $("st-status").className = cls;
    $("st-vel").textContent = (P.len(st.vel) * KMS).toFixed(2) + " km/s"; $("st-vel").className = "stat-v";
    $("st-ttt").textContent = ttt > 0 ? P.fmtDuration(ttt) : "— (passed)"; $("st-ttt").className = ttt > 0 ? "stat-v" : "stat-v warn";
    $("st-range").textContent = P.fmtDistance(range); $("st-range").className = "stat-v";
    $("st-tof").textContent = P.fmtDuration(plan.TOF); $("st-tof").className = "stat-v";
    $("st-arrival").textContent = P.fmtDate(plan.tArrival); $("st-arrival").className = "stat-v";
    var dvOver = plan.dV_over;
    $("st-dv").textContent = plan.dV_kms.toFixed(2) + " km/s" + (dvOver ? " ⚠" : ""); $("st-dv").className = dvOver ? "stat-v warn" : "stat-v";
    if (mission.isBallistic) { $("st-orbit").textContent = "BALLISTIC (LUNAR)"; }
    else if (plan.e > 1) { $("st-orbit").textContent = "HYPERBOLIC  e=" + plan.e.toFixed(3); }
    else { $("st-orbit").textContent = "ELLIPSE  e=" + plan.e.toFixed(3); }
    $("st-orbit").className = "stat-v";
  }

  // --- labels ---
  var _lv = new THREE.Vector3();
  var _origin = new THREE.Vector3(0, 0, 0);
  function updateLabels() {
    if (labelLayer.style.display === "none") return;
    var w = viewport.clientWidth, h = viewport.clientHeight;
    for (var i = 0; i < labelObjs.length; i++) {
      var lo = labelObjs[i];
      _lv.copy(lo.getPos()).project(camera);
      var vis = _lv.z < 1 && _lv.x > -1.05 && _lv.x < 1.05 && _lv.y > -1.05 && _lv.y < 1.05;
      if (lo.kind === "moon" && lo.parentRef) {
        // only show moon labels when zoomed into that planet's system
        // (threshold just beyond the parent's focus distance)
        var d = camera.position.distanceTo(lo.parentRef.group.position);
        if (d > (lo.thresh || 0.4)) vis = false;
      }
      if (lo.kind === "rocket" && !rocketGroup.visible) vis = false;
      if (vis) {
        lo.el.style.display = "";
        lo.el.style.left = ((_lv.x * 0.5 + 0.5) * w) + "px";
        lo.el.style.top = ((-_lv.y * 0.5 + 0.5) * h) + "px";
      } else {
        lo.el.style.display = "none";
      }
    }
  }

  // ------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------
  var lastT = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (!paused) simDays += dt * daysPerSec;

    // planets
    PLANETS.forEach(function (p) {
      var o = planetObjs[p.id];
      o.group.position.copy(toV3(P.planetPosition(p.id, simDays)));
      o.mesh.rotation.y = P.TAU * simDays / p.day;
      if (p.clouds) p.clouds.rotation.y = P.TAU * simDays / (p.day * 0.82);
    });
    // moons
    MOONS.forEach(function (m) {
      var o = moonObjs[m.id];
      var off = P.scl(P.moonOffset(m.id, simDays), o.f);
      // offset * f is already in scene units (f derives from display radii)
      o.mesh.position.copy(toV3u(off));
      o.mesh.rotation.y = P.TAU * simDays / m.day;
    });
    // interstellar probes (linear motion; dish stays sun-facing)
    INTERSTELLAR_PROBES.forEach(function (pr) {
      var o = probeObjs[pr.id];
      o.group.position.copy(toV3(P.probePosition(pr.id, simDays)));
      o.group.lookAt(_origin);
    });
    // earth probes: Hubble (LEO) + JWST (L2 halo), offset from Earth's
    // live position; Hubble's orbit is display-exaggerated (see buildProbes)
    var earthGrp = planetObjs["earth"].group.position;
    EARTH_PROBES.forEach(function (pr) {
      var o = probeObjs[pr.id];
      var off = P.earthProbeOffset(pr.id, simDays);
      o.group.position.set(
        earthGrp.x + off.x * o.displayScale,
        earthGrp.y + off.z * o.displayScale,
        earthGrp.z - off.y * o.displayScale
      );
      if (pr.id === "jwst") o.group.lookAt(earthGrp); // sunshield (+Z) sunward
      else o.group.rotation.y = P.TAU * simDays / 25;  // slow attitude spin
    });
    // belt (main + Kuiper)
    beltGroups.forEach(function (g) { g.rotation.y = P.TAU * simDays / g.userData.T; });
    // sun spin (slow, 25.4 d)
    sunMesh.rotation.y = P.TAU * simDays / 25.38;

    // rocket
    if (mission) {
      var st = rocketStateAt(simDays);
      if (st) {
        var wp = toV3(st.pos);
        if (simDays >= mission.tLaunch) {
          var ahead = toV3(P.add(st.pos, P.scl(st.vel, 0.02)));
          rocketGroup.position.copy(wp);
          rocketGroup.lookAt(ahead);
          rocketGroup.visible = true;
          // exhaust fades out ~1.5 days after launch
          if (rocketPlume) {
            rocketPlume.material.opacity =
              Math.max(0, Math.min(1, 1.05 - (simDays - mission.tLaunch) / 1.5));
          }
        } else {
          rocketGroup.visible = false;
        }
      }
    }

    // camera: fly animation, then follow modes
    updateFlyAnim();
    if (followBody && !flyAnim) {
      var bo = planetObjs[followBody] ? planetObjs[followBody].group.position
             : moonObjs[followBody] ? moonObjs[followBody].mesh.getWorldPosition(new THREE.Vector3())
             : probeObjs[followBody] ? probeObjs[followBody].group.position
             : (followBody === "sun" ? sunMesh.position : null);
      if (bo) {
        var delta = bo.clone().sub(controls.target);
        camera.position.add(delta);
        controls.target.copy(bo);
      }
    }
    if (followRocket && mission && rocketGroup.visible && !flyAnim) {
      var deltaR = rocketGroup.position.clone().sub(controls.target);
      camera.position.add(deltaR);
      controls.target.copy(rocketGroup.position);
    }
    controls.update();

    // zoom slider: mirror the live camera→target distance (skip the write
    // while the user is dragging the slider itself)
    var camDist = camera.position.distanceTo(controls.target);
    if (!zoomDragging) zoomSlider.value = distToSlider(camDist);
    var camAU = camDist * 0.1;
    zoomRead.textContent = camAU >= 100 ? camAU.toFixed(0) + " AU"
                       : camAU >= 1 ? camAU.toFixed(1) + " AU"
                       : camAU.toFixed(3) + " AU";

    // stats @ ~5 Hz
    statTimer += dt;
    if (statTimer > 0.2) { statTimer = 0; setStats(); }
    // clock
    $("simdate").textContent = P.fmtDate(simDays);
    $("timescale").textContent = (paused ? "PAUSED   " : "") + fmtDps(daysPerSec);

    updateLabels();
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", function () {
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  });

  // ------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------
  var TEX = "textures/";
  var TEX_FILES = [
    "sun.jpg", "mercury.jpg", "venus.jpg", "earth.jpg", "earth_clouds.jpg",
    "earth_night.jpg", "mars.jpg", "jupiter.jpg", "saturn.jpg", "saturn_ring.png",
    "uranus.jpg", "neptune.jpg", "moon.jpg", "pluto.jpg", "stars_milky_way.jpg"
  ];
  var texmap = {};
  // Textures are embedded as base64 data-URIs (js/textures_data.js): Chrome
  // taints images loaded from a file:// page origin and WebGL refuses to
  // upload them, but data: URLs are same-origin and upload cleanly. If an
  // embedded URI is ever missing (stale textures_data.js), fall back to the
  // file on disk.
  var EMBEDDED = window.SIM_TEXTURES || {};
  var srcFile = {};
  TEX_FILES.forEach(function (f) { srcFile[EMBEDDED[f] || (TEX + f)] = f; });
  var loadStatus = $("loadstatus"), loadFill = $("loadfill");
  var manager = new THREE.LoadingManager();
  manager.onProgress = function (url, loaded, total) {
    loadFill.style.width = (loaded / total * 100).toFixed(0) + "%";
    loadStatus.textContent = "LOADING " + (srcFile[url] || "TEXTURE").toUpperCase() + "  (" + loaded + "/" + total + ")";
  };
  var loader = new THREE.TextureLoader(manager);
  // Normal path: EMBEDDED data-URIs (same-origin, upload cleanly from any
  // page origin, including file://). The disk-file fallback below exists for
  // a stale textures_data.js; note a file:// image is "tainted" and WebGL
  // refuses to upload it (SecurityError from texImage2D, on every frame
  // three retries), so each image is probed with a 1x1 upload as soon as it
  // loads and swapped for a 1x1 base-color canvas if the probe is blocked —
  // keeping the scene coherent instead of erroring.
  loader.setCrossOrigin(null);

  var TEX_FALLBACK_COLOR = {
    "sun.jpg": "#ffcf7a", "mercury.jpg": "#9a938a", "venus.jpg": "#e8cfa0",
    "earth.jpg": "#2f66b0", "earth_clouds.jpg": "#c8d8e8", "earth_night.jpg": "#000000",
    "mars.jpg": "#c2622f", "jupiter.jpg": "#d6b189", "saturn.jpg": "#e2d2a6",
    "saturn_ring.png": "#b7a687", "uranus.jpg": "#9cd2d6", "neptune.jpg": "#4066cf",
    "moon.jpg": "#9c9c94", "pluto.jpg": "#b3a189", "stars_milky_way.jpg": "#05070d"
  };
  function fallbackCanvas(f) {
    var c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    var ctx = c.getContext("2d");
    ctx.fillStyle = TEX_FALLBACK_COLOR[f] || "#888888";
    ctx.fillRect(0, 0, 1, 1);
    return c;
  }
  var probeTex = null;
  // Can this image be uploaded to the WebGL context? If it is tainted,
  // drawing it onto a canvas taints the canvas, and the GL upload of that
  // canvas throws SecurityError — the same throw three.js would hit.
  // A fresh 1x1 canvas per image, because canvas taint is sticky. (The
  // 6-argument texImage2D is the form three.js itself uses for uploads.)
  function probeImage(img) {
    try {
      var c = document.createElement("canvas");
      c.width = 1; c.height = 1;
      c.getContext("2d").drawImage(img, 0, 0, 1, 1);
      var gl = renderer.getContext();
      if (!probeTex) probeTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, probeTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      return true;
    } catch (e) {
      // diagnostic for the headless harness / troubleshooting
      window.__TEX_PROBE_ERRS__ = window.__TEX_PROBE_ERRS__ || [];
      window.__TEX_PROBE_ERRS__.push((e && e.name) + " " + (e && e.message) +
        " | img=" + Object.prototype.toString.call(img) +
        " w=" + (img && img.width) + " h=" + (img && img.height));
      return false;
    }
  }
  // GPUs with a 4096 texture limit cannot upload 8k images; downscale
  // oversized textures in place before the first render.
  function downscaleOversized() {
    var maxT = renderer.capabilities.maxTextureSize;
    Object.keys(texmap).forEach(function (f) {
      var t = texmap[f];
      var img = t.image;
      if (!img || (img.width <= maxT && img.height <= maxT)) return;
      var s = Math.min(maxT / img.width, maxT / img.height);
      var c = document.createElement("canvas");
      c.width = Math.max(2, Math.round(img.width * s));
      c.height = Math.max(2, Math.round(img.height * s));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      t.image = c;
      t.needsUpdate = true;
    });
  }
  function showTextureBanner() {
    if (document.getElementById("texbanner")) return;
    var b = document.createElement("div");
    b.id = "texbanner";
    b.innerHTML = "⚠ TEXTURES NOT FULLY LOADED — REGENERATE EMBEDDED SET: <b>node tools/embed_textures.js</b>" +
      ' <span id="texbanner-x" title="dismiss">✕</span>';
    document.getElementById("viewport").appendChild(b);
    b.querySelector("#texbanner-x").addEventListener("click", function () { b.remove(); });
  }
  manager.onLoad = function () {
    downscaleOversized();
    var failed = Object.keys(texState).filter(function (f) { return texState[f] === "error"; });
    var fallbacks = Object.keys(texState).filter(function (f) { return texState[f] === "fallback"; });
    if (failed.length) {
      loadStatus.textContent = "⚠ " + failed.length + " TEXTURE(S) FAILED — " + failed.join(", ").toUpperCase();
      loadStatus.classList.add("warn");
    } else if (fallbacks.length) {
      loadStatus.textContent = "FALLBACK MODE — TEXTURES BLOCKED BY BROWSER · RUN: node tools/embed_textures.js";
      loadStatus.classList.add("warn");
    } else {
      loadStatus.textContent = "SYSTEMS NOMINAL — GOOD LUCK, PILOT";
    }
    window.__TEX_STATUS__ = Object.assign({}, texState);
    if (failed.length || fallbacks.length) showTextureBanner();
    loadFill.style.width = "100%";
    setTimeout(function () { document.getElementById("loading").classList.add("done"); }, 350);
  };
  manager.onError = function (url) {
    var f = url.split("/").pop();
    if (texState[f] !== undefined) texState[f] = "error";
    loadStatus.textContent = "WARNING: FAILED TO LOAD " + f.toUpperCase();
  };
  var texState = {};
  TEX_FILES.forEach(function (f) {
    texState[f] = "loading";
    var t = loader.load(EMBEDDED[f] || (TEX + f),
      function () {
        // Probe before three.js's first real upload: a tainted image would
        // make every render throw. Swap in a flat base color instead.
        if (probeImage(t.image)) {
          texState[f] = "ok";
        } else {
          t.image = fallbackCanvas(f);
          t.needsUpdate = true;
          texState[f] = "fallback";
        }
        // Free the base64 string now that the bitmap is in hand (~15 MB each).
        if (EMBEDDED[f]) { delete srcFile[EMBEDDED[f]]; EMBEDDED[f] = null; }
      },
      undefined,
      function () { texState[f] = "error"; });
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texmap[f] = t;
  });

  buildSkybox(texmap["stars_milky_way.jpg"]);
  buildSun(texmap["sun.jpg"]);
  buildPlanets(texmap);
  buildMoons(texmap);
  buildBelt();
  buildKuiperBelt();
  buildProbes();
  buildRocket();

  // initial clock
  $("simdate").textContent = P.fmtDate(simDays);
  $("timescale").textContent = fmtDps(daysPerSec);
  slider.value = dpsToSlider(daysPerSec);
  markPreset(1);

  frame();

  // Debug / console handle (also used by the headless test harness).
  window.__SPACESIM__ = {
    get simDays() { return simDays; },
    get mission() { return mission; },
    get daysPerSec() { return daysPerSec; },
    seek: function (t) { simDays = t; },
    setWarp: function (dps) { daysPerSec = dps; },
    startMission: startMission,
    focus: focusBody,
    resetView: resetView,
    followRocket: function (on) { setFollow(on); },
    // screen position of the moon at an arbitrary sim time (for test planning)
    moonScreenAt: function (t) {
      var mo = moonObjs["moon"];
      var off = P.scl(P.moonOffset("moon", t), mo.f); // displayed offset, scene units
      var e = planetObjs["earth"].group.position;
      var v = new THREE.Vector3(e.x + off.x, e.y + off.z, e.z - off.y).project(camera);
      return { x: (v.x * 0.5 + 0.5) * viewport.clientWidth, y: (-v.y * 0.5 + 0.5) * viewport.clientHeight, z: v.z };
    },
    camInfo: function () {
      var e = planetObjs["earth"];
      return {
        cam: camera.position.toArray(),
        target: controls.target.toArray(),
        earth: e ? e.group.position.toArray() : null,
        earthDist: e ? camera.position.distanceTo(e.group.position) : null,
        follow: followBody,
        followRocket: followRocket,
        fly: !!flyAnim,
        dpr: renderer.getPixelRatio()
      };
    },
    // max |ecliptic height| (AU) across belt instances, for the headless
    // harness. A flat belt keeps this small (main < 0.6, Kuiper < 17); the
    // axis-mapping regression made the main belt a vertical ring (~3.4 AU).
    beltYMax: function (which) {
      var v = new THREE.Vector3(), m = new THREE.Matrix4(), max = 0;
      beltGroups.forEach(function (g) {
        if (which && g.userData.belt !== which) return;
        g.updateMatrixWorld();
        var im = g.children[0];
        for (var i = 0; i < im.count; i++) {
          im.getMatrixAt(i, m);
          v.set(m.elements[12], m.elements[13], m.elements[14]).applyMatrix4(g.matrixWorld);
          var a = Math.abs(v.y);
          if (a > max) max = a;
        }
      });
      return max / AU;
    },
    // per-file texture load status (for the headless harness)
    texStatus: function () {
      var ok = 0, fallback = [], failed = [], loading = 0;
      Object.keys(texState).forEach(function (f) {
        if (texState[f] === "ok") ok++;
        else if (texState[f] === "fallback") fallback.push(f);
        else if (texState[f] === "error") failed.push(f);
        else loading++;
      });
      return { total: TEX_FILES.length, ok: ok, fallback: fallback, loading: loading, failed: failed };
    },
    // debug introspection for the trajectory line
    lineInfo: function () {
      if (!missionLine) return null;
      var g = missionLine.geometry;
      var pd = g.attributes.position, ld = g.attributes.lineDistance;
      var mid = new THREE.Vector3().fromBufferAttribute(pd, pd.count >> 1).project(camera);
      var first = new THREE.Vector3().fromBufferAttribute(pd, 0).project(camera);
      return {
        visible: missionLine.visible,
        dash: missionLine.material.dashSize,
        gap: missionLine.material.gapSize,
        opacity: missionLine.material.opacity,
        points: pd.count,
        distFirst: ld ? ld.array[0] : -1,
        distLast: ld ? ld.array[ld.array.length - 1] : -1,
        midScreen: { x: (mid.x * 0.5 + 0.5) * viewport.clientWidth, y: (-mid.y * 0.5 + 0.5) * viewport.clientHeight, z: mid.z },
        firstScreen: { x: (first.x * 0.5 + 0.5) * viewport.clientWidth, y: (-first.y * 0.5 + 0.5) * viewport.clientHeight, z: first.z }
      };
    },
    rawPixels: function (x, y, w, h) {
      var gl = renderer.domElement;
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var ctx = c.getContext("2d");
      ctx.drawImage(gl, x, y, w, h, 0, 0, w, h);
      return Array.from(ctx.getImageData(0, 0, w, h).data);
    },
    // count cyan-ish pixels within a few px of the projected trajectory path
    linePixelScore: function () {
      if (!missionLine) return null;
      var pd = missionLine.geometry.attributes.position;
      var v = new THREE.Vector3();
      var pts = [];
      for (var i = 0; i < pd.count; i += 4) {
        v.fromBufferAttribute(pd, i).project(camera);
        if (v.z > 1 || v.z < -1) continue;
        pts.push([(v.x * 0.5 + 0.5) * viewport.clientWidth, (-v.y * 0.5 + 0.5) * viewport.clientHeight]);
      }
      var gl = renderer.domElement;
      var W = gl.width, H = gl.height;
      var c = document.createElement("canvas"); c.width = W; c.height = H;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(gl, 0, 0);
      var img = ctx.getImageData(0, 0, W, H).data;
      var sx = W / viewport.clientWidth, sy = H / viewport.clientHeight;
      var n = 0, maxB = 0;
      for (var p = 0; p < pts.length; p++) {
        var x = Math.round(pts[p][0] * sx), y = Math.round(pts[p][1] * sy);
        for (var dx = -2; dx <= 2; dx++) {
          for (var dy = -2; dy <= 2; dy++) {
            var xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            var i4 = (yy * W + xx) * 4;
            var r = img[i4], g = img[i4 + 1], b = img[i4 + 2];
            if (b > 45 && (b - r) > 20 && (b - g) > -10) { n++; if (b > maxB) maxB = b; }
          }
        }
      }
      return { matched: n, maxB: maxB, pathPts: pts.length };
    }
  };
})();
