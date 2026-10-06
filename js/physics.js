/* Deterministic game physics. SI units for stones; canvas units for discs and Bob. */
(function (global) {
  "use strict";
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const STONES = [
    ["SKIFER", 30, 4, .96, .94], ["FLAD FLINT", 26, 5, .91, .92],
    ["SØSTEN", 34, 6, .88, .86], ["BASALT", 25, 8, .83, .90],
    ["SANDSTEN", 32, 7, .84, .79], ["LILLE SKIVE", 22, 4, .95, .85],
    ["OVAL FLINT", 29, 5, .87, .70], ["STOR SKIVE", 36, 5, .92, .90],
    ["KVARTS", 24, 12, .59, .75], ["RUNDET", 28, 14, .42, .66],
    ["TYND SKIFER", 27, 3, .98, .68], ["GRANIT", 31, 10, .71, .88],
    ["STRANDSTEN", 25, 7, .80, .77], ["RU SKIVE", 33, 6, .77, .64],
    ["TUNG FLINT", 30, 11, .76, .94],
  ].map(([name, radiusMM, thicknessMM, flatness, stability], id) => {
    const radius = radiusMM / 1000, thickness = thicknessMM / 1000;
    const mass = Math.PI * radius * radius * thickness * 2600;
    return { id, name, radius, thickness, mass, flatness, stability };
  });

  // Reduced disk/water model based on Bocquet (AJP 2003) and Nagahiro &
  // Hayakawa (PRL 2005, arxiv.org/abs/physics/0411125). Pressure is proportional
  // to the squared velocity normal to the disk, acting on its immersed circular
  // segment. Water impulse, drag, angular momentum and gravity determine every
  // bounce. Coefficients for roughness/spin loss are game approximations, not CFD.
  function skipStone(stone, angleDegrees, power) {
    const tilt = clamp(angleDegrees, 5, 40) * Math.PI / 180;
    const speed = (3 + 20 * clamp(power, 0, 1)) / Math.sqrt(stone.mass / .06);
    let x = 0, z = .12, vx = speed * Math.cos(.12), vz = -speed * Math.sin(.12);
    let spin = (35 + power * 55) * 2 * Math.PI * stone.stability;
    const inertia = .5 * stone.mass * stone.radius * stone.radius;
    let wet = false, wetTime = 0, hops = 0, lastExit = -1, wobble = 0;
    const path = [{ t: 0, x, z, hops }], splashes = [];
    const dt = 1 / 1200;
    let t = 0;
    for (let step = 1; step <= 24000; step++) {
      t = step * dt;
      let ax = -.012 * vx * Math.abs(vx), az = -9.81;
      if (z <= 0) {
        wet = true; wetTime += dt;
        const alpha = clamp(tilt + wobble, .05, .95);
        const r = stone.radius;
        const immersedLength = clamp(-z / Math.sin(alpha), 0, 2 * r);
        const u = clamp(1 - immersedLength / r, -1, 1);
        const area = r * r * (Math.acos(u) - u * Math.sqrt(Math.max(0, 1 - u * u)));
        const normalSpeed = Math.max(0, vx * Math.sin(alpha) - vz * Math.cos(alpha));
        const force = 1000 * normalSpeed * normalSpeed * area * stone.flatness;
        const lift = force * Math.cos(alpha);
        const drag = force * Math.sin(alpha) + .025 * 1000 * area * vx * vx * (2 - stone.flatness);
        az += lift / stone.mass;
        ax -= drag / stone.mass;
        // Torque creates angular drift as the available gyroscopic momentum falls.
        wobble += force * r * .000018 / Math.max(inertia * spin, .00001) * dt;
        spin *= Math.exp(-(2.5 + 5 * (1 - stone.stability)) * dt);
        if (-z > 2 * r * Math.sin(alpha) + stone.thickness || wetTime > .2 || vx < .5) break;
      }
      vx = Math.max(0, vx + ax * dt); vz += az * dt;
      x += vx * dt; z += vz * dt;
      if (wet && z > 0 && vz > 0) {
        // Only an actual return out of the water counts, not the first impact.
        if (t - lastExit < .006) break;
        hops++; lastExit = t; wet = false; wetTime = 0;
        splashes.push({ t, x, hops });
        spin *= .95 - (1 - stone.stability) * .12;
        wobble += (1 - stone.stability) * .006 + .0005;
        if (hops >= 100 || spin < 12 || vx < .7) break;
      }
      if (step % 20 === 0) path.push({ t, x, z, hops });
    }
    path.push({ t, x, z: Math.max(-.04, z), hops });
    return { hops, distance: x, duration: t, path, splashes };
  }

  const DISC_DRAG = 1.05, DISC_TEE = { x: 80, y: 296 };
  const WINDS = [
    { x: 18, y: 24 }, { x: -22, y: 18 }, { x: 14, y: -25 },
    { x: -25, y: -22 }, { x: 26, y: 18 }, { x: -18, y: 30 },
    { x: 23, y: 28 }, { x: -30, y: -24 }, { x: 28, y: -18 },
  ];
  function discFlight(aim, bankDegrees, power, wind) {
    const duration = .7 + clamp(power, 0, 1) * 1.3;
    const speed = 50 + clamp(power, 0, 1) * 590;
    const bank = 70 * Math.tan(bankDegrees * Math.PI / 180);
    const vx = Math.cos(aim) * speed, vy = Math.sin(aim) * speed;
    const ax = wind.x - Math.sin(aim) * bank, ay = wind.y + Math.cos(aim) * bank;
    function at(time) {
      const t = clamp(time, 0, duration);
      const a = (1 - Math.exp(-DISC_DRAG * t)) / DISC_DRAG, b = (t - a) / DISC_DRAG;
      return { x: DISC_TEE.x + vx * a + ax * b, y: DISC_TEE.y + vy * a + ay * b };
    }
    return { duration, at, landing: at(duration) };
  }
  function discSolution(target, bankDegrees, wind) {
    let lo = 0, hi = 1, aim = 0;
    for (let i = 0; i < 45; i++) {
      const power = (lo + hi) / 2, t = .7 + power * 1.3;
      const a = (1 - Math.exp(-DISC_DRAG * t)) / DISC_DRAG, b = (t - a) / DISC_DRAG;
      const dx = target.x - DISC_TEE.x - wind.x * b, dy = target.y - DISC_TEE.y - wind.y * b;
      const along = (50 + power * 590) * a;
      const curve = 70 * Math.tan(bankDegrees * Math.PI / 180) * b;
      aim = Math.atan2(dy, dx) - Math.atan2(curve, along);
      if (Math.hypot(along, curve) < Math.hypot(dx, dy)) lo = power; else hi = power;
    }
    return { power: (lo + hi) / 2, aim };
  }
  const BOCCIA = { MAX_SPEED: 860, STOP_SPEED: 8, GRAVITY: 900, AIR_DRAG: .08, ROLL_DRAG: .75 };
  function bocciaStrength(charge) { return Math.expm1(3 * clamp(charge, 0, 1)) / Math.expm1(3); }
  function bocciaLaunch(x, y, aim, elevation, charge) {
    const speed = BOCCIA.STOP_SPEED + bocciaStrength(charge) * (BOCCIA.MAX_SPEED - BOCCIA.STOP_SPEED);
    const horizontal = Math.cos(elevation) * speed;
    return { x, y, vx: Math.cos(aim) * horizontal, vy: Math.sin(aim) * horizontal,
      height: 6, vz: Math.sin(elevation) * speed };
  }
  function bocciaStep(ball, dt) {
    let remaining = dt;
    if (ball.height > 0 || ball.vz > 0) {
      const landingTime = (ball.vz + Math.sqrt(ball.vz * ball.vz + 2 * BOCCIA.GRAVITY * ball.height)) / BOCCIA.GRAVITY;
      const airTime = Math.min(dt, landingTime), drag = Math.exp(-BOCCIA.AIR_DRAG * airTime);
      const travel = (1 - drag) / BOCCIA.AIR_DRAG;
      ball.x += ball.vx * travel; ball.y += ball.vy * travel;
      ball.vx *= drag; ball.vy *= drag;
      ball.height += ball.vz * airTime - BOCCIA.GRAVITY * airTime * airTime / 2;
      ball.vz -= BOCCIA.GRAVITY * airTime; remaining -= airTime;
      if (airTime >= landingTime) {
        // A higher lob loses more forward speed when the soft ball meets sand.
        const impactAngle = Math.atan2(Math.abs(ball.vz), Math.hypot(ball.vx, ball.vy));
        const retained = .88 - .38 * Math.sin(impactAngle);
        ball.vx *= retained; ball.vy *= retained; ball.height = 0; ball.vz = 0;
      }
    }
    if (remaining > 0) {
      const speed = Math.hypot(ball.vx, ball.vy);
      const stopTime = speed > BOCCIA.STOP_SPEED ? Math.log(speed / BOCCIA.STOP_SPEED) / BOCCIA.ROLL_DRAG : 0;
      const rollTime = Math.min(remaining, stopTime), drag = Math.exp(-BOCCIA.ROLL_DRAG * rollTime);
      const travel = (1 - drag) / BOCCIA.ROLL_DRAG;
      ball.x += ball.vx * travel; ball.y += ball.vy * travel;
      ball.vx *= drag; ball.vy *= drag;
      if (remaining >= stopTime) { ball.vx = 0; ball.vy = 0; }
    }
  }
  global.GamePhysics = { STONES, skipStone, DISC_TEE, WINDS, discFlight, discSolution,
    BOCCIA, bocciaStrength, bocciaLaunch, bocciaStep };
})(window);
