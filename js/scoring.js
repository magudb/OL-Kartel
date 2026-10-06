/* scoring.js — reverse podium points + standings */
(function (global) {
  "use strict";

  /**
   * Reverse podium: winner gets numPlayers points, last gets 1.
   * Lowest total across all events = DEN STORE TABER.
   */
  function placePoints(place, numPlayers) {
    return numPlayers - place + 1;
  }

  /**
   * Sort entries by raw score.
   * @param {{score:number,name:string,playerId:string}} entries
   * @param {boolean} lowerIsBetter
   * Ties share the same place (dense competition ranking with skip).
   */
  function rankEntries(entries, lowerIsBetter) {
    const sorted = entries.slice().sort(function (a, b) {
      if (a.score === b.score) return 0;
      if (lowerIsBetter) return a.score - b.score;
      return b.score - a.score;
    });
    let lastScore = null;
    let lastPlace = 0;
    return sorted.map(function (e, i) {
      let place;
      if (lastScore !== null && e.score === lastScore) {
        place = lastPlace;
      } else {
        place = i + 1;
        lastPlace = place;
        lastScore = e.score;
      }
      return Object.assign({}, e, { place: place, points: placePoints(place, entries.length) });
    });
  }

  function totalPoints(history, playerIds) {
    const totals = {};
    playerIds.forEach(function (id) {
      totals[id] = 0;
    });
    history.forEach(function (round) {
      round.forEach(function (row) {
        totals[row.playerId] = (totals[row.playerId] || 0) + row.points;
      });
    });
    return totals;
  }

  function standings(history, players) {
    const ids = players.map(function (p) {
      return p.id;
    });
    const totals = totalPoints(history, ids);
    let lastPoints = null;
    let lastPlace = 0;
    return players
      .map(function (p) {
        return { id: p.id, name: p.name, points: totals[p.id] || 0 };
      })
      .sort(function (a, b) {
        return b.points - a.points;
      })
      .map(function (row, i) {
        const place = row.points === lastPoints ? lastPlace : i + 1;
        lastPoints = row.points;
        lastPlace = place;
        return Object.assign(row, { place: place });
      });
  }

  /** Format a discipline score for display */
  function formatScore(score, unit) {
    if (unit === "sek") return score.toFixed(2) + " SEK";
    if (unit === "slag") return score + " SLAG";
    if (unit === "skridt") return score + " SKRIDT";
    if (unit === "træf") return score + " TRÆF";
    if (unit === "point") return score + " POINT";
    if (unit === "px") return score + " AFSTAND";
    return String(score);
  }

  global.Scoring = {
    placePoints,
    rankEntries,
    totalPoints,
    standings,
    formatScore,
  };
})(window);
