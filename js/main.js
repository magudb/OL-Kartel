/* main.js — one-player game flow and shared tournament results */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const testMode = new URLSearchParams(window.location.search).get("test") === "true";
  const screens = {
    title: $("#screen-title"),
    howto: $("#screen-howto"),
    intro: $("#screen-intro"),
    play: $("#screen-play"),
    final: $("#screen-final"),
    solo: $("#screen-solo"),
    share: $("#screen-share"),
    collect: $("#screen-collect"),
    practice: $("#screen-practice"),
  };

  const state = {
    screen: "title",
    eventIndex: 0,
    history: [], // array of rounds: [{playerId, name, score, detail, place, points}]
    activeGame: null,
    lastResult: null,
    soloRun: null,
    collected: null,
    practiceEventId: null,
  };

  const SOLO_STORAGE = "ol2026.solo.v1";
  const COLLECT_STORAGE = "ol2026.collected.v1";
  let signing = false;
  let importing = false;
  let gameGeneration = 0;

  function setStatus(selector, message, error = false) {
    const element = $(selector);
    element.textContent = message;
    element.classList.toggle("error", error);
  }

  function readSaved(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (_) {
      return null;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function refreshResumeButton() {
    const button = $("#resume-solo");
    button.hidden = !state.soloRun;
    if (state.soloRun) {
      button.textContent = Object.keys(state.soloRun.scores).length === ResultCodes.EVENT_IDS.length
        ? "VIS MIN RESULTATKODE" : "FORTSÆT MIT SPIL";
    }
  }

  function saveSolo() {
    const saved = save(SOLO_STORAGE, state.soloRun);
    refreshResumeButton();
    if (!saved) setStatus("#share-status", "BROWSEREN KAN IKKE GEMME. KOPIÉR KODEN, FØR DU LUKKER SIDEN.", true);
    return saved;
  }

  function appendRow(table, cells, className, numericColumns = [0, 2, 3]) {
    const row = document.createElement("tr");
    if (className) row.className = className;
    cells.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      if (numericColumns.includes(index)) cell.className = "num";
      row.appendChild(cell);
    });
    table.appendChild(row);
  }

  /* ---------- screen switching ---------- */
  function show(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle("active", k === name));
    state.screen = name;
    window.scrollTo(0, 0);
  }

  function stopActiveGame() {
    // Invalidate callbacks before disposal, including games that finish during start().
    gameGeneration += 1;
    const game = state.activeGame;
    state.activeGame = null;
    if (game && game.dispose) game.dispose();
  }

  /* ---------- direct game practice ---------- */
  function renderPracticeGames() {
    const list = $("#practice-games");
    list.replaceChildren();
    Events.all().forEach((ev) => {
      const button = document.createElement("button");
      button.className = "pixel-btn practice-game";
      button.dataset.action = "practice-game";
      button.dataset.eventId = ev.id;
      const name = document.createElement("span");
      name.textContent = ev.name;
      const score = document.createElement("span");
      score.className = "small";
      score.textContent = ev.scoreLabel;
      button.append(name, score);
      list.appendChild(button);
    });
  }

  function openPractice() {
    if (!testMode) return;
    const previousId = state.practiceEventId;
    stopActiveGame();
    state.practiceEventId = null;
    state.lastResult = null;
    show("practice");
    const buttons = Array.from($("#practice-games").children);
    const selected = buttons.find((button) => button.dataset.eventId === previousId) || buttons[0];
    if (selected) selected.focus({ preventScroll: true });
  }

  function launchPractice(id) {
    if (!testMode || !Events.get(id)) return;
    stopActiveGame();
    state.practiceEventId = id;
    beginEventPlay();
    startTurnGame();
    $("#game-canvas").focus({ preventScroll: true });
  }

  function replayPractice() {
    if (state.practiceEventId) launchPractice(state.practiceEventId);
  }

  /* ---------- tour ---------- */
  function currentEvent() {
    return state.practiceEventId ? Events.get(state.practiceEventId) : Events.all()[state.eventIndex];
  }

  function currentPlayer() {
    if (state.practiceEventId) return { id: "practice", name: "ØVELSE" };
    return { id: state.soloRun.id, name: state.soloRun.name };
  }

  function beginSolo() {
    const run = ResultCodes.createRun($("#solo-name").value, $("#solo-tournament").value);
    state.soloRun = run;
    const saved = saveSolo();
    resumeSolo();
    if (!saved) $("#intro-meta").textContent += " · BROWSEREN KAN IKKE GEMME DIT SPIL.";
  }

  function resumeSolo() {
    if (!state.soloRun) return;
    stopActiveGame();
    state.practiceEventId = null;
    const run = ResultCodes.validateRun(state.soloRun);
    state.soloRun = run;
    state.eventIndex = Object.keys(run.scores).length;
    state.history = ResultCodes.EVENT_IDS.slice(0, state.eventIndex).map((id) => [{
      playerId: run.id, name: run.name, score: run.scores[id],
    }]);
    state.lastResult = null;
    if (state.eventIndex === ResultCodes.EVENT_IDS.length) showSoloResult();
    else showEventIntro();
  }

  function showEventIntro() {
    const ev = currentEvent();
    if (!ev) {
      showSoloResult();
      return;
    }
    $("#intro-kicker").textContent =
      "DISCIPLIN " + (state.eventIndex + 1) + " / " + Events.all().length;
    $("#intro-name").textContent = ev.name;
    $("#intro-desc").textContent = ev.blurb;
    $("#intro-meta").textContent = ev.meta;
    const order = $("#intro-order");
    order.innerHTML = "";
    const chip = document.createElement("span");
    chip.className = "player-chip";
    chip.textContent = currentPlayer().name;
    order.appendChild(chip);
    show("intro");
  }

  function beginEventPlay() {
    show("play");
    beginTurn();
  }

  function beginTurn() {
    const ev = currentEvent();
    const p = currentPlayer();
    state.lastResult = null;

    $("#play-event").textContent = ev.name;
    $("#play-round").textContent = state.practiceEventId ? "ØVELSE" : "MIT SPIL";
    $("#play-player").textContent = p.name;
    $("#play-stats").textContent = ev.scoreLabel || "";
    $("#game-hint").textContent = ev.hint;
    $("#practice-controls").hidden = !state.practiceEventId;
    $("#practice-result-controls").hidden = !state.practiceEventId;
    $('[data-action="continue-game"]').hidden = !!state.practiceEventId;
    $("#done-kicker").textContent = state.practiceEventId ? "ØVELSE FÆRDIG" : "FÆRDIG";

    $("#turn-name").textContent = p.name;
    $("#turn-overlay").classList.remove("hidden");
    $("#game-done-overlay").classList.add("hidden");
  }

  function startTurnGame() {
    if (state.lastResult || $("#turn-overlay").classList.contains("hidden")) return;
    stopActiveGame();
    const generation = gameGeneration;
    const ev = currentEvent();
    const p = currentPlayer();
    $("#turn-overlay").classList.add("hidden");
    $("#game-done-overlay").classList.add("hidden");
    $("#game-hint").textContent = ev.hint;

    const canvas = $("#game-canvas");
    const api = {
      canvas,
      ctx: canvas.getContext("2d"),
      player: p,
      history: state.practiceEventId ? [] : state.history,
      finish: (score, detail) => {
        if (generation === gameGeneration) finishTurn(score, detail);
      },
      setHint: (txt) => {
        if (generation === gameGeneration) $("#game-hint").textContent = txt;
      },
    };

    const game = ev.start(api) || null;
    if (generation === gameGeneration) state.activeGame = game;
    else if (game && game.dispose) game.dispose();
  }

  function finishTurn(score, detail) {
    if (state.screen !== "play" || state.lastResult) return;
    const ev = currentEvent();
    const p = currentPlayer();
    ResultCodes.validateScore(ev.id, score);
    if (!state.practiceEventId) {
      state.soloRun.scores[ev.id] = score;
      saveSolo();
    }
    state.lastResult = {
      playerId: p.id,
      name: p.name,
      score,
      detail: detail || "",
      lowerIsBetter: ev.lowerIsBetter,
      unit: ev.unit,
      scoreLabel: ev.scoreLabel,
    };

    const display = Scoring.formatScore(score, ev.unit);
    $("#done-result").textContent = display;
    $("#done-detail").textContent = detail || p.name;
    $("#game-done-overlay").classList.remove("hidden");
    document.querySelector('[data-action="continue-game"]').textContent =
      state.eventIndex === Events.all().length - 1 ? "VIS MIN RESULTATKODE" : "NÆSTE DISCIPLIN";

    stopActiveGame();
  }

  function continueGame() {
    if (state.practiceEventId) {
      replayPractice();
      return;
    }
    if (!state.lastResult) return;
    state.history.push([state.lastResult]);
    state.lastResult = null;
    state.eventIndex += 1;
    showEventIntro();
  }

  function showFinal() {
    const stand = state.collected.standings;

    // podium top 3
    const podium = $("#podium");
    podium.innerHTML = "";
    const order = [stand[1], stand[0], stand[2]].filter(Boolean);
    order.forEach((row) => {
      const col = document.createElement("div");
      col.className = "podium-col";
      const block = document.createElement("div");
      block.className = "podium-block p" + row.place;
      block.textContent = String(row.place);
      const name = document.createElement("div");
      name.className = "podium-name";
      name.textContent = row.name;
      const pts = document.createElement("div");
      pts.className = "podium-pts";
      pts.textContent = row.points + " PT";
      col.appendChild(name);
      col.appendChild(block);
      col.appendChild(pts);
      podium.appendChild(col);
    });

    const table = $("#final-table");
    table.innerHTML =
      "<tr><th>#</th><th>SPILLER</th><th>POINT</th><th>PR. DISCIPLIN</th></tr>";
    stand.forEach((row) => {
      const perEvent = state.collected.history.map((round) => {
        const hit = round.find((r) => r.playerId === row.id);
        return hit ? hit.points : "-";
      });
      appendRow(table, [row.place, row.name, row.points, perEvent.join(" · ")],
        row.place === 1 ? "winner" : row.points === stand[stand.length - 1].points ? "loser" : "");
    });

    const loser = stand[stand.length - 1];
    const losers = stand.filter((row) => row.points === loser.points);
    $("#loser-name").textContent = losers.map((row) => row.name).join(" · ");
    $("#loser-banner .loser-kicker").textContent = losers.length > 1 ? "DELER SIDSTEPLADSEN" : "DEN STORE TABER";
    $("#loser-sub").textContent =
      loser.points +
      " POINT · " +
      stand[0].name +
      " SLAP AF MED " +
      stand[0].points +
      " POINT";
    show("final");
  }

  function showSoloResult() {
    const run = state.soloRun;
    $("#share-tournament").textContent = "TURNERING " + run.tournament;
    $("#share-name").textContent = run.name + " — FÆRDIG";
    const table = $("#solo-results-table");
    table.innerHTML = "<tr><th>DISCIPLIN</th><th>RESULTAT</th></tr>";
    ResultCodes.EVENT_IDS.forEach((id) => {
      const ev = Events.get(id);
      appendRow(table, [ev.name, Scoring.formatScore(run.scores[id], ev.unit)], "", [1]);
    });
    $("#result-code").value = "";
    $("#copy-result").disabled = true;
    $("#download-result").disabled = true;
    $("#retry-sign").hidden = true;
    show("share");
    generateResultCode();
  }

  async function generateResultCode() {
    if (signing || !state.soloRun) return;
    signing = true;
    const run = state.soloRun;
    setStatus("#share-status", "LAVER DIN RESULTATKODE...");
    $("#retry-sign").hidden = true;
    try {
      if (run.token) {
        const payload = await ResultCodes.verifyToken(run.token);
        if (payload.jti !== run.id || payload.name !== run.name || payload.tournament !== run.tournament ||
          JSON.stringify(payload.scores) !== JSON.stringify(run.scores)) {
          throw new Error("DEN GEMTE KODE PASSER IKKE TIL DIT RESULTAT.");
        }
      } else {
        run.token = await ResultCodes.signRun(run);
      }
      if (state.soloRun !== run) return;
      $("#result-code").value = run.token;
      $("#copy-result").disabled = false;
      $("#download-result").disabled = false;
      setStatus("#share-status", "KODEN ER KLAR. GEM ELLER DEL DEN MED DINE VENNER.");
      saveSolo();
    } catch (error) {
      if (state.soloRun === run) {
        setStatus("#share-status", error.message, true);
        $("#retry-sign").hidden = false;
      }
    } finally {
      signing = false;
      if (state.screen === "share" && state.soloRun !== run) generateResultCode();
    }
  }

  async function copyResult() {
    const input = $("#result-code");
    if (!input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      setStatus("#share-status", "KOPIERET! SEND KODEN TIL DEN, DER SAMLER RESULTATERNE.");
    } catch (_) {
      input.focus();
      input.select();
      setStatus("#share-status", "KODEN ER MARKERET. KOPIÉR MED CTRL+C ELLER CMD+C.");
    }
  }

  function downloadResult() {
    if (!state.soloRun || !state.soloRun.token) return;
    const blob = new Blob([state.soloRun.token + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ol2026-" + state.soloRun.tournament + "-resultat.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderCollected() {
    const collected = state.collected;
    $("#collected-tournament").textContent = collected
      ? "TURNERING " + collected.tournament + " · " + collected.players.length + " RESULTATER MODTAGET" : "";
    const list = $("#collected-players");
    list.replaceChildren();
    if (collected) collected.players.forEach((player) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = player.name + " · ALLE 7 DISCIPLINER";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "pixel-btn small";
      remove.dataset.action = "remove-result";
      remove.dataset.playerId = player.id;
      remove.textContent = "FJERN";
      remove.setAttribute("aria-label", "Fjern resultat for " + player.name);
      item.append(label, remove);
      list.appendChild(item);
    });
    $("#show-collected").disabled = importing || !collected || collected.players.length < 2;
    $("#add-own-result").hidden = !state.soloRun || !state.soloRun.token;
  }

  function openCollector() {
    show("collect");
    setStatus("#collect-status", "");
    renderCollected();
  }

  async function importCodes(codes) {
    if (importing) return;
    importing = true;
    $("#import-results").disabled = true;
    renderCollected();
    setStatus("#collect-status", "KONTROLLERER RESULTATKODER...");
    try {
      const previous = state.collected ? state.collected.codes : [];
      const collected = await ResultCodes.combineCodes(previous.concat(codes));
      state.collected = collected;
      $("#import-codes").value = "";
      setStatus("#collect-status", collected.players.length + " RESULTATER KLAR.");
      if (!save(COLLECT_STORAGE, collected.codes)) {
        setStatus("#collect-status", "RESULTATER ER KLAR, MEN BROWSEREN KAN IKKE GEMME DEM. BEHOLD KODERNE.", true);
      }
    } catch (error) {
      setStatus("#collect-status", error.message, true);
    } finally {
      importing = false;
      $("#import-results").disabled = false;
      renderCollected();
    }
  }

  async function removeResult(playerId) {
    if (importing || !state.collected) return;
    const index = state.collected.players.findIndex((player) => player.id === playerId);
    if (index < 0) return;
    const codes = state.collected.codes.filter((_, i) => i !== index);
    importing = true;
    $("#import-results").disabled = true;
    renderCollected();
    try {
      state.collected = codes.length ? await ResultCodes.combineCodes(codes) : null;
      save(COLLECT_STORAGE, codes);
      setStatus("#collect-status", "RESULTAT FJERNET.");
    } catch (error) {
      setStatus("#collect-status", error.message, true);
    } finally {
      importing = false;
      $("#import-results").disabled = false;
      renderCollected();
    }
  }

  function showCollected() {
    if (importing || !state.collected || state.collected.players.length < 2) return;
    showFinal();
  }

  $("#solo-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      setStatus("#solo-error", "");
      beginSolo();
    } catch (error) {
      setStatus("#solo-error", error.message, true);
    }
  });

  $("#collect-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const codes = $("#import-codes").value.trim().split(/\s+/).filter(Boolean);
    importCodes(codes);
  });

  /* ---------- global buttons ---------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    switch (action) {
      case "solo-setup":
        $("#solo-name").value = "";
        setStatus("#solo-error", "");
        show("solo");
        $("#solo-name").focus();
        break;
      case "resume-solo":
        resumeSolo();
        break;
      case "open-practice":
      case "practice-choose-result":
        openPractice();
        break;
      case "practice-game":
        launchPractice(btn.dataset.eventId);
        break;
      case "practice-replay":
      case "practice-replay-result":
        replayPractice();
        break;
      case "open-collector":
        openCollector();
        break;
      case "copy-result":
        copyResult();
        break;
      case "download-result":
        downloadResult();
        break;
      case "sign-result":
        generateResultCode();
        break;
      case "add-own-result":
        if (state.soloRun && state.soloRun.token) importCodes([state.soloRun.token]);
        break;
      case "remove-result":
        removeResult(btn.dataset.playerId);
        break;
      case "show-collected":
        showCollected();
        break;
      case "how-to":
        show("howto");
        break;
      case "to-title":
        stopActiveGame();
        state.practiceEventId = null;
        state.lastResult = null;
        show("title");
        break;
      case "begin-event":
        beginEventPlay();
        break;
      case "start-turn":
        startTurnGame();
        break;
      case "continue-game":
        continueGame();
        break;
    }
  });

  // Enter starts turn when overlay visible
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (state.practiceEventId && e.target.closest("button")) return;
    if (state.screen === "play") {
      const turnOv = $("#turn-overlay");
      const doneOv = $("#game-done-overlay");
      if (!turnOv.classList.contains("hidden")) {
        e.preventDefault();
        startTurnGame();
      } else if (!doneOv.classList.contains("hidden")) {
        e.preventDefault();
        continueGame();
      }
    } else if (state.screen === "intro") {
      e.preventDefault();
      beginEventPlay();
    }
  });

  // boot
  const savedRun = readSaved(SOLO_STORAGE);
  if (savedRun) {
    try {
      state.soloRun = ResultCodes.validateRun(savedRun);
    } catch (_) {
      // An incompatible save never replaces a new run or produces a result code.
    }
  }
  refreshResumeButton();
  $("#practice-entry").hidden = !testMode;
  screens.practice.hidden = !testMode;
  if (testMode) renderPracticeGames();
  const savedCodes = readSaved(COLLECT_STORAGE);
  if (Array.isArray(savedCodes) && savedCodes.length) {
    importing = true;
    $("#import-results").disabled = true;
    ResultCodes.combineCodes(savedCodes).then((collected) => {
      state.collected = collected;
    }).catch(() => {
      setStatus("#collect-status", "GEMTE RESULTATKODER KUNNE IKKE KONTROLLERES. INDSÆT DEM IGEN.", true);
    }).finally(() => {
      importing = false;
      $("#import-results").disabled = false;
      renderCollected();
    });
  }
  show("title");
})();
