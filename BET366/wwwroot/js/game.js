// ═══════════════════════════════════════════
// BET366 - LUXURY CASINO CLIENT
// ═══════════════════════════════════════════

let balance = 0, hasBet = false, sideBet = null, selectedSide = null;
let currentBetId = null, isOpening = false, lastPhase = 'betting', resultFetched = false;
let autoOpenTimeout = null, currentDisplayedXiu = 0, currentDisplayedTai = 0;
let currentGeneratedTransferCode = "";

// Drag-to-open logic
let isDragging = false, startY = 0, currentY = 0;
const BOWL_OPEN_THRESHOLD = 80;

// ─── SignalR Connection ──────────────────────
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/gamehub")
    .withAutomaticReconnect()
    .build();

connection.start().then(() => {
    console.log("🚀 SignalR Luxury connected");
    connection.invoke("JoinGame", document.getElementById('profileUsername')?.textContent?.trim() || "");
    loadInitialData();
}).catch(err => console.error("SignalR error:", err));

// ─── SignalR Event Handlers ──────────────────
connection.on("TimerUpdate", (data) => {
    const el = document.getElementById('countdown');
    const phaseEl = document.getElementById('phaseText');
    if (el) {
        el.textContent = data.timeLeft;
        if (data.phase === 'rolling') {
            el.classList.add('text-red-500', 'animate-pulse');
        } else {
            el.classList.toggle('text-red-500', data.timeLeft <= 5);
            el.classList.toggle('animate-pulse', data.timeLeft <= 5);
        }
    }
    if (phaseEl) {
        phaseEl.textContent = data.phase === 'betting' ? "Đang đặt cược" : "Đang mở thưởng";
        phaseEl.className = data.phase === 'betting' ? "text-[9px] text-zinc-500 uppercase font-bold tracking-[0.2em] mb-0.5" : "text-[9px] text-yellow-500 uppercase font-bold tracking-[0.2em] mb-0.5";
    }
    
    // Auto-open logic when TimeLeft <= 5 in rolling phase
    if (data.phase === 'rolling' && data.timeLeft <= 5) {
        finalizeOpen();
    }

    if (lastPhase === 'rolling' && data.phase === 'betting') resetGameUI();
    if (lastPhase === 'betting' && data.phase === 'rolling') {
        if (!isOpening) {
            isOpening = true;
            document.getElementById('mainPlate').classList.add('rolling-slow');
        }
    }
    lastPhase = data.phase;
});

connection.on("TotalBetsUpdate", (data) => { syncTotalBets(data.leftTotal, data.rightTotal); });

connection.on("GameResult", (data) => {
    const { dice, total, result } = data;
    dice.forEach((v, i) => {
        let rX = 0, rY = 0;
        if (v === 1) { rX = 0; rY = 0; } else if (v === 2) { rX = 0; rY = -90; } else if (v === 3) { rX = -90; rY = 0; }
        else if (v === 4) { rX = 90; rY = 0; } else if (v === 5) { rX = 0; rY = 90; } else if (v === 6) { rX = 0; rY = 180; }
        const diceEl = document.getElementById(`dice${i + 1}`);
        if (diceEl) {
            diceEl.style.transition = "transform 2.5s cubic-bezier(0.1, 0.7, 0.1, 1)";
            diceEl.style.transform = `rotateX(${rX + 1440}deg) rotateY(${rY + 1440}deg)`;
        }
    });
    document.getElementById('mainPlate').classList.remove('rolling-slow');
    // Immediately set dataset so it's ready if user drags early
    const resultEl = document.getElementById('result');
    if (resultEl) {
        const colorCls = result === 'tai' ? 'text-red-500' : 'text-blue-400';
        resultEl.dataset.content = `${result.toUpperCase()} ${total}`;
        resultEl.dataset.color = colorCls;
    }

    // Hint to drag
    setTimeout(() => {
        const bowl = document.getElementById('bowl');
        if (bowl && !bowl.classList.contains('open')) {
            bowl.classList.add('hint-drag');
            showToast("🎁 Kéo đĩa để xem kết quả!", "success");
        }
    }, 2500);
});

connection.on("BetResolved", (data) => {
    balance = data.balance;
    updateBalanceDisplay();
    // Logic moved to after bowl is opened
    window.lastBetResult = data;
});

connection.on("GameHistoryUpdate", (history) => { renderHistoryChart(history); });
connection.on("BalanceUpdate", (data) => { balance = data.balance; updateBalanceDisplay(); });
connection.on("DepositApproved", (data) => {
    balance = data.balance;
    updateBalanceDisplay();
    showToast(`💰 Nạp tiền +${data.amount.toLocaleString()}đ thành công!`);
});

connection.on("AccountLocked", () => {
    showToast("⚠️ TÀI KHOẢN BỊ KHÓA!", "error");
    setTimeout(() => window.location.href = '/Account/Login', 2000);
});

// ─── Drag Logic ──────────────────────────────
function initDrag() {
    const bowl = document.getElementById('bowl');
    if (!bowl) return;

    const startDrag = (e) => {
        if (bowl.classList.contains('open') || lastPhase !== 'rolling' || isOpening === false) return;
        isDragging = true;
        startY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
        bowl.style.transition = "none";
        bowl.classList.remove('hint-drag');
    };

    const onDrag = (e) => {
        if (!isDragging) return;
        currentY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
        let diff = startY - currentY;
        if (diff < 0) diff = 0; // Only pull up
        if (diff > 150) diff = 150;
        
        bowl.style.transform = `translateY(-${diff}px) rotateX(${-diff/4}deg)`;
        
        if (diff > BOWL_OPEN_THRESHOLD) {
            finalizeOpen();
        }
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        if (!bowl.classList.contains('open')) {
            bowl.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
            bowl.style.transform = "translateY(0)";
        }
    };

    bowl.addEventListener('mousedown', startDrag);
    bowl.addEventListener('touchstart', startDrag);
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
}

function finalizeOpen() {
    const bowl = document.getElementById('bowl');
    if (bowl.classList.contains('open')) return;
    isDragging = false;
    bowl.classList.add('open');
    bowl.style.transition = "all 0.8s ease-in-out";
    bowl.style.transform = "translateY(-110%) rotateX(-45deg) rotateZ(10deg)";
    bowl.style.opacity = "0";

    // Show result
    const resultEl = document.getElementById('result');
    if (resultEl && resultEl.dataset.content) {
        resultEl.innerHTML = `<div class="${resultEl.dataset.color} font-black text-3xl drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] animate-bounce">${resultEl.dataset.content}</div>`;
        
        if (window.lastBetResult) {
            const data = window.lastBetResult;
            setTimeout(() => {
                if (data.result === 'Thắng') {
                    resultEl.innerHTML += `<div class="text-green-400 font-bold mt-1 text-base">🎉 +${data.winAmount.toLocaleString()}đ</div>`;
                    showToast(`🎉 CHÚC MỪNG! +${data.winAmount.toLocaleString()}đ`, 'success');
                    triggerWinEffect();
                } else { resultEl.innerHTML += `<div class="text-zinc-600 font-bold mt-1 text-sm">HẸN BẠN PHIÊN SAU</div>`; }
                window.lastBetResult = null;
            }, 500);
        }
    }
}

// ─── UI Helpers ──────────────────────────────
async function loadInitialData() {
    try {
        const res = await fetch('/Game/GetState');
        const data = await res.json();
        if (data.success) {
            balance = data.balance;
            updateBalanceDisplay();
            if (data.currentUserBet) {
                hasBet = true;
                const sideEl = data.currentUserBet.side === 'left' ? 'placedBetXiu' : 'placedBetTai';
                const el = document.getElementById(sideEl);
                if (el) {
                    el.textContent = `${data.currentUserBet.amount.toLocaleString()}đ`;
                    el.classList.remove('hidden');
                }
            }
        }
    } catch (e) { console.error(e); }
    initDrag();
}

function syncTotalBets(serverLeft, serverRight) {
    const xiuEl = document.getElementById('totalXiu');
    const taiEl = document.getElementById('totalTai');
    if (xiuEl) animateNumber(xiuEl, currentDisplayedXiu, serverLeft, 800);
    if (taiEl) animateNumber(taiEl, currentDisplayedTai, serverRight, 800);
    currentDisplayedXiu = serverLeft;
    currentDisplayedTai = serverRight;
}

function renderHistoryChart(history) {
    const container = document.getElementById('gameHistoryChart');
    if (!container) return;
    container.innerHTML = history.slice(0, 16).map(res => {
        const isTai = res === 'tai';
        const color = isTai ? 'bg-red-500 shadow-[0_0_8px_rgba(231,76,60,0.6)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(52,152,219,0.6)]';
        return `<div class="w-2 h-2 rounded-full ${color}"></div>`;
    }).join('');
}

function toggleGame(id) {
    const el = document.getElementById(id + 'Game');
    if (!el) return;
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        el.classList.add('flex', 'animate-slideUp');
    } else {
        el.classList.add('hidden');
        el.classList.remove('flex', 'animate-slideUp');
    }
}

function resetGameUI() {
    if (autoOpenTimeout) { clearTimeout(autoOpenTimeout); autoOpenTimeout = null; }
    isOpening = false; hasBet = false; sideBet = null; selectedSide = null; currentBetId = null; resultFetched = false;
    const bowl = document.getElementById('bowl');
    if (bowl) { 
        bowl.classList.remove('open', 'hint-drag'); 
        bowl.style.transition = "transform 0.5s";
        bowl.style.transform = ""; 
        bowl.style.opacity = "1"; 
        currentDisplayedXiu = 0; 
        currentDisplayedTai = 0;
        document.getElementById('totalXiu').textContent = "0";
        document.getElementById('totalTai').textContent = "0";
        document.getElementById('placedBetXiu').classList.add('hidden');
        document.getElementById('placedBetTai').classList.add('hidden');
        document.getElementById('mainPlate').classList.remove('rolling-slow');
    }
    document.getElementById('btnLeft').classList.remove('active');
    document.getElementById('btnRight').classList.remove('active');
    document.getElementById('result').textContent = "";
    document.getElementById('result').dataset.content = "";
    ['dice1', 'dice2', 'dice3'].forEach(id => {
        const d = document.getElementById(id);
        d.style.transition = "transform 0.5s";
        d.style.transform = `rotateX(0deg) rotateY(0deg)`;
    });
    document.getElementById('playBtn').disabled = false;
    window.lastBetResult = null;
}

function clearBets() {
    hasBet = false;
    ['placedBetXiu', 'placedBetTai', 'placedBetXocDiaChan', 'placedBetXocDiaLe'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.textContent = '0đ'; }
    });
    ['nai', 'bau', 'ga', 'ca', 'cua', 'tom'].forEach(i => {
        const el = document.getElementById('placedBetBC-' + i);
        if (el) { el.classList.add('hidden'); el.textContent = '0đ'; }
    });
}

connection.on('TimerUpdate', (data) => {
    if (data.phase === 'betting' && lastPhase !== 'betting') {
        clearBets();
        document.getElementById('playBtn').disabled = false;
    }
    lastPhase = data.phase;
    updateTimerUI(data.timeLeft, data.phase);
});

function updateBalanceDisplay() {
    const el = document.getElementById('balance');
    if (el) animateNumber(el, parseInt(el.textContent.replace(/,/g, '')) || 0, balance, 800);
    const pb = document.getElementById('profileBalance');
    if (pb) pb.textContent = balance.toLocaleString();
}

function selectSide(side) {
    if (isOpening || hasBet || lastPhase !== 'betting') return;
    selectedSide = side;
    document.getElementById('btnLeft').classList.toggle('active', side === 'left');
    document.getElementById('btnRight').classList.toggle('active', side === 'right');
}

function addBetAmount(amount) {
    const input = document.getElementById('betAmount');
    input.value = (parseInt(input.value) || 0) + amount;
}

function setAllIn() { document.getElementById('betAmount').value = balance; }

async function placeBet() {
    if (isOpening || hasBet || lastPhase !== 'betting') return;
    const amount = parseInt(document.getElementById('betAmount').value);
    if (!selectedSide || isNaN(amount) || amount < 1000) { showToast("Chọn cửa & tiền cược!", "error"); return; }
    if (balance < amount) { showToast("Số dư không đủ!", "error"); return; }
    const btn = document.getElementById('playBtn');
    btn.disabled = true;
    try {
        const result = await connection.invoke("PlaceBet", selectedSide, amount);
        if (result.success) {
            hasBet = true; balance = result.balance;
            updateBalanceDisplay();
            const sideEl = selectedSide === 'left' ? 'placedBetXiu' : 'placedBetTai';
            const el = document.getElementById(sideEl);
            el.textContent = amount.toLocaleString() + 'đ';
            el.classList.remove('hidden');
            showToast("✅ Đã đặt cược!");
        } else { showToast(result.message || "Lỗi cược", "error"); btn.disabled = false; }
    } catch (e) { showToast("❌ Lỗi kết nối!", "error"); btn.disabled = false; }
}

// ─── Transaction Functions ───────────────────
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    if (id === 'historyModal') renderHistory();
    if (id === 'chartModal') renderCharts();
    if (id === 'profileModal') loadProfileData();
    if (id === 'depositModal') {
        document.getElementById('depositStep1').classList.remove('hidden');
        document.getElementById('depositStep2').classList.add('hidden');
    }
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function showTransferInfo() {
    const amount = document.getElementById('depositAmount').value;
    if (!amount || amount < 10000) { showToast("Tối thiểu 10,000đ", "error"); return; }
    document.getElementById('displayDepositAmount').textContent = parseInt(amount).toLocaleString() + "đ";

    const bankRes = await fetch('/Transaction/GetBankInfo');
    const bank = await bankRes.json();
    document.getElementById('dispBankName').textContent = bank.bankName;
    document.getElementById('dispBankAccount').textContent = bank.bankAccount;
    document.getElementById('dispBankHolder').textContent = bank.bankHolder;

    currentGeneratedTransferCode = "BET" + Math.random().toString(36).substring(2, 8).toUpperCase();
    document.getElementById('dispTransferMsg').textContent = currentGeneratedTransferCode;

    const qrUrl = `https://img.vietqr.io/image/${bank.bankCode}-${bank.bankAccount}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(currentGeneratedTransferCode)}&accountName=${encodeURIComponent(bank.bankHolder)}`;
    document.getElementById('qrCodeImg').src = qrUrl;

    document.getElementById('depositStep1').classList.add('hidden');
    document.getElementById('depositStep2').classList.remove('hidden');
}

async function confirmDeposit() {
    const amount = parseInt(document.getElementById('depositAmount').value);
    const senderName = document.getElementById('confirmSenderName').value.trim();
    if (!senderName) { showToast("Vui lòng nhập tên người chuyển!", "error"); return; }

    const res = await fetch('/Transaction/Deposit', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ amount, transferCode: currentGeneratedTransferCode, senderName }) 
    });
    const data = await res.json();
    if (data.success) { showToast(data.message); closeModal('depositModal'); }
    else { showToast(data.message, "error"); }
}

async function handleWithdraw() {
    const amt = parseInt(document.getElementById('withdrawAmount').value);
    const bankName = document.getElementById('withdrawBank').value;
    const accountNumber = document.getElementById('withdrawNumber').value;
    const accountHolder = document.getElementById('withdrawHolder').value;
    if (!amt || amt < 50000) { showToast("Tối thiểu 50k", "error"); return; }
    const res = await fetch('/Transaction/Withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amt, bankName, accountNumber, accountHolder }) });
    const data = await res.json();
    if (data.success) { balance = data.balance; updateBalanceDisplay(); closeModal('withdrawModal'); showToast("🚀 Đã gửi yêu cầu rút!"); }
    else { showToast(data.message, "error"); }
}

function switchHistoryTab(tab) {
    const activeCls = 'flex-1 py-3 text-[10px] font-black rounded-xl transition-all duration-300 bg-yellow-500 text-black shadow-lg shadow-yellow-500/20';
    const inactiveCls = 'flex-1 py-3 text-[10px] font-black rounded-xl transition-all duration-300 text-zinc-500 hover:text-white';
    document.getElementById('tabBet').className = tab === 'bet' ? activeCls : inactiveCls;
    document.getElementById('tabDeposit').className = tab === 'deposit' ? activeCls : inactiveCls;
    document.getElementById('tabWithdraw').className = tab === 'withdraw' ? activeCls : inactiveCls;
    document.getElementById('betHistoryList').classList.toggle('hidden', tab !== 'bet');
    document.getElementById('depositHistoryList').classList.toggle('hidden', tab !== 'deposit');
    document.getElementById('withdrawHistoryList').classList.toggle('hidden', tab !== 'withdraw');
}

async function renderHistory() {
    const [betRes, depRes, wdRes] = await Promise.all([fetch('/Game/GetBetHistory'), fetch('/Game/GetDepositHistory'), fetch('/Game/GetWithdrawHistory')]);
    const betData = await betRes.json();
    const depData = await depRes.json();
    const wdData = await wdRes.json();
    const bList = document.getElementById('betHistoryList');
    bList.innerHTML = betData.betHistory?.length ? '' : '<p class="text-center text-zinc-600 py-10 font-bold italic">Chưa có lịch sử cược</p>';
    (betData.betHistory || []).forEach(h => {
        const d = document.createElement('div');
        d.className = 'history-card p-4 flex justify-between items-center';
        const color = h.result === 'Thắng' ? 'text-green-400' : 'text-red-500';
        d.innerHTML = `<div><div class="font-black text-xs text-white uppercase">${h.side === 'left' ? 'XỈU' : 'TÀI'}</div><div class="text-[10px] text-zinc-500 font-bold">${new Date(h.time).toLocaleString()}</div></div><div class="text-right"><div class="font-black text-sm text-yellow-400">${h.amount.toLocaleString()}đ</div><div class="font-black text-[10px] uppercase ${color}">${h.result}</div></div>`;
        bList.appendChild(d);
    });
    const dList = document.getElementById('depositHistoryList');
    dList.innerHTML = depData.depositHistory?.length ? '' : '<p class="text-center text-zinc-600 py-10 font-bold italic">Chưa có lịch sử nạp</p>';
    (depData.depositHistory || []).forEach(h => {
        const d = document.createElement('div');
        d.className = 'history-card p-4 flex justify-between items-center';
        const statusColor = h.status === 'Success' ? 'text-green-400' : h.status === 'Bị hủy' ? 'text-zinc-500' : 'text-yellow-500';
        d.innerHTML = `<div><div class="font-black text-xs text-white uppercase">NẠP TIỀN</div><div class="text-[10px] text-zinc-500 font-bold">${new Date(h.time).toLocaleString()}</div></div><div class="text-right"><div class="font-black text-sm text-yellow-400">${h.amount.toLocaleString()}đ</div><div class="flex items-center justify-end gap-2"><span class="font-black text-[10px] uppercase ${statusColor}">${h.status}</span>${h.status === 'Pending' ? `<button onclick="cancelTx('deposit', ${h.id})" class="bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-[9px] font-black hover:bg-red-500 hover:text-white transition">HỦY</button>` : ''}</div></div>`;
        dList.appendChild(d);
    });
    const wList = document.getElementById('withdrawHistoryList');
    wList.innerHTML = wdData.withdrawHistory?.length ? '' : '<p class="text-center text-zinc-600 py-10 font-bold italic">Chưa có lịch sử rút</p>';
    (wdData.withdrawHistory || []).forEach(h => {
        const d = document.createElement('div');
        d.className = 'history-card p-4 flex justify-between items-center';
        const statusColor = h.status === 'Hoàn thành' ? 'text-green-400' : h.status === 'Bị hủy' ? 'text-zinc-500' : h.status === 'Bị từ chối' ? 'text-red-500' : h.status === 'Đang chuyển' ? 'text-blue-400' : 'text-yellow-400';
        d.innerHTML = `<div><div class="font-black text-xs text-white uppercase">RÚT TIỀN</div><div class="text-[10px] text-zinc-500 font-bold">${new Date(h.time).toLocaleString()}</div></div><div class="text-right"><div class="font-black text-sm text-yellow-400">${h.amount.toLocaleString()}đ</div><div class="flex items-center justify-end gap-2"><span class="font-black text-[10px] uppercase ${statusColor}">${h.status}</span>${h.status === 'Đang xử lý' ? `<button onclick="cancelTx('withdraw', ${h.id})" class="bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-[9px] font-black hover:bg-red-500 hover:text-white transition">HỦY</button>` : ''}</div></div>`;
        wList.appendChild(d);
    });
}

async function cancelTx(type, id) {
    if (!confirm("Bạn có chắc chắn muốn hủy yêu cầu này?")) return;
    const res = await fetch((type === 'deposit' ? '/Transaction/CancelDeposit' : '/Transaction/CancelWithdraw') + '?id=' + id, { method: 'POST' });
    const data = await res.json();
    if (data.success) { showToast(data.message); loadInitialData(); renderHistory(); }
    else { showToast(data.message, "error"); }
}

async function loadProfileData() {
    const res = await fetch('/Profile/Get');
    const data = await res.json();
    if (data.success) { document.getElementById('profileFullName').value = data.user.fullName || ""; document.getElementById('profilePhone').value = data.user.phone || ""; }
}

async function saveProfile() {
    const fullName = document.getElementById('profileFullName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    if (fullName.length < 2) { showToast("Họ tên quá ngắn!", "error"); return; }
    const res = await fetch('/Profile/Update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, phone }) });
    const data = await res.json();
    if (data.success) { showToast("✅ Thành công!"); closeModal('profileModal'); }
}

function triggerWinEffect() { confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#ffdf00', '#ffffff', '#ff3131'] }); }
function animateNumber(element, start, end, duration) {
    if (element._animId) cancelAnimationFrame(element._animId);
    let startTime = null;
    const step = (currentTime) => {
        if (!startTime) startTime = currentTime;
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const currentVal = Math.floor(progress * (end - start) + start);
        element.textContent = currentVal.toLocaleString();
        if (progress < 1) {
            element._animId = requestAnimationFrame(step);
        } else {
            element.textContent = end.toLocaleString();
            element._animId = null;
        }
    };
    element._animId = requestAnimationFrame(step);
}
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';
    t.classList.remove('hidden');
    t.classList.add('toast-active');
    setTimeout(() => { t.classList.add('hidden'); t.classList.remove('toast-active'); }, 3000);
}

function showMaintenance() {
    showToast("🛠️ Trò chơi đang bảo trì hoặc chưa ra mắt!", "error");
}

let sumChart = null, diceChart = null;
async function renderCharts() {
    const res = await fetch('/Game/GetDetailedHistory');
    const data = await res.json();
    if (!data.success || !data.history.length) return;

    const history = data.history;
    
    // Update summary header
    const last = history[history.length - 1];
    document.getElementById('latestCode').textContent = "#" + last.sessionCode;
    document.getElementById('latestResultText').textContent = `${last.result === 'tai' ? 'Tài' : 'Xỉu'} (${last.dice1}-${last.dice2}-${last.dice3})`;
    document.getElementById('latestResultText').className = `text-lg font-black italic uppercase ${last.result === 'tai' ? 'text-red-500' : 'text-blue-400'}`;

    const labels = history.map(s => s.sessionCode.slice(-3));
    const totals = history.map(s => s.total);
    const d1 = history.map(s => s.dice1);
    const d2 = history.map(s => s.dice2);
    const d3 = history.map(s => s.dice3);

    const chartConfig = (id, datasets, min, max) => ({
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min, max, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#666', font: { size: 9, weight: 'bold' } } },
                x: { grid: { display: false }, ticks: { color: '#666', font: { size: 8 } } }
            },
            plugins: { legend: { display: false } },
            elements: { line: { tension: 0.3, borderWidth: 2 }, point: { radius: 4, hoverRadius: 6 } }
        }
    });

    if (sumChart) sumChart.destroy();
    sumChart = new Chart(document.getElementById('sumChart'), chartConfig('sumChart', [{
        data: totals,
        borderColor: '#ffdf00',
        backgroundColor: '#ffdf00',
        pointBackgroundColor: history.map(s => s.result === 'tai' ? '#ef4444' : '#3b82f6'),
        pointBorderColor: '#fff',
        pointBorderWidth: 1
    }], 3, 18));

    if (diceChart) diceChart.destroy();
    diceChart = new Chart(document.getElementById('diceChart'), chartConfig('diceChart', [
        { data: d1, borderColor: '#a855f7', pointBackgroundColor: '#a855f7' },
        { data: d2, borderColor: '#eab308', pointBackgroundColor: '#eab308' },
        { data: d3, borderColor: '#10b981', pointBackgroundColor: '#10b981' }
    ], 1, 6));
}

// ─── Slot Game Logic ─────────────────────────
const SLOT_SYMBOLS = ['🍒', '💎', '🍀', '🔔', '💰', '⭐', '🍊', '7️⃣', '👺', '👑'];
let isSpinning = false;

connection.on('JackpotUpdate', (val) => {
    const el = document.getElementById('slotJackpot');
    if (el) animateNumber(el, parseInt(el.textContent.replace(/,/g, '')) || 0, val, 1000);
});

async function spinSlot() {
    if (isSpinning) return;
    const amount = parseInt(document.getElementById('slotBetAmount').value);
    if (balance < amount) { showToast('Số dư không đủ!', 'error'); return; }

    isSpinning = true;
    const btn = document.getElementById('spinBtn');
    btn.disabled = true;
    btn.textContent = 'ĐANG QUAY...';

    try {
        const result = await connection.invoke('SpinSlot', amount);
        if (result.success) {
            balance = result.balance;
            updateBalanceDisplay();
            await performSpinAnimation(result.grid);
            
            if (result.winAmount > 0) {
                showToast(result.isJackpot ? '🎰 NỔ HŨ KHỔNG LỒ!' : '🎉 BẠN ĐÃ THẮNG ' + result.winAmount.toLocaleString() + 'đ', 'success');
                if (result.isJackpot) confetti({ particleCount: 300, spread: 100, origin: { y: 0.5 } });
                else triggerWinEffect();
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối!', 'error');
    } finally {
        isSpinning = false;
        const btnReset = document.getElementById('spinBtn');
        btnReset.disabled = false;
        btnReset.textContent = 'QUAY NGAY';
    }
}

async function performSpinAnimation(finalGrid) {
    const reels = [document.getElementById('reel0'), document.getElementById('reel1'), document.getElementById('reel2')];
    
    const promises = reels.map((reel, i) => {
        return new Promise(resolve => {
            const strip = [];
            for(let s=0; s<30; s++) strip.push(SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
            
            strip[strip.length - 3] = SLOT_SYMBOLS[finalGrid[0][i]];
            strip[strip.length - 2] = SLOT_SYMBOLS[finalGrid[1][i]];
            strip[strip.length - 1] = SLOT_SYMBOLS[finalGrid[2][i]];

            reel.innerHTML = strip.map(s => `<div class='h-12 flex items-center justify-center text-3xl'>${s}</div>`).join('');
            reel.style.transition = 'none';
            reel.style.transform = 'translateY(0)';
            reel.offsetHeight;
            
            const travel = (strip.length - 3) * 48;
            reel.style.transition = `transform ${2 + i * 0.5}s cubic-bezier(0.45, 0.05, 0.55, 0.95)`;
            reel.style.transform = `translateY(-${travel}px)`;
            
            setTimeout(resolve, 2000 + i * 500);
        });
    });

    await Promise.all(promises);
}

// ─── Xóc Đĩa Logic ──────────────────────────
let selectedXocDiaSide = null;
function selectXocDiaSide(side) {
    selectedXocDiaSide = side;
    document.getElementById('btnXocDiaChan').classList.toggle('border-yellow-500', side === 'chan');
    document.getElementById('btnXocDiaChan').classList.toggle('bg-yellow-500/10', side === 'chan');
    document.getElementById('btnXocDiaLe').classList.toggle('border-yellow-500', side === 'le');
    document.getElementById('btnXocDiaLe').classList.toggle('bg-yellow-500/10', side === 'le');
}

async function playXocDia() {
    if (!selectedXocDiaSide) { showToast("Vui lòng chọn Chẵn hoặc Lẻ", "error"); return; }
    const amount = parseInt(document.getElementById('xocDiaBetAmount').value);
    if (balance < amount) { showToast("Số dư không đủ!", "error"); return; }

    const btn = document.getElementById('xocDiaSpinBtn');
    btn.disabled = true;
    btn.textContent = 'ĐANG XÓC...';

    try {
        const result = await connection.invoke('PlayXocDia', selectedXocDiaSide, amount);
        if (result.success) {
            // Update balance
            balance = result.balance;
            updateBalanceDisplay();

            // Update badge
            const badgeId = selectedXocDiaSide === 'chan' ? 'placedBetXocDiaChan' : 'placedBetXocDiaLe';
            const badge = document.getElementById(badgeId);
            badge.textContent = amount.toLocaleString() + 'đ';
            badge.classList.remove('hidden');
            
            // Shake Animation
            const bowl = document.getElementById('xocDiaBowl');
            const plate = document.getElementById('xocDiaPlate');
            bowl.style.transition = 'transform 0.1s';
            for(let i=0; i<15; i++) {
                const x = Math.random() * 10 - 5;
                const y = Math.random() * 10 - 5;
                plate.style.transform = `translate(${x}px, ${y}px)`;
                bowl.style.transform = `translate(${x}px, ${y}px)`;
                await new Promise(r => setTimeout(r, 50));
            }
            plate.style.transform = '';
            bowl.style.transform = '';

            // Update Coins result before opening
            const coinsHtml = result.coins.map(c => `<div class="w-8 h-8 rounded-full ${c === 1 ? 'bg-red-500' : 'bg-white'} shadow-lg"></div>`).join('');
            document.getElementById('xocDiaCoins').innerHTML = coinsHtml;

            showToast("Đã xóc xong! Hãy mở bát.", "success");
            if (result.winAmount > 0) {
                setTimeout(() => {
                    showToast(`🎉 CHÚC MỪNG! Bạn thắng ${(result.winAmount).toLocaleString()}đ`, "success");
                    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                }, 1500);
            }
        } else {
            showToast(result.message, "error");
        }
    } catch (e) {
        showToast("Lỗi kết nối!", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'XÓC ĐĨA & ĐẶT CƯỢC';
    }
}

// ─── Bầu Cua Logic ──────────────────────────
let selectedBauCuaChoice = null;
function selectBauCuaChoice(choice) {
    selectedBauCuaChoice = choice;
    const items = ['nai', 'bau', 'ga', 'ca', 'cua', 'tom'];
    items.forEach(i => {
        const el = document.getElementById('bc-' + i);
        el.classList.toggle('border-yellow-500', i === choice);
        el.classList.toggle('bg-yellow-500/10', i === choice);
    });
}

async function playBauCua() {
    if (!selectedBauCuaChoice) { showToast("Vui lòng chọn linh vật", "error"); return; }
    const amount = parseInt(document.getElementById('bauCuaBetAmount').value);
    if (balance < amount) { showToast("Số dư không đủ!", "error"); return; }

    const btn = document.getElementById('bauCuaSpinBtn');
    btn.disabled = true;
    btn.textContent = 'ĐANG LẮC...';

    try {
        const result = await connection.invoke('PlayBauCua', selectedBauCuaChoice, amount);
        if (result.success) {
            balance = result.balance;
            updateBalanceDisplay();

            // Update badge
            const badge = document.getElementById('placedBetBC-' + selectedBauCuaChoice);
            badge.textContent = amount.toLocaleString() + 'đ';
            badge.classList.remove('hidden');

            showToast("🎲 Đang lắc Bầu Cua...", "success");
            await new Promise(r => setTimeout(r, 1500));

            // Update Results
            const emojiMap = { nai: '🦌', bau: '🎃', ga: '🐓', ca: '🐟', cua: '🦀', tom: '🦐' };
            const resultsHtml = result.result.map(r => `<div class="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-3xl shadow-xl border border-white/5 animate-bounce">${emojiMap[r]}</div>`).join('');
            document.getElementById('bauCuaResults').innerHTML = resultsHtml;

            if (result.winAmount > 0) {
                showToast(`🎉 THẮNG LỚN! +${(result.winAmount).toLocaleString()}đ`, "success");
                confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
            } else {
                showToast("Rất tiếc, chúc bạn may mắn lần sau!", "error");
            }
        } else {
            showToast(result.message, "error");
        }
    } catch (e) {
        showToast("Lỗi kết nối!", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'LẮC & ĐẶT CƯỢC';
    }
}

// Update initDrag for multiple bowls
function initAllDrags() {
    ['bowl', 'xocDiaBowl'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let startX, startY;
        
        const start = (e) => {
            startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
            startY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
            el.style.transition = 'none';
        };
        
        const move = (e) => {
            if (!startX) return;
            const x = (e.type === 'mousemove' ? e.clientX : e.touches[0].clientX) - startX;
            const y = (e.type === 'mousemove' ? e.clientY : e.touches[0].clientY) - startY;
            el.style.transform = `translate(${x}px, ${y}px)`;
            if (y < -100 || Math.abs(x) > 100) el.style.opacity = "0.3";
        };
        
        const end = () => {
            if (startX) {
                el.style.transition = 'transform 0.5s';
                el.style.transform = '';
                el.style.opacity = '1';
                startX = null;
            }
        };
        
        el.addEventListener('mousedown', start);
        el.addEventListener('touchstart', start);
        window.addEventListener('mousemove', move);
        window.addEventListener('touchmove', move);
        window.addEventListener('mouseup', end);
        window.addEventListener('touchend', end);
    });
}

// Call initAllDrags on load
setTimeout(initAllDrags, 1000);


