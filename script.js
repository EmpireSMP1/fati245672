// ============================================
//  تنظیمات اولیه
// ============================================
const WINNING_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

// پیشوند اتاق‌ها تا تداخل پیش نیاد
const ROOM_PREFIX = 'dooz-x7k9-';

let peer = null;
let conn = null;
let isHost = false;
let mySymbol = null;      // 'X' یا 'O'
let currentPlayer = 'X';
let board = Array(9).fill('');
let gameActive = false;
let connected = false;
let scores = { X: 0, O: 0, draw: 0 };
let roomCode = null;

// عناصر DOM
const $ = id => document.getElementById(id);
const lobbyEl = $('lobby');
const gameAreaEl = $('gameArea');
const waitingEl = $('waiting');
const statusEl = $('status');
const boardEl = $('board');
const overlay = $('overlay');
const popupTitle = $('popupTitle');
const popupMessage = $('popupMessage');
const popupBtn = $('popupBtn');
const copyLinkBtn = $('copyLinkBtn');
const copyHint = $('copyHint');
const roomCodeDisplay = $('roomCodeDisplay');

// ============================================
//  ساخت اتاق (Host)
// ============================================
function createRoom() {
  // ساخت کد اتاق 6 رقمی تصادفی
  roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  isHost = true;
  mySymbol = 'X';

  const peerId = ROOM_PREFIX + roomCode;

  // اتصال به سرور PeerJS
  peer = new Peer(peerId, { debug: 1 });

  peer.on('open', () => {
    console.log('اتاق ساخته شد:', roomCode);
    // آپدیت URL با کد اتاق برای اشتراک‌گذاری
    window.history.replaceState(null, '', '?room=' + roomCode);
    roomCodeDisplay.textContent = roomCode;
    lobbyEl.querySelectorAll('button, input').forEach(el => el.disabled = true);
    waitingEl.classList.remove('hidden');
  });

  peer.on('connection', (connection) => {
    if (conn) {
      connection.close(); // فقط یک بازیکن
      return;
    }
    conn = connection;
    setupConnection();
  });

  peer.on('error', (err) => {
    console.error('خطای Peer:', err);
    if (err.type === 'unavailable-id') {
      alert('این کد اتاق قبلاً استفاده شده. دوباره تلاش کن.');
      resetToLobby();
    } else {
      alert('خطا در اتصال. اینترنتت رو چک کن.\n' + err.type);
    }
  });
}

// ============================================
//  ورود به اتاق (Guest)
// ============================================
function joinRoom(code) {
  code = code.trim().toUpperCase();
  if (code.length !== 6) {
    alert('کد اتاق باید ۶ کاراکتر باشه!');
    return;
  }

  isHost = false;
  mySymbol = 'O';
  roomCode = code;

  peer = new Peer({ debug: 1 });

  peer.on('open', () => {
    console.log('در حال اتصال به اتاق:', code);
    conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
    setupConnection();

    // اگر تا 8 ثانیه وصل نشد
    setTimeout(() => {
      if (!connected) {
        alert('اتاق پیدا نشد یا میزبان آنلاین نیست. کد رو چک کن.');
        resetToLobby();
      }
    }, 8000);
  });

  peer.on('error', (err) => {
    console.error('خطای اتصال:', err);
    if (!connected) {
      alert('اتصال ناموفق بود. کد اتاق رو چک کن یا دوباره تلاش کن.');
      resetToLobby();
    }
  });
}

// ============================================
//  راه‌اندازی اتصال (مشترک)
// ============================================
function setupConnection() {
  conn.on('open', () => {
    connected = true;
    console.log('متصل شد!');
    waitingEl.classList.add('hidden');
    lobbyEl.classList.add('hidden');
    gameAreaEl.classList.remove('hidden');
    startNewRound();
  });

  conn.on('data', (data) => {
    handleMessage(data);
  });

  conn.on('close', () => {
    connected = false;
    statusEl.textContent = '❌ دوستت از بازی خارج شد';
    gameActive = false;
  });

  conn.on('error', (err) => {
    console.error('خطای کانکشن:', err);
  });
}

// ============================================
//  مدیریت پیام‌های دریافتی
// ============================================
function handleMessage(data) {
  switch (data.type) {
    case 'move':
      applyMove(data.index, data.player);
      break;
    case 'new-round':
      board = Array(9).fill('');
      currentPlayer = 'X';
      gameActive = true;
      renderBoard();
      updateStatus();
      hidePopup();
      break;
    case 'reset-scores':
      scores = { X: 0, O: 0, draw: 0 };
      updateScores();
      break;
  }
}

// ============================================
//  شروع دور جدید
// ============================================
function startNewRound() {
  board = Array(9).fill('');
  currentPlayer = 'X';
  gameActive = true;
  renderBoard();
  updateStatus();
  hidePopup();
}

function renderBoard() {
  boardEl.innerHTML = '';
  board.forEach((val, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell' + (val ? ` taken ${val.toLowerCase()}` : '');
    cell.textContent = val;
    cell.dataset.index = i;
    cell.addEventListener('click', () => handleCellClick(i));
    boardEl.appendChild(cell);
  });
  updateActiveScoreCard();
}

// ============================================
//  کلیک روی خانه
// ============================================
function handleCellClick(index) {
  if (!gameActive || !connected) return;
  if (board[index] !== '') return;
  if (currentPlayer !== mySymbol) {
    statusEl.textContent = 'صبر کن، نوبت دوستته...';
    return;
  }

  // ارسال حرکت به دوستت
  conn.send({ type: 'move', index, player: mySymbol });
  applyMove(index, mySymbol);
}

// ============================================
//  اعمال حرکت روی صفحه
// ============================================
function applyMove(index, player) {
  if (board[index] !== '') return;
  board[index] = player;

  const cell = boardEl.children[index];
  cell.textContent = player;
  cell.classList.add('taken', 'pop', player.toLowerCase());
  setTimeout(() => cell.classList.remove('pop'), 300);

  // بررسی برنده
  const winCombo = checkWinner();
  if (winCombo) {
    gameActive = false;
    highlightWin(winCombo);
    scores[player]++;
    updateScores();
    const iWon = player === mySymbol;
    setTimeout(() => {
      showPopup(
        iWon ? '🎉 بردی!' : '😢 باختی!',
        iWon ? 'آفرین! حریفت رو بردی 😎' : 'دفعه بعد جبران کن!'
      );
    }, 500);
    return;
  }

  // مساوی
  if (board.every(c => c !== '')) {
    gameActive = false;
    scores.draw++;
    updateScores();
    setTimeout(() => showPopup('🤝 مساوی!', 'هیچ‌کدام نبردند!'), 500);
    return;
  }

  // تغییر نوبت
  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  updateStatus();
  updateActiveScoreCard();
}

// ============================================
//  ابزارهای کمکی
// ============================================
function checkWinner() {
  for (const [a,b,c] of WINNING_COMBOS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return [a,b,c];
    }
  }
  return null;
}

function highlightWin(combo) {
  combo.forEach(i => boardEl.children[i].classList.add('win'));
}

function updateStatus() {
  if (!connected) {
    statusEl.textContent = 'در حال اتصال...';
    return;
  }
  if (!gameActive) return;
  if (currentPlayer === mySymbol) {
    statusEl.textContent = '🟢 نوبت خودته';
    statusEl.style.color = '#4ecdc4';
  } else {
    statusEl.textContent = '⏳ نوبت دوستته';
    statusEl.style.color = '#ffd200';
  }
}

function updateScores() {
  $('scoreX').textContent = scores.X;
  $('scoreO').textContent = scores.O;
  $('scoreDraw').textContent = scores.draw;
}

function updateActiveScoreCard() {
  // X همیشه سمت راست (تو اگر هاست)، O سمت چپ
  const xIsMe = mySymbol === 'X';
  $('scoreXCard').querySelector('.label').textContent = xIsMe ? 'تو (X)' : 'دوستت (X)';
  $('scoreOCard').querySelector('.label').textContent = xIsMe ? 'دوستت (O)' : 'تو (O)';

  $('scoreXCard').classList.toggle('active', currentPlayer === 'X');
  $('scoreOCard').classList.toggle('active', currentPlayer === 'O');
}

function showPopup(title, message) {
  popupTitle.textContent = title;
  popupMessage.textContent = message;
  overlay.classList.add('show');
}

function hidePopup() {
  overlay.classList.remove('show');
}

// ============================================
//  بازگشت به لابی
// ============================================
function resetToLobby() {
  if (peer) peer.destroy();
  peer = null;
  conn = null;
  connected = false;
  roomCode = null;
  window.history.replaceState(null, '', window.location.pathname);
  waitingEl.classList.add('hidden');
  lobbyEl.classList.remove('hidden');
  gameAreaEl.classList.add('hidden');
  lobbyEl.querySelectorAll('button, input').forEach(el => el.disabled = false);
  $('joinCode').value = '';
}

// ============================================
//  کپی لینک دعوت
// ============================================
function copyInviteLink() {
  const link = window.location.origin + window.location.pathname + '?room=' + roomCode;
  navigator.clipboard.writeText(link).then(() => {
    copyHint.textContent = '✅ لینک کپی شد! برای دوستت بفرست.';
    setTimeout(() => copyHint.textContent = '', 3000);
  }).catch(() => {
    // fallback
    prompt('این لینک رو کپی کن:', link);
  });
}

// ============================================
//  رویدادها
// ============================================
$('createRoomBtn').addEventListener('click', createRoom);

$('joinRoomBtn').addEventListener('click', () => {
  joinRoom($('joinCode').value);
});

$('joinCode').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinRoom($('joinCode').value);
});

copyLinkBtn.addEventListener('click', copyInviteLink);

$('newRoundBtn').addEventListener('click', () => {
  if (!connected) return;
  startNewRound();
  conn.send({ type: 'new-round' });
});

popupBtn.addEventListener('click', () => {
  if (!connected) return;
  startNewRound();
  conn.send({ type: 'new-round' });
});

$('leaveBtn').addEventListener('click', () => {
  if (confirm('مطمئنی می‌خوای خارج شی؟')) {
    resetToLobby();
  }
});

$('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  $('themeToggle').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('dooz-theme', isLight ? 'light' : 'dark');
});

// ============================================
//  راه‌اندازی اولیه
// ============================================
(function init() {
  // تم ذخیره‌شده
  if (localStorage.getItem('dooz-theme') === 'light') {
    document.body.classList.add('light');
    $('themeToggle').textContent = '☀️';
  }

  // اگر لینک حاوی ?room=CODE بود، خودکار جوین شو
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get('room');
  if (roomFromUrl) {
    $('joinCode').value = roomFromUrl.toUpperCase();
    // کمی تاخیر تا صفحه لود شه
    setTimeout(() => joinRoom(roomFromUrl), 300);
  }
})();
