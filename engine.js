/*
 * Морски шах — независимо ядро на играта и алгоритмите.
 * Работи в браузър, а тестовете го зареждат и през Node.js.
 */
(function (root) {
  'use strict';

  const WIN_LINES = Object.freeze([
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ]);
  const MOVE_ORDER = Object.freeze([4, 0, 2, 6, 8, 1, 3, 5, 7]);
  const LEVELS = Object.freeze(['random', 'heuristic', 'minimax', 'alphabeta']);
  const caches = { minimax: new Map(), alphabeta: new Map() };
  const other = symbol => symbol === 'X' ? 'O' : 'X';

  function availableMoves(board) {
    return MOVE_ORDER.filter(i => board[i] === null);
  }

  function checkResult(board) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return { winner: board[a], line, draw: false, finished: true };
      }
    }
    const draw = board.every(cell => cell !== null);
    return { winner: null, line: null, draw, finished: draw };
  }

  function winningMove(board, symbol) {
    for (const i of availableMoves(board)) {
      board[i] = symbol;
      const wins = checkResult(board).winner === symbol;
      board[i] = null;
      if (wins) return i;
    }
    return null;
  }

  function heuristicMove(board, symbol) {
    const win = winningMove(board, symbol);
    if (win !== null) return win;
    const block = winningMove(board, other(symbol));
    if (block !== null) return block;
    if (board[4] === null) return 4;
    const corner = [0, 2, 6, 8].find(i => board[i] === null);
    if (corner !== undefined) return corner;
    return availableMoves(board)[0];
  }

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  // Оценка от гледна точка на текущия робот. Резултатът зависи от
  // позицията, а не от началната дълбочина: подходящо за мемоизация.
  function terminalScore(board, rootSymbol) {
    const result = checkResult(board);
    if (!result.finished) return null;
    if (result.draw) return 0;
    const occupied = board.reduce((n, cell) => n + Number(cell !== null), 0);
    return result.winner === rootSymbol ? 10 - occupied : occupied - 10;
  }

  function cacheKey(board, turn, rootSymbol) {
    return board.map(cell => cell || '-').join('') + ':' + turn + ':' + rootSymbol;
  }

  function search(board, turn, rootSymbol, alpha, beta, pruning, stats, cache) {
    stats.nodes++;
    const terminal = terminalScore(board, rootSymbol);
    if (terminal !== null) return terminal;

    const key = cacheKey(board, turn, rootSymbol);
    const alphaInitial = alpha;
    const betaInitial = beta;
    const cached = cache.get(key);
    if (cached !== undefined) {
      stats.cacheHits++;
      if (!pruning) return cached;
      // Коректна transposition table: стойностите могат да бъдат
      // точни или доказани долни/горни граници.
      if (cached.flag === 'EXACT') return cached.score;
      if (cached.flag === 'LOWER') alpha = Math.max(alpha, cached.score);
      if (cached.flag === 'UPPER') beta = Math.min(beta, cached.score);
      if (alpha >= beta) return cached.score;
    }

    const isMax = turn === rootSymbol;
    let best = isMax ? -Infinity : Infinity;
    for (const move of availableMoves(board)) {
      board[move] = turn;
      const score = search(board, other(turn), rootSymbol, alpha, beta, pruning, stats, cache);
      board[move] = null;
      best = isMax ? Math.max(best, score) : Math.min(best, score);
      if (pruning) {
        if (isMax) alpha = Math.max(alpha, best);
        else beta = Math.min(beta, best);
        if (alpha >= beta) break;
      }
    }
    if (pruning) {
      const flag = best <= alphaInitial ? 'UPPER' : best >= betaInitial ? 'LOWER' : 'EXACT';
      cache.set(key, { score: best, flag });
    } else cache.set(key, best);
    return best;
  }

  function chooseMove(board, symbol, level = 'minimax', rng = Math.random) {
    if (!Array.isArray(board) || board.length !== 9 || board.some(c => c !== null && c !== 'X' && c !== 'O')) {
      throw new Error('Невалидно игрално поле.');
    }
    if (!['X', 'O'].includes(symbol) || !LEVELS.includes(level)) {
      throw new Error('Невалиден символ или алгоритъм.');
    }
    if (checkResult(board).finished) return { move: null, nodes: 0, cacheHits: 0, ms: 0 };
    const options = availableMoves(board);
    const start = now();
    const stats = { nodes: 0, cacheHits: 0 };
    let move;

    if (level === 'random') {
      const r = Math.min(0.999999999999, Math.max(0, rng()));
      move = options[Math.floor(r * options.length)];
      stats.nodes = 1;
    } else if (level === 'heuristic') {
      move = heuristicMove(board, symbol);
      stats.nodes = options.length;
    } else {
      const pruning = level === 'alphabeta';
      const cache = caches[level];
      let best = -Infinity;
      let alpha = -Infinity;
      for (const candidate of options) {
        board[candidate] = symbol;
        const score = search(board, other(symbol), symbol, alpha, Infinity, pruning, stats, cache);
        board[candidate] = null;
        if (score > best) { best = score; move = candidate; }
        if (pruning) alpha = Math.max(alpha, best);
      }
    }
    return { move, nodes: stats.nodes, cacheHits: stats.cacheHits, ms: now() - start };
  }

  function clearCaches() {
    caches.minimax.clear();
    caches.alphabeta.clear();
  }

  function simulateGame(levelX, levelO, rng = Math.random) {
    if (!LEVELS.includes(levelX) || !LEVELS.includes(levelO)) throw new Error('Невалиден алгоритъм.');
    const board = Array(9).fill(null);
    const stats = { X: { moves: 0, nodes: 0, cacheHits: 0, ms: 0 }, O: { moves: 0, nodes: 0, cacheHits: 0, ms: 0 } };
    let turn = 'X';
    while (!checkResult(board).finished) {
      const level = turn === 'X' ? levelX : levelO;
      const decision = chooseMove(board, turn, level, rng);
      board[decision.move] = turn;
      stats[turn].moves++;
      stats[turn].nodes += decision.nodes;
      stats[turn].cacheHits += decision.cacheHits;
      stats[turn].ms += decision.ms;
      turn = other(turn);
    }
    const result = checkResult(board);
    return { winner: result.winner, draw: result.draw, moves: stats.X.moves + stats.O.moves, stats };
  }

  const api = { WIN_LINES, LEVELS, availableMoves, checkResult, chooseMove, simulateGame, clearCaches, other };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TicTacToeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
