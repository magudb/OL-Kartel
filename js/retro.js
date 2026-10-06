/* retro.js — pixel helpers + tiny canvas toolkit */
(function (global) {
  "use strict";

  const PAL = {
    black: "#0d0830",
    deep: "#1a1260",
    bg: "#3e31a2",
    border: "#7c70da",
    white: "#ffffff",
    cyan: "#95f4f6",
    yellow: "#ffff54",
    orange: "#f5a05a",
    red: "#e05555",
    green: "#6de66d",
    purple: "#b4a7ff",
    brown: "#8b5a2b",
    sand: "#d2b48c",
    water: "#2a6db5",
    grass: "#3e9a3e",
    greenDark: "#2d6f2d",
    wood: "#a5682a",
  };

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function randInt(a, b) {
    return Math.floor(rand(a, b + 1));
  }

  function dist(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.hypot(dx, dy);
  }

  function angleTo(ax, ay, bx, by) {
    return Math.atan2(by - ay, bx - ax);
  }

  /** Retro pixel text on canvas */
  function pixelText(ctx, text, x, y, color, size, align) {
    size = size || 12;
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = PAL.black;
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color || PAL.white;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function strokeRect(ctx, x, y, w, h, color, lw) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }

  function circle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function line(ctx, x1, y1, x2, y2, color, lw) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /** Simple rAF game loop helper */
  function loop(step) {
    let last = performance.now();
    let alive = true;
    function frame(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt, now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return function stop() {
      alive = false;
    };
  }

  /** Track keys held / pressed-this-frame */
  function Keyboard(target) {
    const down = Object.create(null);
    const pressed = Object.create(null);
    const released = Object.create(null);

    function onKeyDown(e) {
      const k = keyName(e);
      if (k) {
        if (!down[k]) pressed[k] = true;
        down[k] = true;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", " "].includes(e.key) || e.code === "Space") {
          e.preventDefault();
        }
      }
    }
    function onKeyUp(e) {
      const k = keyName(e);
      if (k) {
        down[k] = false;
        released[k] = true;
      }
    }
    function keyName(e) {
      if (e.code === "Space" || e.key === " ") return "Space";
      if (e.key === "ArrowLeft") return "Left";
      if (e.key === "ArrowRight") return "Right";
      if (e.key === "ArrowUp") return "Up";
      if (e.key === "ArrowDown") return "Down";
      if (e.key === "Enter") return "Enter";
      if (e.key.length === 1) return e.key.toUpperCase();
      return e.key;
    }

    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);

    return {
      down(k) {
        return !!down[k];
      },
      pressed(k) {
        return !!pressed[k];
      },
      released(k) {
        return !!released[k];
      },
      altPressed() {
        // Summer-Games style: alternate Left/Right
        return pressed.Left || pressed.Right;
      },
      endFrame() {
        for (const k in pressed) pressed[k] = false;
        for (const k in released) released[k] = false;
      },
      dispose() {
        target.removeEventListener("keydown", onKeyDown);
        target.removeEventListener("keyup", onKeyUp);
      },
    };
  }

  /** Base scaffold every discipline can use */
  function createGameShell(opts) {
    const canvas = opts.canvas;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const kb = Keyboard(window);
    let stopLoop = null;
    let disposed = false;

    function start(update, draw) {
      stopLoop = loop(function (dt) {
        if (disposed) return;
        update(dt);
        // full clear so disciplines never ghost previous frames
        ctx.fillStyle = PAL.black;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        draw();
        kb.endFrame();
      });
    }

    function dispose() {
      disposed = true;
      if (stopLoop) stopLoop();
      kb.dispose();
    }

    return { canvas, ctx, kb, start, dispose, PAL, W: canvas.width, H: canvas.height };
  }

  global.Retro = {
    PAL,
    clamp,
    lerp,
    rand,
    randInt,
    dist,
    angleTo,
    pixelText,
    rect,
    strokeRect,
    circle,
    line,
    loop,
    Keyboard,
    createGameShell,
  };
})(window);
