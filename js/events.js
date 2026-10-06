/* events.js — discipline registry + tour order */
(function (global) {
  "use strict";

  const registry = Object.create(null);

  /**
   * Register a discipline.
   * def = {
   *   id, name, nameShort, blurb, meta, hint,
   *   lowerIsBetter: boolean,
   *   unit: 'slag'|'skridt'|'træf'|'sek'|'point',
   *   scoreLabel: string shown on results,
   *   start: function(api)  → game handles its own loop, calls api.finish(score, detail)
   *   api = { canvas, player, setHint, finish }
   * }
   */
  function register(def) {
    registry[def.id] = def;
  }

  function get(id) {
    return registry[id];
  }

  /** Fixed tournament order */
  const ORDER = [
    "minigolf",
    "freethrows",
    "stones",
    "water",
    "frisbee",
    "boccia",
    "bob",
  ];

  function all() {
    return ORDER.map(function (id) {
      return registry[id];
    }).filter(Boolean);
  }

  global.Events = {
    register,
    get,
    all,
    ORDER,
  };
})(window);
