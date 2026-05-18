// ═══════════════════════════════════════════
// BET366 - LUXURY CASINO CLIENT
// ═══════════════════════════════════════════
// Mặc định bật chế độ mở bát thủ công
let balance = 0, sideBet = null, selectedSide = null;
let hasBetTX = false, hasBetXD = false, hasBetBC = false, isManualOpenEnabled = true;
let currentBetId = null, isOpening = false, lastPhase = 'betting', resultFetched = false;
let lastXDPhase = 'betting', lastBCPhase = 'betting';
let autoOpenTimeout = null, currentDisplayedXiu = 0, currentDisplayedTai = 0;
let selectedXocDiaSide = null;
let currentGeneratedTransferCode = "";
let lastTXResult = null, lastXDResult = null;
let sumChart = null, diceChart = null;
window.pendingTX = null, window.pendingXD = null, window.pendingBC = null;

// Drag-to-open logic
let isDragging = false, startY = 0, currentY = 0;
const BOWL_OPEN_THRESHOLD = 80;

// ─── SignalR Connection ──────────────────────
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/gameHub")
    .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
    .build();

async function startConnection() {
    try {
        if (connection.state !== signalR.HubConnectionState.Disconnected) return;

        await connection.start();
        console.log("SignalR Connected.");
        connection.invoke("JoinGame").catch(err => console.error("JoinGame error:", err));
        loadInitialData();
        updateBalanceDisplay();
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
        setTimeout(startConnection, 5000);
    }
}

connection.onreconnecting(error => {
    showToast("⚠️ Mất kết nối, đang thử lại...", "warning");
});

connection.onreconnected(connectionId => {
    showToast("✅ Đã kết nối lại!", "success");
});

startConnection();

// ─── SignalR Event Handlers ──────────────────
connection.on("TimerUpdate", (data) => {
    if (data.phase === 'betting' && lastPhase !== 'betting') {
        resetTaiXiuUI();
        if (document.getElementById('playBtn')) document.getElementById('playBtn').disabled = false;
    }
    if (data.phase === 'rolling' && lastPhase !== 'rolling') {
        vibrate([100, 50, 100]); // Rung điện thoại khi bắt đầu lắc
        const cdContainer = document.getElementById('countdownContainer');
        const dContainer = document.getElementById('diceContainer');
        if (cdContainer) cdContainer.style.opacity = '0';
        if (dContainer) {
            dContainer.style.opacity = '1';
            dContainer.style.pointerEvents = 'auto';
        }
    }

    lastPhase = data.phase;
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

    // Hiệu ứng LED cho nút cược Tài Xỉu khi đang mở thưởng
    toggleLEDEffect(['btnLeft', 'btnRight'], data.phase === 'rolling');

    // Hiệu ứng rung lắc bàn chơi Tài Xỉu
    toggleTableShake('mainPlate', data.phase === 'rolling');

    if (phaseEl) {
        phaseEl.textContent = data.phase === 'betting' ? "Đang đặt cược" : "Đang mở thưởng";
        phaseEl.className = data.phase === 'betting' ? "text-[9px] text-zinc-500 uppercase font-bold tracking-[0.2em] mb-0.5" : "text-[9px] text-yellow-500 uppercase font-bold tracking-[0.2em] mb-0.5";
    }
});

connection.on("XocDiaTimerUpdate", (data) => {
    if (data.phase === 'betting' && lastXDPhase !== 'betting') {
        clearXocDiaBets();
        resetXocDiaBowl();
    }
    lastXDPhase = data.phase;
    const el = document.getElementById('xocDiaCountdown');
    if (el) el.textContent = data.timeLeft;

    // Hiệu ứng LED cho nút cược Xóc Đĩa
    toggleLEDEffect(['btnXocDiaChan', 'btnXocDiaLe'], data.phase === 'rolling');

    // Hiệu ứng rung lắc bàn chơi Xóc Đĩa
    toggleTableShake('xocDiaGame', data.phase === 'rolling');

    const pEl = document.getElementById('xocDiaPhaseText');
    if (pEl) pEl.textContent = data.phase === 'betting' ? 'Đang đặt cược' : 'Đang xóc đĩa...';
});

connection.on("BauCuaTimerUpdate", (data) => {
    if (data.phase === 'betting' && lastBCPhase !== 'betting') {
        clearBauCuaBets();
    }
    lastBCPhase = data.phase;
    const el = document.getElementById('bauCuaCountdown');
    if (el) el.textContent = data.timeLeft;

    // Hiệu ứng LED cho các linh vật Bầu Cua
    const bcItems = ['bc-nai', 'bc-bau', 'bc-ga', 'bc-ca', 'bc-cua', 'bc-tom'];
    toggleLEDEffect(bcItems, data.phase === 'rolling');

    // Hiệu ứng rung lắc bàn chơi Bầu Cua
    toggleTableShake('bauCuaGame', data.phase === 'rolling');

    // Tự động làm mới giao diện Bầu Cua khi bắt đầu ván mới
    if (data.phase === 'betting' && lastBCPhase !== 'betting') {
        const resEl = document.getElementById('bauCuaResults');
        if (resEl) resEl.innerHTML = '';
    }

    const pEl = document.getElementById('bauCuaPhaseText');
    if (pEl) pEl.textContent = data.phase === 'betting' ? 'Đang đặt cược' : 'Đang lắc bầu cua...';
});

connection.on("XocDiaResult", async (data) => {
    lastXDResult = data.result;
    const coinsHtml = data.coins.map(c => `<div class="w-6 h-6 sm:w-8 sm:h-8 rounded-full ${c === 1 ? 'bg-red-500' : 'bg-white'} shadow-lg"></div>`).join('');
    const resEl = document.getElementById('xocDiaCoins');
    if (resEl) resEl.innerHTML = coinsHtml;
    // NẾU TẮT NẶN BÁT THỦ CÔNG -> TỰ ĐỘNG MỞ BÁT XÓC ĐĨA
    if (!isManualOpenEnabled) setTimeout(finalizeXocDiaOpen, 1000);
});

connection.on("BauCuaResult", async (data) => {
    const emojiMap = { nai: '🦌', bau: '🎃', ga: '🐓', ca: '🐟', cua: '🦀', tom: '🦐' };
    const resultsHtml = data.result.map(r => `<div class="w-12 h-12 sm:w-16 sm:h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-xl border border-white/5 animate-bounce">${emojiMap[r]}</div>`).join('');
    const resEl = document.getElementById('bauCuaResults');
    if (resEl) resEl.innerHTML = resultsHtml;

    // Nhảy đèn các linh vật thắng
    data.result.forEach(r => {
        document.getElementById('bc-' + r)?.classList.add('led-win');
    });

    // Chỉ hiện thông báo thắng nếu người chơi THỰC SỰ có đặt cược Bầu Cua
    if (hasBetBC && window.pendingBC) {
        const res = window.pendingBC;
        if (res.winAmount > 0) {
            showToast(`🎉 Bầu Cua Thắng: +${res.winAmount.toLocaleString()}đ`, "success");
            triggerWinEffect();
        } else { showToast("Rất tiếc, Bầu Cua không trúng rồi!", "error"); }
        window.pendingBC = null;
    }
});

connection.on("TotalBetsUpdate", (data) => { syncTotalBets(data.leftTotal, data.rightTotal); });

connection.on("GameResult", (data) => {
    const { dice, total, result } = data;
    lastTXResult = result;
    // Logic xoay chuẩn xác: Đưa mặt mong muốn về phía trước (Z=20px)
    dice.forEach((v, i) => {
        let rX = 0, rY = 0;
        if (v === 1) { rX = 0; rY = 0; }            // Mặt 1
        else if (v === 2) { rX = 0; rY = -90; }      // Mặt 2 (Phải) -> xoay trái 90
        else if (v === 3) { rX = 90; rY = 0; }       // Mặt 3 (Trên) -> xoay xuống 90
        else if (v === 4) { rX = -90; rY = 0; }      // Mặt 4 (Dưới) -> xoay lên 90
        else if (v === 5) { rX = 0; rY = 90; }       // Mặt 5 (Trái) -> xoay phải 90
        else if (v === 6) { rX = 0; rY = 180; }      // Mặt 6 (Sau) -> xoay 180

        const diceEl = document.getElementById(`dice${i + 1}`);
        if (diceEl) {
            diceEl.style.transition = "transform 3s cubic-bezier(0.15, 0.85, 0.35, 1.2)";
            diceEl.style.transform = `rotateX(${rX + 1800}deg) rotateY(${rY + 1800}deg)`;
        }
    });

    const plate = document.getElementById('mainPlate');
    if (plate) {
        plate.classList.remove('rolling-slow', 'table-shake');
        plate.style.opacity = "1"; // Đảm bảo đĩa và xúc xắc luôn hiện
    }

    // Immediately set dataset so it's ready if user drags early
    const resultEl = document.getElementById('result');
    if (resultEl) {
        const colorCls = result === 'tai' ? 'text-red-500' : 'text-blue-400';
        resultEl.dataset.content = `${result.toUpperCase()} ${total}`;
        resultEl.dataset.color = colorCls;
    }

    // TỰ ĐỘNG MỞ BÁT: Sau khi xúc xắc quay xong (2.5s) + 0.5s chờ
    if (!isOpening && !isManualOpenEnabled) setTimeout(finalizeOpen, 3500); // Tự động mở bát nếu chế độ thủ công TẮT
});

connection.on("GameHistoryUpdate", (history) => {
    window.pendingHistoryData = history;
    if (isOpening || lastPhase === 'betting') {
        renderHistoryChart(history);
        window.pendingHistoryData = null;
    }
});
connection.on("XocDiaHistoryUpdate", (history) => { renderXocDiaHistory(history); });
connection.on("BauCuaHistoryUpdate", (history) => { renderBauCuaHistory(history); });
connection.on("BalanceUpdate", (data) => { balance = data.balance; updateBalanceDisplay(); });
connection.on("OnlineCountUpdate", (count) => { const el = document.getElementById('onlineCount'); if (el) el.textContent = count; });

connection.on("BetResolved", (data) => {
    balance = data.balance;
    updateBalanceDisplay();

    // Phân loại kết quả dựa trên việc người chơi đang cược game nào
    if (hasBetTX) window.pendingTX = data;
    if (hasBetXD) window.pendingXD = data;
    if (hasBetBC) window.pendingBC = data;
});

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
// Global variables for drag handlers to allow removal
let handleMouseDown = null;
let handleMouseMove = null;
let handleMouseUp = null;
let handleTouchStart = null;
let handleTouchMove = null;
let handleTouchEnd = null;

function initDrag() {
    const bowl = document.getElementById('bowl');
    if (!bowl) return;

    // Remove existing listeners to prevent duplicates
    if (handleMouseDown) bowl.removeEventListener('mousedown', handleMouseDown);
    if (handleTouchStart) bowl.removeEventListener('touchstart', handleTouchStart);
    if (handleMouseMove) window.removeEventListener('mousemove', handleMouseMove);
    if (handleTouchMove) window.removeEventListener('touchmove', handleTouchMove);
    if (handleMouseUp) window.removeEventListener('mouseup', handleMouseUp);
    if (handleTouchEnd) window.removeEventListener('touchend', handleTouchEnd);

    // Reset handlers
    handleMouseDown = null;
    handleMouseMove = null;
    handleMouseUp = null;
    handleTouchStart = null;
    handleTouchMove = null;
    handleTouchEnd = null;

    if (!isManualOpenEnabled) {
        // If manual open is disabled, ensure no drag styles and exit
        bowl.style.cursor = 'default';
        bowl.classList.remove('hint-drag');
        return;
    }

    // If manual open is enabled, add drag styles and listeners
    bowl.style.cursor = 'grab';
    bowl.classList.add('hint-drag');

    handleMouseDown = (e) => {
        if (isOpening || lastPhase === 'betting' || bowl.classList.contains('open')) return;
        isDragging = true;
        startY = e.clientY;
        currentY = startY; // Khởi tạo currentY
        bowl.style.transition = 'none';
    };

    handleTouchStart = (e) => {
        if (isOpening || lastPhase === 'betting' || bowl.classList.contains('open')) return;
        isDragging = true;
        startY = e.touches[0].clientY;
        currentY = startY; // Khởi tạo currentY
        bowl.style.transition = 'none';
    };

    handleMouseMove = (e) => {
        if (!isDragging) return;
        currentY = e.clientY;
        const diff = startY - currentY;
        if (diff > 0) {
            bowl.style.transform = `translateY(-${Math.min(diff, 150)}px) rotate(-${Math.min(diff / 5, 20)}deg)`;
            if (diff > BOWL_OPEN_THRESHOLD) finalizeOpen();
        }
    };

    handleTouchMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diff = startY - currentY;
        if (diff > 0) {
            if (e.cancelable) e.preventDefault(); // Ngăn cuộn trang khi đang nặn
            bowl.style.transform = `translateY(-${Math.min(diff, 150)}px) rotate(-${Math.min(diff / 5, 20)}deg)`;
            if (diff > BOWL_OPEN_THRESHOLD) finalizeOpen();
        }
    };

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = startY - currentY;
        if (!bowl.classList.contains('open')) {
            if (diff <= 5) {
                // Nếu chỉ click/tap (khoảng cách kéo <= 5px) -> Lật mở bát luôn!
                finalizeOpen();
            } else {
                // Hiệu ứng đàn hồi quay về vị trí cũ nếu chưa kéo đủ ngưỡng
                bowl.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
                bowl.style.transform = "";
            }
        }
    };

    handleMouseUp = stopDrag;
    handleTouchEnd = stopDrag;

    bowl.addEventListener('mousedown', handleMouseDown);
    bowl.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleTouchEnd);
}

function finalizeOpen() {
    const bowl = document.getElementById('bowl');
    if (!bowl || bowl.classList.contains('open')) return;

    isOpening = true;
    isDragging = false;
    bowl.classList.add('open');
    bowl.style.transition = "all 1.2s cubic-bezier(0.23, 1, 0.32, 1)";
    bowl.style.transform = window.innerWidth < 640 ? "translate(-60px, -120px) rotate(-35deg)" : "translate(-120px, -180px) rotate(-35deg)";
    bowl.style.opacity = "0";

    // Nhảy đèn bên thắng
    const winBtnId = lastTXResult === 'tai' ? 'btnRight' : 'btnLeft';
    document.getElementById(winBtnId)?.classList.add('led-win');

    // Cập nhật bảng soi cầu và biểu đồ CHỈ KHI BÁT ĐÃ MỞ
    if (window.pendingHistoryData) {
        renderHistoryChart(window.pendingHistoryData);
        window.pendingHistoryData = null;
    }
    renderCharts();

    // Show result
    const resultEl = document.getElementById('result');
    if (resultEl) {
        const content = resultEl.dataset.content || "";
        const color = resultEl.dataset.color || "text-white";
        if (content) {
            resultEl.innerHTML = `<div class="${color} font-black text-3xl drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] animate-bounce">${content}</div>`;
        }

        if (hasBetTX && window.pendingTX) {
            const data = window.pendingTX;
            setTimeout(() => {
                if (data.winAmount > 0) {
                    resultEl.innerHTML += `<div class="text-green-400 font-bold mt-1 text-base">🎉 +${data.winAmount.toLocaleString()}đ</div>`;
                    showToast(`🎉 CHÚC MỪNG! +${data.winAmount.toLocaleString()}đ`, 'success');
                    triggerWinEffect();
                } else {
                    resultEl.innerHTML += `<div class="text-zinc-600 font-bold mt-1 text-sm">HẸN BẠN PHIÊN SAU</div>`;
                    showToast("Rất tiếc, chúc bạn may mắn lần sau!", "error");
                }
                window.pendingTX = null;
            }, 500);
        }
    }
}

// ─── BẢO MẬT: CHỐNG F12 VÀ CHUỘT PHẢI ──────────────────────
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    // Chặn F12
    if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
    }
    // Chặn Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        return false;
    }
    // Chặn Ctrl+U
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        return false;
    }
});

// ─── UI Helpers ──────────────────────────────
async function loadInitialData() {
    try {
        const res = await fetch('/Game/GetState');
        const data = await res.json();
        if (data.success) {
            balance = data.balance;
            updateBalanceDisplay();
            if (data.currentUserBet) {
                hasBetTX = true;
                const sideEl = data.currentUserBet.side === 'left' ? 'placedBetXiu' : 'placedBetTai';
                const el = document.getElementById(sideEl);
                if (el) {
                    el.textContent = `${data.currentUserBet.amount.toLocaleString()}đ`;
                    el.classList.remove('hidden');
                }
            }
        }
    } catch (e) { console.error(e); }
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
    if (!container || !history) return;
    // Lấy 20 phiên gần nhất (cùng chiều với bảng soi cầu: cũ bên trái, mới bên phải)
    container.innerHTML = history.slice(-20).map(res => {
        const isTai = res === 'tai';
        const color = isTai ? 'bg-red-500' : 'bg-white';
        return `<div class="w-3 h-3 rounded-full ${color} shadow-sm border border-black/20"></div>`;
    }).join('');
}

function renderXocDiaHistory(history) {
    const container = document.getElementById('xocDiaHistory');
    if (!container || !history) return;
    // Lấy 16 phiên gần nhất (cũ bên trái, mới bên phải)
    container.innerHTML = history.slice(-16).map(res => {
        const color = res === 'chan' ? 'bg-red-500' : 'bg-zinc-900 border border-white/40';
        return `<div class="w-3 h-3 rounded-full ${color} shadow-sm"></div>`;
    }).join('');
}

function renderBauCuaHistory(history) {
    const container = document.getElementById('bauCuaHistory');
    if (!container || !history) return;
    const emojiMap = { nai: '🦌', bau: '🎃', ga: '🐓', ca: '🐟', cua: '🦀', tom: '🦐' };
    // Lấy 16 phiên gần nhất (cũ bên trái, mới bên phải)
    container.innerHTML = history.slice(-16).map(res => {
        return `<div class="w-6 h-6 bg-zinc-800 rounded-md flex items-center justify-center text-xs border border-white/5">${emojiMap[res[0]]}</div>`;
    }).join('');
}

function toggleGame(id) {
    if (!id) return;
    const gameIds = ['taiXiuGame', 'xocDiaGame', 'bauCuaGame', 'slotGame'];
    const normalizedTarget = id.toLowerCase().replace('game', '') + 'game';

    gameIds.forEach(gid => {
        const el = document.getElementById(gid);
        if (!el) return;

        if (gid.toLowerCase() === normalizedTarget) {
            if (el.classList.contains('hidden')) {
                el.classList.remove('hidden');
                el.classList.add('flex', 'animate-slideUp');
            } else {
                el.classList.add('hidden');
                el.classList.remove('flex');
            }
        } else {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }
    });
}

function resetTaiXiuUI() {
    if (autoOpenTimeout) { clearTimeout(autoOpenTimeout); autoOpenTimeout = null; }
    isOpening = false; hasBetTX = false; sideBet = null; currentBetId = null; resultFetched = false;
    clearTaiXiuBets();
    const bowl = document.getElementById('bowl'); // Lấy lại bowl để đảm bảo cập nhật trạng thái
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
        document.getElementById('btnLeft').classList.remove('led-win');
        document.getElementById('btnRight').classList.remove('led-win');
        document.getElementById('mainPlate').classList.remove('rolling-slow');
    }
    document.getElementById('btnLeft').classList.remove('active');
    document.getElementById('btnRight').classList.remove('active');
    document.getElementById('result').textContent = "";
    document.getElementById('result').dataset.content = "";
    document.getElementById('result').innerHTML = "";

    const cdContainer = document.getElementById('countdownContainer');
    const dContainer = document.getElementById('diceContainer');
    if (cdContainer) cdContainer.style.opacity = '1';
    if (dContainer) {
        dContainer.style.opacity = '0';
        dContainer.style.pointerEvents = 'none';
    }

    ['dice1', 'dice2', 'dice3'].forEach(id => {
        const d = document.getElementById(id);
        d.style.transition = "transform 0.5s";
        d.style.transform = `rotateX(0deg) rotateY(0deg)`;
    });
    document.getElementById('playBtn').disabled = false;
    window.pendingTX = null;
    initDrag(); // Gọi lại initDrag để cập nhật trạng thái kéo/thả của bát
}

function clearTaiXiuBets() {
    hasBetTX = false;
    ['placedBetXiu', 'placedBetTai'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.textContent = '0đ'; }
    });
}

function clearXocDiaBets() {
    hasBetXD = false;
    ['placedBetXocDiaChan', 'placedBetXocDiaLe'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.textContent = '0đ'; }
    });
    document.getElementById('btnXocDiaChan')?.classList.remove('led-win');
    document.getElementById('btnXocDiaLe')?.classList.remove('led-win');
}

function clearBauCuaBets() {
    hasBetBC = false;
    ['nai', 'bau', 'ga', 'ca', 'cua', 'tom'].forEach(i => {
        const el = document.getElementById('placedBetBC-' + i);
        if (el) { el.classList.add('hidden'); el.textContent = '0đ'; }
        document.getElementById('bc-' + i)?.classList.remove('led-win');
    });
}

function resetXocDiaBowl() {
    const bowl = document.getElementById('xocDiaBowl');
    if (bowl) {
        bowl.style.display = 'block';
        bowl.style.transition = 'none';
        bowl.style.transform = '';
        bowl.style.opacity = '1';
    }
    window.pendingXD = null;
}

function updateBalanceDisplay() {
    const el = document.getElementById('balance');
    if (el) animateNumber(el, parseInt(el.textContent.replace(/,/g, '')) || 0, balance, 800);
    const pb = document.getElementById('profileBalance');
    if (pb) pb.textContent = balance.toLocaleString() + 'đ';
    document.querySelectorAll('.mini-balance').forEach(b => {
        b.textContent = balance.toLocaleString() + 'đ';
    });
}

function selectSide(side) {
    if (isOpening || hasBetTX || lastPhase !== 'betting') return;
    selectedSide = side;
    vibrate(10);
    document.getElementById('btnLeft').classList.toggle('active', side === 'left');
    document.getElementById('btnRight').classList.toggle('active', side === 'right');

    const panel = document.getElementById('quickBetPanel');
    const title = document.getElementById('quickBetTitle');
    if (panel && title) {
        title.textContent = `ĐẶT CƯỢC ${side === 'left' ? 'XỈU' : 'TÀI'}`;
        panel.classList.remove('hidden'); panel.classList.add('flex');
    }
}

function closeQuickBet() {
    const panel = document.getElementById('quickBetPanel');
    if (panel) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
}

function addBetAmount(amount) {
    const input = document.getElementById('betAmount');
    input.value = (parseInt(input.value) || 0) + amount;
}

function setAllIn() { document.getElementById('betAmount').value = balance; }

async function placeBet() {
    if (isOpening || hasBetTX || lastPhase !== 'betting') return;
    const amount = parseInt(document.getElementById('betAmount').value);
    if (!selectedSide || isNaN(amount) || amount < 1000) { showToast("Chọn cửa & tiền cược!", "error"); return; }
    if (balance < amount) { showToast("Số dư không đủ!", "error"); return; }
    const btn = document.getElementById('playBtn');
    if (btn) btn.disabled = true;
    try {
        if (connection.state !== "Connected") {
            vibrate([50, 50, 50]); showToast("❌ Mất kết nối server!", "error");
            if (btn) btn.disabled = false; return;
        }
        const result = await connection.invoke("PlaceBet", selectedSide, amount);
        if (result.success) {
            hasBetTX = true; balance = result.balance;
            vibrate(30); updateBalanceDisplay();
            const sideEl = selectedSide === 'left' ? 'placedBetXiu' : 'placedBetTai';
            const el = document.getElementById(sideEl);
            if (el) {
                let current = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
                el.textContent = (current + amount).toLocaleString() + 'đ';
                el.classList.remove('hidden');
            }
            closeQuickBet();
            showToast("✅ Đã đặt cược!");
        } else { showToast(result.message || "Lỗi cược", "error"); if (btn) btn.disabled = false; }
    } catch (e) {
        console.error("PlaceBet error:", e); vibrate([50, 50, 50]);
        showToast("❌ Lỗi kết nối!", "error"); if (btn) btn.disabled = false;
    }
}

// ─── Transaction Functions ───────────────────
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    if (id === 'historyModal') renderHistory();
    if (id === 'chartModal') setTimeout(renderCharts, 150);
    if (id === 'profileModal') loadProfileData();
    if (id === 'depositModal') {
        const s1 = document.getElementById('depositStep1');
        const s2 = document.getElementById('depositStep2');
        if (s1) s1.classList.remove('hidden');
        if (s2) s2.classList.add('hidden');
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

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

/**
 * Toggle hiệu ứng LED chạy viền quanh phần tử
 */
function toggleLEDEffect(selectors, active) {
    selectors.forEach(sel => {
        const el = document.getElementById(sel);
        if (el) {
            if (active) el.classList.add('led-waiting');
            else el.classList.remove('led-waiting');
        }
    });
}

/**
 * Toggle hiệu ứng rung lắc (Vibration) cho bàn chơi
 */
function toggleTableShake(id, active) {
    const el = document.getElementById(id);
    if (!el) return;
    if (active) {
        el.classList.add('table-shake');
    } else {
        el.classList.remove('table-shake');
    }
}

/**
 * Haptic Feedback cho thiết bị di động (Rung nhẹ khi tương tác)
 */
function vibrate(pattern = 20) {
    if ("vibrate" in navigator) {
        navigator.vibrate(pattern);
    }
}

function showMaintenance() {
    showToast("🛠️ Trò chơi đang bảo trì hoặc chưa ra mắt!", "error");
}

async function renderCharts() {
    try {
        const res = await fetch('/Game/GetDetailedHistory');
        const data = await res.json();
        if (!data || !data.success || !data.history || !data.history.length) return;

        const history = data.history;
        const last = history[history.length - 1];

        if (document.getElementById('latestCode')) document.getElementById('latestCode').textContent = "#" + (last.sessionCode || "000000");
        if (document.getElementById('latestResultText')) {
            document.getElementById('latestResultText').textContent = `${last.result === 'tai' ? 'Tài' : 'Xỉu'} (${last.dice1}-${last.dice2}-${last.dice3})`;
            document.getElementById('latestResultText').className = `text-lg font-black italic uppercase ${last.result === 'tai' ? 'text-red-500' : 'text-blue-400'}`;
        }

        // ─── Render Bảng Soi Cầu Bệt (Big Road) ───
        const bigRoadEl = document.getElementById('bigRoadChart');
        if (bigRoadEl) {
            let columns = [];
            let currentCol = [];
            let currentResult = null;

            history.forEach(item => {
                if (!item || !item.result) return;
                if (currentResult === null) {
                    currentResult = item.result;
                    currentCol.push(item);
                } else if (item.result === currentResult) {
                    if (currentCol.length < 5) { // 5 dòng mỗi cột
                        currentCol.push(item);
                    } else {
                        columns.push(currentCol);
                        currentCol = [item];
                    }
                } else {
                    columns.push(currentCol);
                    currentCol = [item];
                    currentResult = item.result;
                }
            });
            if (currentCol.length > 0) {
                columns.push(currentCol);
            }

            // Nếu ít hơn 22 cột, thêm cột trống vào cuối để ván chơi mọc dần từ trái sang phải
            while (columns.length < 22) {
                columns.push([]);
            }

            // Nếu vượt quá 22 cột (đầy bảng), cắt bỏ cột cũ nhất ở đầu (xóa cái đầu, thêm cái cuối)
            if (columns.length > 22) {
                columns = columns.slice(-22);
            }

            // Render HTML
            bigRoadEl.innerHTML = columns.map(col => {
                let cellsHtml = '';
                for (let i = 0; i < 5; i++) {
                    if (col[i]) {
                        const isTai = col[i].result === 'tai';
                        const bg = isTai ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]';
                        const text = isTai ? 'T' : 'X';
                        cellsHtml += `<div class="w-full aspect-square max-w-[34px] max-h-[34px] rounded-full ${bg} text-white flex items-center justify-center font-black text-xs sm:text-sm border border-white/20 animate-scaleUp">${text}</div>`;
                    } else {
                        cellsHtml += `<div class="w-full aspect-square max-w-[34px] max-h-[34px] rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center"></div>`;
                    }
                }
                return `<div class="flex flex-col gap-1 flex-1 items-center">${cellsHtml}</div>`;
            }).join('');
        }

        // ─── Render Biểu Đồ Đường (Lấy 20 phiên gần nhất) ───
        const chartHistory = history.slice(-20);
        const labels = chartHistory.map(s => (s.sessionCode || "").toString().slice(-3));
        const totals = chartHistory.map(s => s.total || 0);
        const d1 = chartHistory.map(s => s.dice1 || 0);
        const d2 = chartHistory.map(s => s.dice2 || 0);
        const d3 = chartHistory.map(s => s.dice3 || 0);

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

        // Sum Chart
        const sumChartCtx = document.getElementById('sumChart');
        if (sumChartCtx) {
            const sumChartDatasets = [{
                data: totals,
                borderColor: '#ffdf00',
                backgroundColor: '#ffdf00',
                pointBackgroundColor: chartHistory.map(s => s.result === 'tai' ? '#ef4444' : '#3b82f6'),
                pointBorderColor: '#fff',
                pointBorderWidth: 1
            }];
            if (sumChart) {
                sumChart.data.labels = labels;
                sumChart.data.datasets = sumChartDatasets;
                sumChart.update();
            } else {
                sumChart = new Chart(sumChartCtx, chartConfig('sumChart', sumChartDatasets, 3, 18));
            }
        }

        // Dice Chart
        const diceChartCtx = document.getElementById('diceChart');
        if (diceChartCtx) {
            const diceChartDatasets = [
                { data: d1, borderColor: '#a855f7', pointBackgroundColor: '#a855f7' },
                { data: d2, borderColor: '#eab308', pointBackgroundColor: '#eab308' },
                { data: d3, borderColor: '#10b981', pointBackgroundColor: '#10b981' }
            ];
            if (diceChart) {
                diceChart.data.labels = labels;
                diceChart.data.datasets = diceChartDatasets;
                diceChart.update();
            } else {
                diceChart = new Chart(diceChartCtx, chartConfig('diceChart', diceChartDatasets, 1, 6));
            }
        }
    } catch (e) { console.error("Lỗi vẽ biểu đồ:", e); }
}

// ─── Slot Game Logic ─────────────────────────
const SLOT_SYMBOLS = ['🍒', '💎', '🍀', '🔔', '💰', '⭐', '🍊', '7️⃣', '👺', '👑'];
let isSpinning = false;

connection.on('JackpotUpdate', (val) => {
    const el = document.getElementById('slotJackpot');
    if (el) animateNumber(el, parseInt(el.textContent.replace(/,/g, '')) || 0, val, 1000);
});

async function performSpinAnimation(finalGrid) {
    const reels = [document.getElementById('reel0'), document.getElementById('reel1'), document.getElementById('reel2')];

    const promises = reels.map((reel, i) => {
        return new Promise(resolve => {
            const strip = [];
            for (let s = 0; s < 30; s++) strip.push(SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);

            strip[strip.length - 3] = SLOT_SYMBOLS[finalGrid[0][i]];
            strip[strip.length - 2] = SLOT_SYMBOLS[finalGrid[1][i]];
            strip[strip.length - 1] = SLOT_SYMBOLS[finalGrid[2][i]];

            reel.innerHTML = strip.map(s => `<div class='h-12 flex items-center justify-center text-3xl'>${s}</div>`).join('');
            reel.style.transition = 'none';
            reel.style.transform = 'translateY(0)';
            reel.offsetHeight;

            const travel = (strip.length - 3) * 48;
            reel.style.transition = `transform ${2.5 + i * 0.5}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
            reel.style.transform = `translateY(-${travel}px)`;

            setTimeout(resolve, 2500 + i * 500);
        });
    });

    await Promise.all(promises);
}

// ─── Xóc Đĩa Logic ──────────────────────────
function selectXocDiaSide(side) {
    if (lastXDPhase !== 'betting') return;
    selectedXocDiaSide = side;
    vibrate(10);
    const btnChan = document.getElementById('btnXocDiaChan');
    const btnLe = document.getElementById('btnXocDiaLe');
    if (btnChan) {
        btnChan.classList.toggle('border-yellow-500', side === 'chan');
        btnChan.classList.toggle('bg-yellow-500/10', side === 'chan');
    }
    if (btnLe) {
        btnLe.classList.toggle('border-yellow-500', side === 'le');
        btnLe.classList.toggle('bg-yellow-500/10', side === 'le');
    }

    const panel = document.getElementById('quickXocDiaBetPanel');
    const title = document.getElementById('quickXocDiaBetTitle');
    if (panel && title) {
        title.textContent = `ĐẶT CƯỢC ${side === 'chan' ? 'CHẴN' : 'LẺ'}`;
        panel.classList.remove('hidden'); panel.classList.add('flex');
    }
}

function closeQuickXocDiaBet() {
    const panel = document.getElementById('quickXocDiaBetPanel');
    if (panel) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
}

function addXocDiaBetAmount(amount) {
    const input = document.getElementById('xocDiaBetAmount');
    if (input) input.value = (parseInt(input.value) || 0) + amount;
}

function setXocDiaAllIn() {
    const input = document.getElementById('xocDiaBetAmount');
    if (input) input.value = balance;
}

async function playXocDia() {
    if (!selectedXocDiaSide) { showToast("Vui lòng chọn Chẵn hoặc Lẻ!", "error"); return; }
    const amount = parseInt(document.getElementById('xocDiaBetAmount').value);
    if (balance < amount) { showToast("Số dư không đủ!", "error"); return; }

    const btn = document.getElementById('xocDiaSpinBtn');
    try {
        if (connection.state !== "Connected") {
            vibrate([50, 50, 50]); showToast("❌ Lỗi kết nối server!", "error"); return;
        }
        if (btn) btn.disabled = true;

        const result = await connection.invoke('PlayXocDia', selectedXocDiaSide, amount);
        if (result.success) {
            hasBetXD = true; balance = result.balance;
            vibrate(30); updateBalanceDisplay();
            showToast("✅ Đặt cược thành công!", "success");

            const badgeId = 'placedBetXocDia' + (selectedXocDiaSide === 'chan' ? 'Chan' : 'Le');
            const badge = document.getElementById(badgeId);
            if (badge) {
                let current = parseInt(badge.textContent.replace(/[^0-9]/g, '')) || 0;
                badge.textContent = (current + amount).toLocaleString() + 'đ';
                badge.classList.remove('hidden');
            }
            closeQuickXocDiaBet();
        } else { showToast(result.message, "error"); }
    } catch (e) {
        console.error("PlayXocDia error:", e); showToast("Lỗi kết nối!", "error");
    } finally { if (btn) btn.disabled = false; }
}

// ─── Bầu Cua Logic ──────────────────────────
let selectedBauCuaChoice = null;
function selectBauCuaChoice(choice) {
    selectedBauCuaChoice = choice;
    vibrate(10);
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

    const btn = document.getElementById('playBauCuaBtn'); // Thêm ID này vào button HTML của bạn
    try {
        if (connection.state !== "Connected") {
            vibrate([50, 50, 50]);
            showToast("❌ Lỗi kết nối server!", "error");
            return;
        }
        if (btn) btn.disabled = true;

        const result = await connection.invoke('PlayBauCua', selectedBauCuaChoice, amount);
        if (result.success) {
            hasBetBC = true; balance = result.balance;
            vibrate(30);
            updateBalanceDisplay();
            showToast("✅ Đặt cược Bầu Cua thành công!");

            // Hiển thị số tiền vừa cược lên linh vật đã chọn
            const badge = document.getElementById('placedBetBC-' + selectedBauCuaChoice);
            if (badge) {
                let current = parseInt(badge.textContent.replace(/[^0-9]/g, '')) || 0;
                badge.textContent = (current + amount).toLocaleString() + 'đ';
                badge.classList.remove('hidden');
            }
        } else {
            showToast(result.message || "Lỗi đặt cược", "error");
        }
    } catch (e) {
        console.error("PlayBauCua error:", e);
        showToast("Lỗi kết nối server!", "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function toggleNanMode() {
    isManualOpenEnabled = !isManualOpenEnabled;
    updateNanModeButtonVisuals(isManualOpenEnabled);
    showToast(isManualOpenEnabled ? "🖐️ ĐÃ BẬT NẶN BÁT THỦ CÔNG" : "⚡ ĐÃ BẬT MỞ BÁT TỰ ĐỘNG", isManualOpenEnabled ? "success" : "info");
    initDrag(); // Cập nhật lại sự kiện kéo bát cho Tài Xỉu
}

function updateNanModeButtonVisuals(enabled) {
    const btns = ['btnNanToggle', 'btnXDNanToggle'];
    btns.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (enabled) {
                el.className = "w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-b from-yellow-400 to-yellow-600 border-2 border-white flex items-center justify-center text-black text-sm sm:text-xl shadow-[0_0_15px_rgba(250,204,21,0.8)] hover:scale-110 transition cursor-pointer haptic-btn";
                el.innerHTML = '<i class="fa-solid fa-hand"></i>';
            } else {
                el.className = "w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-b from-[#8a1212] to-[#4a0a0a] border-2 border-yellow-400 flex items-center justify-center text-white text-sm sm:text-xl shadow-lg hover:scale-110 transition cursor-pointer haptic-btn";
                el.innerHTML = '<i class="fa-solid fa-bolt"></i>';
            }
        }
    });
}

// ─── Hoạt động giả lập (Fake Activity) ──────
function startSimulatedActivity() {
    // 1. Giả lập số người online thay đổi ngẫu nhiên
    setInterval(() => {
        const el = document.getElementById('onlineCount');
        if (!el) return;
        let current = parseInt(el.textContent) || 120;
        // Thay đổi nhẹ từ -3 đến +6 người để tạo cảm giác thực tế
        let change = Math.floor(Math.random() * 10) - 3;
        let next = Math.max(50, current + change); // Đảm bảo không xuống dưới 50
        el.textContent = next;
    }, 5000);

    // 2. Giả lập tiền cược nhảy liên tục trong phase đặt cược
    setInterval(() => {
        if (lastPhase !== 'betting') return;

        // Đối với Tài Xỉu
        const xiuEl = document.getElementById('totalXiu');
        const taiEl = document.getElementById('totalTai');

        if (xiuEl && taiEl) {
            // Nhảy thêm từ 200k đến 2.5tr mỗi lần
            let addLeft = Math.floor(Math.random() * 2300000) + 200000;
            let addRight = Math.floor(Math.random() * 2300000) + 200000;

            let oldXiu = currentDisplayedXiu;
            let oldTai = currentDisplayedTai;

            currentDisplayedXiu += addLeft;
            currentDisplayedTai += addRight;

            animateNumber(xiuEl, oldXiu, currentDisplayedXiu, 1000);
            animateNumber(taiEl, oldTai, currentDisplayedTai, 1000);
        }
    }, 2000);
}

// Update initDrag for multiple bowls
function initAllDrags() {
    initDrag();
    initXocDiaDrag();
    updateNanModeButtonVisuals(isManualOpenEnabled); // Set initial state of nan mode buttons on page load
    startSimulatedActivity(); // Khởi chạy các hoạt động giả lập
}
document.addEventListener('DOMContentLoaded', initAllDrags);

let isXocDiaDragging = false, startXDY = 0, currentXDY = 0;
let handleXDMouDown = null, handleXDMouMove = null, handleXDMouUp = null;
let handleXDTouStart = null, handleXDTouMove = null, handleXDTouEnd = null;

function initXocDiaDrag() {
    const xdBowl = document.getElementById('xocDiaBowl');
    if (!xdBowl) return;

    if (handleXDMouDown) xdBowl.removeEventListener('mousedown', handleXDMouDown);
    if (handleXDTouStart) xdBowl.removeEventListener('touchstart', handleXDTouStart);
    if (handleXDMouMove) window.removeEventListener('mousemove', handleXDMouMove);
    if (handleXDTouMove) window.removeEventListener('touchmove', handleXDTouMove);
    if (handleXDMouUp) window.removeEventListener('mouseup', handleXDMouUp);
    if (handleXDTouEnd) window.removeEventListener('touchend', handleXDTouEnd);

    handleXDMouDown = null; handleXDMouMove = null; handleXDMouUp = null;
    handleXDTouStart = null; handleXDTouMove = null; handleXDTouEnd = null;

    if (!isManualOpenEnabled) {
        xdBowl.style.cursor = 'default';
        xdBowl.classList.remove('hint-drag');
        return;
    }

    xdBowl.style.cursor = 'grab';
    xdBowl.classList.add('hint-drag');

    handleXDMouDown = (e) => {
        if (lastXDPhase === 'betting') return;
        isXocDiaDragging = true; startXDY = e.clientY; currentXDY = startXDY; xdBowl.style.transition = 'none';
    };
    handleXDTouStart = (e) => {
        if (lastXDPhase === 'betting') return;
        isXocDiaDragging = true; startXDY = e.touches[0].clientY; currentXDY = startXDY; xdBowl.style.transition = 'none';
    };
    handleXDMouMove = (e) => {
        if (!isXocDiaDragging) return;
        currentXDY = e.clientY; const diff = startXDY - currentXDY;
        if (diff > 0) {
            xdBowl.style.transform = `translateY(-${Math.min(diff, 150)}px) rotate(-${Math.min(diff / 5, 20)}deg)`;
            if (diff > BOWL_OPEN_THRESHOLD) finalizeXocDiaOpen();
        }
    };
    handleXDTouMove = (e) => {
        if (!isXocDiaDragging) return;
        currentXDY = e.touches[0].clientY; const diff = startXDY - currentXDY;
        if (diff > 0) {
            if (e.cancelable) e.preventDefault();
            xdBowl.style.transform = `translateY(-${Math.min(diff, 150)}px) rotate(-${Math.min(diff / 5, 20)}deg)`;
            if (diff > BOWL_OPEN_THRESHOLD) finalizeXocDiaOpen();
        }
    };
    const stopXDDrag = () => {
        if (!isXocDiaDragging) return;
        isXocDiaDragging = false;
        const diff = startXDY - currentXDY;
        if (diff <= 5) {
            finalizeXocDiaOpen();
        } else {
            xdBowl.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
            xdBowl.style.transform = "";
        }
    };
    handleXDMouUp = stopXDDrag;
    handleXDTouEnd = stopXDDrag;

    xdBowl.addEventListener('mousedown', handleXDMouDown);
    xdBowl.addEventListener('touchstart', handleXDTouStart);
    window.addEventListener('mousemove', handleXDMouMove);
    window.addEventListener('touchmove', handleXDTouMove);
    window.addEventListener('mouseup', handleXDMouUp);
    window.addEventListener('touchend', handleXDTouEnd);
}

function finalizeXocDiaOpen() {
    const bowl = document.getElementById('xocDiaBowl');
    if (!bowl || bowl.style.display === 'none') return;

    isXocDiaDragging = false;
    bowl.style.transition = "all 0.8s ease-in-out";
    bowl.style.transform = "translate(100px, -150px) rotate(30deg)";
    bowl.style.opacity = "0";

    // Nhảy đèn bên thắng Xóc Đĩa
    const winBtnId = lastXDResult === 'chan' ? 'btnXocDiaChan' : 'btnXocDiaLe';
    document.getElementById(winBtnId)?.classList.add('led-win');

    if (window.pendingXD) {
        const res = window.pendingXD;
        if (res.winAmount > 0) {
            showToast(`🎉 XÓC ĐĨA THẮNG: +${res.winAmount.toLocaleString()}đ`, "success");
            triggerWinEffect();
        } else { showToast("Xóc Đĩa không trúng, chúc bạn may mắn lần sau!", "error"); }
        window.pendingXD = null;
    }
}

async function spinSlot() {
    if (isSpinning) return;
    const amount = parseInt(document.getElementById('slotBetAmount').value);
    if (balance < amount) { showToast('Số dư không đủ!', 'error'); return; }

    isSpinning = true;
    const btn = document.getElementById('spinBtn');
    btn.disabled = true;
    vibrate(40);
    btn.textContent = 'ĐANG QUAY...';

    try {
        const result = await connection.invoke('SpinSlot', amount);
        if (result.success) {
            balance = result.balance;
            vibrate(20);
            updateBalanceDisplay();
            await performSpinAnimation(result.grid);

            if (result.winAmount > 0) {
                showToast(result.isJackpot ? '🎰 NỔ HŨ KHỔNG LỒ!' : '🎉 BẠN ĐÃ THẮNG ' + result.winAmount.toLocaleString() + 'đ', 'success');
                if (result.isJackpot) confetti({ particleCount: 300, spread: 100, origin: { y: 0.5 } });
                else triggerWinEffect();
            } else {
                showToast("Không trúng, chúc bạn may mắn ván sau!", "error");
            }
        } else { showToast(result.message, 'error'); }
    } catch (e) { showToast('Lỗi kết nối!', 'error'); } finally {
        isSpinning = false;
        const btnReset = document.getElementById('spinBtn');
        if (btnReset) { btnReset.disabled = false; btnReset.textContent = 'QUAY NGAY'; }
    }
}
