(function () {
  'use strict';

  const engine = window.TicTacToeEngine;
  const $ = id => document.getElementById(id);
  const LABELS = Object.freeze({
    random: 'Random', heuristic: 'Heuristic', minimax: 'Minimax', alphabeta: 'Alpha-Beta'
  });
  const DESCRIPTIONS = Object.freeze({
    random: 'Random избира напълно случаен ход измежду свободните полета.',
    heuristic: 'Heuristic първо търси победа, после блокира противника и предпочита центъра или ъглите.',
    minimax: 'Minimax разглежда възможните продължения и избира оптимален ход.',
    alphabeta: 'Alpha-Beta намира оптимален ход като Minimax, но отрязва ненужни разклонения.'
  });
  const STORAGE_KEY = 'morski-shah-stats-v1';
  const emptyScores = () => ({ ai: { wins: 0, losses: 0, draws: 0 }, pvp: { X: 0, O: 0, draws: 0 } });

  function loadScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && raw.ai && raw.pvp &&
          [raw.ai.wins, raw.ai.losses, raw.ai.draws, raw.pvp.X, raw.pvp.O, raw.pvp.draws]
            .every(value => Number.isInteger(value) && value >= 0)) return raw;
    } catch (_) { /* Браузърът може да забранява локално съхранение. */ }
    return emptyScores();
  }
  let scores = loadScores();
  let game = null;
  let aiTimer = null;
  let simulation = null;
  let lastExperiment = null;
  const number = new Intl.NumberFormat('bg-BG');

  function persistScores() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scores)); } catch (_) { /* Незадължителна функция. */ }
  }

  function previewSettings() {
    const pvp = $('modeSelect').value === 'pvp';
    $('symbolSelect').disabled = pvp;
    $('levelSelect').disabled = pvp;
    $('levelInfo').textContent = pvp
      ? 'Двама души се редуват на едно устройство. Играч X започва пръв.'
      : DESCRIPTIONS[$('levelSelect').value];
  }

  function showScores() {
    if (game.mode === 'ai') {
      $('statWinsLabel').textContent = 'Победи';
      $('statLossesLabel').textContent = 'Загуби';
      $('statWins').textContent = number.format(scores.ai.wins);
      $('statLosses').textContent = number.format(scores.ai.losses);
      $('statDraws').textContent = number.format(scores.ai.draws);
    } else {
      $('statWinsLabel').textContent = 'Победи X';
      $('statLossesLabel').textContent = 'Победи O';
      $('statWins').textContent = number.format(scores.pvp.X);
      $('statLosses').textContent = number.format(scores.pvp.O);
      $('statDraws').textContent = number.format(scores.pvp.draws);
    }
    $('stats-heading').textContent = game.mode === 'ai' ? 'Твоята статистика' : 'Резултати за двама';
  }

  function setStatus(text, symbol = null, finished = false) {
    $('statusText').textContent = text;
    $('turnIcon').textContent = symbol || '✓';
    $('turnIcon').style.color = symbol === 'O' ? 'var(--violet)' : 'var(--blue)';
    $('stateIndicator').classList.toggle('finished', finished);
    $('stateIndicator').lastChild.textContent = finished ? ' Завършена' : ' В игра';
  }

  function renderBoard() {
    const result = engine.checkResult(game.board);
    const canClick = !game.finished && !game.waiting && (game.mode === 'pvp' || game.turn === game.human);
    [...$('board').children].forEach((square, i) => {
      const cell = game.board[i];
      square.textContent = cell || '';
      square.className = 'square' + (cell === 'O' ? ' symbol-o' : '') +
        (result.line && result.line.includes(i) ? ' win-square' : '');
      square.disabled = !canClick || cell !== null;
      square.setAttribute('aria-label', `Ред ${Math.floor(i / 3) + 1}, колона ${i % 3 + 1}: ${cell || 'свободно'}`);
    });
  }

  function setTurnMessage() {
    if (game.mode === 'pvp') setStatus(`Ход на играч ${game.turn}`, game.turn);
    else if (game.waiting) setStatus(`Компютърът обмисля ход (${game.turn})…`, game.turn);
    else setStatus(`Ти си на ход (${game.turn})`, game.turn);
  }

  function finishGame(result) {
    game.finished = true;
    if (game.mode === 'ai') {
      if (result.draw) scores.ai.draws++;
      else if (result.winner === game.human) scores.ai.wins++;
      else scores.ai.losses++;
    } else {
      if (result.draw) scores.pvp.draws++;
      else scores.pvp[result.winner]++;
    }
    persistScores();
    showScores();
    if (result.draw) setStatus('Равенство! Никой не печели.', null, true);
    else if (game.mode === 'pvp') setStatus(`Победител: играч ${result.winner}!`, result.winner, true);
    else setStatus(result.winner === game.human ? 'Поздравления! Ти победи!' : 'Компютърът победи!', result.winner, true);
  }

  function playAt(index) {
    if (game.finished || game.board[index] !== null) return;
    game.board[index] = game.turn;
    const result = engine.checkResult(game.board);
    if (result.finished) finishGame(result);
    else {
      game.turn = engine.other(game.turn);
      if (game.mode === 'ai' && game.turn !== game.human) scheduleComputerMove();
      else setTurnMessage();
    }
    renderBoard();
  }

  function scheduleComputerMove() {
    game.waiting = true;
    setTurnMessage();
    renderBoard();
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (game.finished) return;
      const decision = engine.chooseMove(game.board, game.turn, game.level);
      game.waiting = false;
      $('lastDecision').textContent = `Последен ход на ${LABELS[game.level]}: ${number.format(decision.nodes)} разгледани възли, ${decision.ms.toFixed(3)} ms, ${number.format(decision.cacheHits)} попадения в кеша.`;
      if (decision.move !== null) playAt(decision.move);
    }, 320);
  }

  function startGame() {
    if (aiTimer !== null) clearTimeout(aiTimer);
    aiTimer = null;
    game = {
      board: Array(9).fill(null), turn: 'X', finished: false, waiting: false,
      mode: $('modeSelect').value,
      human: $('symbolSelect').value,
      level: $('levelSelect').value
    };
    $('lastDecision').textContent = 'Избери свободно поле, за да направиш ход.';
    showScores();
    setTurnMessage();
    renderBoard();
    if (game.mode === 'ai' && game.human === 'O') scheduleComputerMove();
  }

  function boardClicked(index) {
    if (game.finished || game.waiting || game.board[index] !== null) return;
    if (game.mode === 'ai' && game.turn !== game.human) return;
    playAt(index);
  }

  function createBoard() {
    for (let i = 0; i < 9; i++) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = 'square';
      square.addEventListener('click', () => boardClicked(i));
      $('board').appendChild(square);
    }
  }

  function showSimulationProgress() {
    $('experimentProgressWrap').hidden = false;
    const pct = Math.round(simulation.completed / simulation.count * 100);
    $('experimentProgress').value = pct;
    $('progressPct').textContent = pct + '%';
    $('progressLabel').textContent = `${number.format(simulation.completed)} от ${number.format(simulation.count)} партии`;
  }

  function finishSimulation() {
    const current = simulation;
    simulation = null;
    $('runExperimentBtn').disabled = false;
    $('stopExperimentBtn').disabled = true;
    $('algoX').disabled = false;
    $('algoO').disabled = false;
    $('gamesCount').disabled = false;
    if (current.cancelled) {
      $('progressLabel').textContent = `Прекъснато след ${number.format(current.completed)} партии`;
      if (!current.completed) return;
    }
    lastExperiment = current;
    renderSimulationResults(current);
  }

  function renderSimulationResults(data) {
    const total = data.completed;
    const avgMoves = data.totalMoves / total;
    const sX = data.stats.X;
    const sO = data.stats.O;
    const avg = (value, turns) => turns ? (value / turns).toFixed(3) : '0.000';
    const table = `
      <table class="result-table">
        <thead><tr><th>Показател</th><th>X · ${LABELS[data.x]}</th><th>O · ${LABELS[data.o]}</th></tr></thead>
        <tbody>
          <tr><td>Общо направени ходове</td><td>${number.format(sX.moves)}</td><td>${number.format(sO.moves)}</td></tr>
          <tr><td>Посетени възли</td><td>${number.format(sX.nodes)}</td><td>${number.format(sO.nodes)}</td></tr>
          <tr><td>Попадения в кеша</td><td>${number.format(sX.cacheHits)}</td><td>${number.format(sO.cacheHits)}</td></tr>
          <tr><td>Средно възли/ход</td><td>${number.format(Math.round(sX.nodes / Math.max(1, sX.moves)))}</td><td>${number.format(Math.round(sO.nodes / Math.max(1, sO.moves)))}</td></tr>
          <tr><td>Средно време/ход</td><td>${avg(sX.ms, sX.moves)} ms</td><td>${avg(sO.ms, sO.moves)} ms</td></tr>
        </tbody>
      </table>`;
    $('experimentResults').classList.add('has-results');
    $('experimentResults').innerHTML = `
      <div class="results-title">Резултати от ${number.format(total)} симулирани партии ${data.cancelled ? '(частични)' : ''}</div>
      <div class="result-stats">
        <div class="result-cell"><strong>${number.format(data.xWins)}</strong><span>Победи X · ${(100 * data.xWins / total).toFixed(1)}%</span></div>
        <div class="result-cell"><strong>${number.format(data.oWins)}</strong><span>Победи O · ${(100 * data.oWins / total).toFixed(1)}%</span></div>
        <div class="result-cell"><strong>${number.format(data.draws)}</strong><span>Равенства · ${(100 * data.draws / total).toFixed(1)}%</span></div>
      </div>
      <p class="small-note">Средна продължителност: ${avgMoves.toFixed(2)} хода. X винаги започва пръв. Времето се измерва в текущия браузър и зависи от устройството и кеша.</p>
      ${table}`;
    $('downloadCsvBtn').hidden = false;
  }

  function runSimulation() {
    if (simulation) return;
    const x = $('algoX').value;
    const o = $('algoO').value;
    const count = Number($('gamesCount').value);
    if (!engine.LEVELS.includes(x) || !engine.LEVELS.includes(o) || ![100, 500, 1000].includes(count)) return;
    lastExperiment = null;
    engine.clearCaches(); // Всяка серия започва със студен кеш.
    $('downloadCsvBtn').hidden = true;
    $('runExperimentBtn').disabled = true;
    $('stopExperimentBtn').disabled = false;
    $('algoX').disabled = true;
    $('algoO').disabled = true;
    $('gamesCount').disabled = true;
    $('experimentResults').classList.remove('has-results');
    $('experimentResults').textContent = 'Изпълнява се автоматична симулация…';
    simulation = {
      x, o, count, completed: 0, cancelled: false, xWins: 0, oWins: 0, draws: 0, totalMoves: 0,
      stats: { X: { moves: 0, nodes: 0, cacheHits: 0, ms: 0 }, O: { moves: 0, nodes: 0, cacheHits: 0, ms: 0 } }
    };
    showSimulationProgress();

    const batch = () => {
      if (!simulation) return;
      for (let n = 0; n < 10 && simulation.completed < count && !simulation.cancelled; n++) {
        const result = engine.simulateGame(x, o);
        simulation.completed++;
        if (result.winner === 'X') simulation.xWins++;
        else if (result.winner === 'O') simulation.oWins++;
        else simulation.draws++;
        simulation.totalMoves += result.moves;
        for (const symbol of ['X', 'O']) {
          const stats = simulation.stats[symbol];
          for (const metric of ['moves', 'nodes', 'cacheHits', 'ms']) stats[metric] += result.stats[symbol][metric];
        }
      }
      showSimulationProgress();
      if (simulation.cancelled || simulation.completed === count) finishSimulation();
      else setTimeout(batch, 0);
    };
    setTimeout(batch, 0);
  }

  function exportCsv() {
    if (!lastExperiment) return;
    const s = lastExperiment;
    const rows = [
      ['Показател', 'Стойност'],
      ['Алгоритъм X', LABELS[s.x]], ['Алгоритъм O', LABELS[s.o]],
      ['Брой партии', s.completed], ['Победи X', s.xWins], ['Победи O', s.oWins], ['Равенства', s.draws],
      ['Среден брой ходове', (s.totalMoves / s.completed).toFixed(3)],
      ['Ходове X', s.stats.X.moves], ['Ходове O', s.stats.O.moves],
      ['Посетени възли X', s.stats.X.nodes], ['Посетени възли O', s.stats.O.nodes],
      ['Попадения в кеша X', s.stats.X.cacheHits], ['Попадения в кеша O', s.stats.O.cacheHits],
      ['Общо време X (ms)', s.stats.X.ms.toFixed(3)], ['Общо време O (ms)', s.stats.O.ms.toFixed(3)],
      ['Средно време X на ход (ms)', (s.stats.X.ms / s.stats.X.moves).toFixed(4)],
      ['Средно време O на ход (ms)', (s.stats.O.ms / s.stats.O.moves).toFixed(4)]
    ];
    const csv = '\ufeff' + rows.map(cols => cols.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `morski-shah-${s.x}-vs-${s.o}-${s.completed}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  createBoard();
  $('modeSelect').addEventListener('change', previewSettings);
  $('levelSelect').addEventListener('change', previewSettings);
  $('newGameBtn').addEventListener('click', startGame);
  $('applySettingsBtn').addEventListener('click', startGame);
  $('clearScoresBtn').addEventListener('click', () => {
    if (!window.confirm('Да изтрия ли всички запазени резултати от двата режима?')) return;
    scores = emptyScores();
    persistScores();
    showScores();
  });
  $('runExperimentBtn').addEventListener('click', runSimulation);
  $('stopExperimentBtn').addEventListener('click', () => { if (simulation) simulation.cancelled = true; });
  $('downloadCsvBtn').addEventListener('click', exportCsv);
  previewSettings();
  startGame();
})();
