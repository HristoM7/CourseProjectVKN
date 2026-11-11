/*
 * Възпроизводими експерименти за курсовата работа.
 * Стартиране: node experiments.js
 * Не се изискват външни библиотеки.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const engine = require('./engine.js');
const TARGET = path.join(__dirname, 'research');
fs.mkdirSync(TARGET, { recursive: true });

function rngFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

const PAIRS = [
  ['random','heuristic'],
  ['random','minimax'],
  ['heuristic','minimax'],
  ['minimax','alphabeta']
];
const N = 1000;
const BASE_SEED = 20261111;
const LABEL = { random: 'Random', heuristic: 'Heuristic', minimax: 'Minimax', alphabeta: 'Alpha-Beta' };

function simulateOne(x, o, seed) {
  engine.clearCaches();
  const rng = rngFromSeed(seed);
  const summary = {
    x, o, seed, n: N, winsX: 0, winsO: 0, draws: 0, sumMoves: 0,
    stats: { X: { moves:0, nodes:0, hits:0, ms:0 }, O: { moves:0, nodes:0, hits:0, ms:0 } }
  };
  for (let i=0; i<N; i++) {
    const g=engine.simulateGame(x,o,rng);
    if(g.winner==='X') summary.winsX++;
    else if(g.winner==='O') summary.winsO++;
    else summary.draws++;
    summary.sumMoves += g.moves;
    for(const turn of ['X','O']) {
      summary.stats[turn].moves += g.stats[turn].moves;
      summary.stats[turn].nodes += g.stats[turn].nodes;
      summary.stats[turn].hits += g.stats[turn].cacheHits;
      summary.stats[turn].ms += g.stats[turn].ms;
    }
  }
  return summary;
}

const matches=[];
for (let p=0; p<PAIRS.length; p++) {
  const [a,b] = PAIRS[p];
  // Всяка ориентация започва от един и същи фиксиран seed.
  matches.push(simulateOne(a,b,BASE_SEED + 100*p));
  matches.push(simulateOne(b,a,BASE_SEED + 100*p));
}

const pairSummaries=PAIRS.map(([a,b], p)=>{
  const runs=matches.slice(2*p,2*p+2);
  const out={ a, b, games:2*N, aWins:0, bWins:0, draws:0, avgMoves:0 };
  for (const run of runs) {
    out.aWins += run.x===a ? run.winsX : run.winsO;
    out.bWins += run.x===b ? run.winsX : run.winsO;
    out.draws += run.draws;
    out.avgMoves += run.sumMoves;
  }
  out.avgMoves /= out.games;
  return out;
});

// Генерираме детерминистични, достижими (нетерминални) позиции.
const byPly=Array.from({length:9},()=>[]);
const seen=new Set();
function visit(board,turn,ply) {
  const key=board.map(x=>x||'-').join('') + turn;
  if(seen.has(key))return;
  seen.add(key);
  if (engine.checkResult(board).finished) return;
  byPly[ply].push({ board: board.slice(), turn, ply, key });
  for (const move of engine.availableMoves(board)) {
    board[move]=turn;
    visit(board,engine.other(turn),ply+1);
    board[move]=null;
  }
}
visit(Array(9).fill(null),'X',0);

// Разпределяме извадката по брой изиграни ходове, до 12 позиции на дълбочина.
const sample=byPly.flatMap(bucket=>{
  bucket.sort((a,b)=>a.key.localeCompare(b.key,'en'));
  if(bucket.length<=12)return bucket;
  const ids=Array.from({length:12},(_,i)=>Math.floor(i*(bucket.length-1)/11));
  return ids.map(i=>bucket[i]);
});
const benchmark=[];
for (const s of sample) {
  const row={ply:s.ply,board:s.board.map(v=>v||'-').join(''),turn:s.turn};
  for (const algo of ['minimax','alphabeta']) {
    engine.clearCaches(); // студен кеш за всяка отделна позиция/алгоритъм
    const before=s.board.slice();
    const d=engine.chooseMove(s.board,s.turn,algo);
    if (s.board.some((v,i)=>v!==before[i])) throw Error('Алгоритъм промени позицията');
    row[algo+'_nodes']=d.nodes;
    row[algo+'_ms']=d.ms;
    row[algo+'_move']=d.move;
  }
  benchmark.push(row);
}

const benchTotals={
  positions:benchmark.length,
  minimaxNodes:benchmark.reduce((n,r)=>n+r.minimax_nodes,0),
  alphabetaNodes:benchmark.reduce((n,r)=>n+r.alphabeta_nodes,0),
  minimaxMs:benchmark.reduce((n,r)=>n+r.minimax_ms,0),
  alphabetaMs:benchmark.reduce((n,r)=>n+r.alphabeta_ms,0),
  byPly:byPly.map((bucket,ply)=>({ ply, positions:bucket.length, sampled:sample.filter(s=>s.ply===ply).length }))
};
benchTotals.nodeReductionPct = (1-benchTotals.alphabetaNodes/benchTotals.minimaxNodes)*100;

const meta={
  generatedAt:'2026-11-11',
  nodeVersion: process.version,
  platform: `${process.platform}/${process.arch}`,
  gamesPerOrientation:N,
  seedBase:BASE_SEED,
  methodology:'2 orientations per pair; fixed xorshift32 seed; caches cleared before each series and retained across games. Cold-cache benchmark on identical legal nonterminal states with caches cleared per state+algorithm.',
  caution:'Node.js elapsed times are environment-dependent; nodes are more robust; caching makes pruning comparison nontrivial.'
};
const result={meta,matches,pairSummaries,benchmarkSummary:benchTotals};

function csv(rows,cols) {
  return [cols.join(','),...rows.map(r=>cols.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n')+'\n';
}
const runRows=matches.map(r=>({
  algorithmX:LABEL[r.x],algorithmO:LABEL[r.o],seed:r.seed,games:r.n,
  winsX:r.winsX,winsO:r.winsO,draws:r.draws,averageMoves:+(r.sumMoves/r.n).toFixed(3),
  avgNodesX:+(r.stats.X.nodes/r.stats.X.moves).toFixed(3),
  avgNodesO:+(r.stats.O.nodes/r.stats.O.moves).toFixed(3),
  avgMsX:+(r.stats.X.ms/r.stats.X.moves).toFixed(6),
  avgMsO:+(r.stats.O.ms/r.stats.O.moves).toFixed(6)
}));
const pairs=pairSummaries.map(r=>({
  algorithmA:LABEL[r.a],algorithmB:LABEL[r.b],games:r.games,winsA:r.aWins,winsB:r.bWins,draws:r.draws,
  pctWinsA:+(r.aWins/r.games*100).toFixed(2), pctWinsB:+(r.bWins/r.games*100).toFixed(2),pctDraws:+(r.draws/r.games*100).toFixed(2),averageMoves:+r.avgMoves.toFixed(3)
}));

fs.writeFileSync(path.join(TARGET,'results.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(TARGET,'series.csv'),csv(runRows,Object.keys(runRows[0])));
fs.writeFileSync(path.join(TARGET,'comparisons.csv'),csv(pairs,Object.keys(pairs[0])));
fs.writeFileSync(path.join(TARGET,'cold_cache_positions.csv'),csv(benchmark,Object.keys(benchmark[0])));
fs.writeFileSync(path.join(TARGET,'methodology.md'),[
  '# Методика на експерименталното изследване',
  '',
  `- Дата: ${meta.generatedAt}; среда: Node.js ${meta.nodeVersion}, ${meta.platform}.`,
  `- Всяка двойка алгоритми се тества в **${N} партии с A като X** и **${N} партии с B като X** (общо ${2*N} партии).`,
  '- X винаги започва; след първата серия алгоритмите разменят символите, за да се контролира първият ход.',
  `- Случайните решения се генерират чрез фиксиран псевдослучаен генератор xorshift32 с начални стойности ${BASE_SEED}, ${BASE_SEED+100}, ${BASE_SEED+200}, ${BASE_SEED+300}.`,
  '- Кешовете на търсещите алгоритми се изчистват преди всяка серия и се запазват между партиите в рамките на серията.',
  `- При сравнение на търсенето са тествани ${benchmark.length} достижими незавършени позиции с индивидуално изчистване на кеша преди всяко решение (същите позиции и същият играч на ход).`,
  '- Измерванията за време са от текущата машина и са **ориентировъчни**. Броят посетени възли е по-стабилен показател.',
  '- Данните са генерирани чрез оригиналното `engine.js`, без подмяна на алгоритмите.',
  '',
  '## Обобщена таблица',
  '',
  '| Алгоритъм A | Алгоритъм B | Победи A | Победи B | Равенства | Брой партии |',
  '|---|---|---:|---:|---:|---:|',
  ...pairs.map(r=>`| ${r.algorithmA} | ${r.algorithmB} | ${r.winsA} | ${r.winsB} | ${r.draws} | ${r.games} |`),
  '',
  `## Студен кеш: ${benchTotals.positions} позиции`,
  '',
  `- Minimax: ${benchTotals.minimaxNodes.toLocaleString('en-US')} посетени възли.`,
  `- Alpha-Beta: ${benchTotals.alphabetaNodes.toLocaleString('en-US')} посетени възли.`,
  `- Разлика: ${benchTotals.nodeReductionPct.toFixed(2)}% по-малко възли (положителна стойност = намаление).`,
  '',
  'За възпроизвеждане: от папката на проекта изпълнете `node experiments.js`.',
  ''
].join('\n'));
console.log(JSON.stringify({pairs,benchTotals,meta},null,2));
