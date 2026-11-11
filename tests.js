'use strict';
const assert = require('node:assert/strict');
const engine = require('./engine.js');
const { checkResult, chooseMove, simulateGame, other, availableMoves } = engine;
const blank = () => Array(9).fill(null);

// Независим референтен решател: връща резултат -1, 0 или 1
// от гледна точка на играча на ход.
const solved = new Map();
function referenceValue(board, turn) {
  const key = board.map(x => x || '-').join('') + turn;
  if (solved.has(key)) return solved.get(key);
  const result = checkResult(board);
  if (result.finished) return result.draw ? 0 : (result.winner === turn ? 1 : -1);
  let best = -2;
  for (const move of availableMoves(board)) {
    board[move] = turn;
    const value = -referenceValue(board, other(turn));
    board[move] = null;
    best = Math.max(best, value);
  }
  solved.set(key, best);
  return best;
}

assert.equal(checkResult(blank()).finished, false);
for (const line of engine.WIN_LINES) {
  const board = blank();
  line.forEach(i => board[i] = 'X');
  assert.equal(checkResult(board).winner, 'X');
}
const drawn = ['X','O','X','X','O','O','O','X','X'];
assert.equal(checkResult(drawn).draw, true);
assert.equal(chooseMove(['X','X',null,'O','O',null,null,null,null], 'X','heuristic').move, 2);
assert.equal(chooseMove(['O','O',null,'X',null,null,'X',null,null], 'X','heuristic').move, 2);
assert.equal(chooseMove(blank(), 'X','random', () => 0).move, 4);
assert.equal(chooseMove(blank(), 'X','random', () => .999999).move, 7);

const seen = new Set();
let states = 0;
function traverse(board, turn) {
  const key = board.map(x => x || '-').join('') + turn;
  if (seen.has(key)) return;
  seen.add(key);
  if (checkResult(board).finished) return;
  states++;
  const expected = referenceValue(board, turn);
  for (const algorithm of ['minimax', 'alphabeta']) {
    const before = board.slice();
    const chosen = chooseMove(board, turn, algorithm);
    assert.deepEqual(board, before, `${algorithm} must not mutate the board`);
    assert.ok(availableMoves(board).includes(chosen.move), `${algorithm} illegal move at ${key}`);
    board[chosen.move] = turn;
    const got = -referenceValue(board, other(turn));
    board[chosen.move] = null;
    assert.equal(got, expected, `${algorithm} suboptimal move at ${key}`);
  }
  for (const move of availableMoves(board)) {
    board[move] = turn;
    traverse(board, other(turn));
    board[move] = null;
  }
}
traverse(blank(), 'X');

for (const ai of ['minimax', 'alphabeta']) {
  assert.equal(simulateGame(ai, ai).draw, true, `${ai} vs itself should draw`);
  for (const opponent of ['random', 'heuristic', 'minimax', 'alphabeta']) {
    for (let i = 0; i < 25; i++) {
      assert.notEqual(simulateGame(ai, opponent).winner, 'O', `${ai} lost as X to ${opponent}`);
      assert.notEqual(simulateGame(opponent, ai).winner, 'X', `${ai} lost as O to ${opponent}`);
    }
  }
}
console.log(`УСПЕХ: проверени са ${states} достижими незавършени позиции и 400 симулирани партии.`);
