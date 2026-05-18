using BET366.Data;
using BET366.Hubs;
using BET366.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BET366.Services
{
    public class GameTimerService : BackgroundService
    {
        private readonly IServiceProvider _sp;
        private readonly GameEngineService _engine;
        private readonly IHubContext<GameHub> _hub;
        private readonly ILogger<GameTimerService> _logger;

        public GameTimerService(IServiceProvider sp, GameEngineService engine, IHubContext<GameHub> hub, ILogger<GameTimerService> logger)
        {
            _sp = sp;
            _engine = engine;
            _hub = hub;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken ct)
        {
            _logger.LogInformation("🎲 GameTimerService started");
            _engine.ResetSession();

            // Create first session in DB
            using (var scope = _sp.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var session = new GameSession
                {
                    SessionCode = $"GS-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6]}",
                    Phase = "betting"
                };
                db.GameSessions.Add(session);
                
                // Cleanup old sessions
                var sessionsToRemove = await db.GameSessions
                    .OrderByDescending(s => s.Id)
                    .Skip(20)
                    .ToListAsync(ct);
                if (sessionsToRemove.Any()) db.GameSessions.RemoveRange(sessionsToRemove);

                await db.SaveChangesAsync(ct);
                _engine.State.CurrentSessionId = session.Id;
            }

            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(1000, ct);
                var state = _engine.State;

                // --- TAI XIU LOGIC ---
                if (state.TimeLeft > 0)
                {
                    state.TimeLeft--;
                    if (state.Phase == "betting" && state.TimeLeft > 0)
                        _engine.AddFakeBets();
                }
                else
                {
                    if (state.Phase == "betting")
                    {
                        state.Phase = "rolling";
                        state.TimeLeft = 10;
                        var (d1, d2, d3, total) = _engine.RollDice();
                        await ProcessTaiXiuResult(d1, d2, d3, total, state.CurrentSessionId, ct);
                    }
                    else
                    {
                        await StartNewTaiXiuSession(state, ct);
                    }
                }

                // --- XOC DIA LOGIC ---
                if (state.XocDia.TimeLeft > 0)
                {
                    state.XocDia.TimeLeft--;
                }
                else
                {
                    if (state.XocDia.Phase == "betting")
                    {
                        state.XocDia.Phase = "rolling";
                        state.XocDia.TimeLeft = 10;
                        var coins = _engine.RollXocDia();
                        await ProcessXocDiaResult(coins, ct);
                    }
                    else
                    {
                        _engine.ClearXocDiaBets();
                        state.XocDia.Phase = "betting";
                        state.XocDia.TimeLeft = 30;
                    }
                }

                // --- BAU CUA LOGIC ---
                if (state.BauCua.TimeLeft > 0)
                {
                    state.BauCua.TimeLeft--;
                }
                else
                {
                    if (state.BauCua.Phase == "betting")
                    {
                        state.BauCua.Phase = "rolling";
                        state.BauCua.TimeLeft = 10;
                        var result = _engine.RollBauCua();
                        await ProcessBauCuaResult(result, ct);
                    }
                    else
                    {
                        _engine.ClearBauCuaBets();
                        state.BauCua.Phase = "betting";
                        state.BauCua.TimeLeft = 35;
                    }
                }

                // Broadcast all timers
                await _hub.Clients.All.SendAsync("TimerUpdate", new { timeLeft = state.TimeLeft, phase = state.Phase }, ct);
                await _hub.Clients.All.SendAsync("XocDiaTimerUpdate", new { timeLeft = state.XocDia.TimeLeft, phase = state.XocDia.Phase }, ct);
                await _hub.Clients.All.SendAsync("BauCuaTimerUpdate", new { timeLeft = state.BauCua.TimeLeft, phase = state.BauCua.Phase }, ct);

                await _hub.Clients.All.SendAsync("TotalBetsUpdate", new { leftTotal = state.TotalBetLeft, rightTotal = state.TotalBetRight }, ct);
                await _hub.Clients.All.SendAsync("GameHistoryUpdate", state.GameHistory, ct);
            }
        }

        private async Task ProcessTaiXiuResult(int d1, int d2, int d3, int total, int sessionId, CancellationToken ct)
        {
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var session = await db.GameSessions.FindAsync(sessionId);
            if (session != null)
            {
                session.Dice1 = d1; session.Dice2 = d2; session.Dice3 = d3; session.Total = total;
                session.Result = total >= 4 && total <= 10 ? "xiu" : "tai";
                session.Phase = "rolling";
                session.EndTime = DateTime.UtcNow;

                var pendingBets = await db.BetHistories.Include(b => b.User)
                    .Where(b => b.GameSessionId == session.Id && b.Result == "Đang chờ")
                    .ToListAsync(ct);

                var winnerSide = total >= 4 && total <= 10 ? "left" : "right";

                foreach (var bet in pendingBets)
                {
                    bet.Dice1 = d1; bet.Dice2 = d2; bet.Dice3 = d3;
                    if (bet.Side == winnerSide) {
                        bet.Result = "Thắng"; bet.WinAmount = bet.Amount * 2;
                        if (bet.User != null) bet.User.Balance += bet.WinAmount;
                    } else {
                        bet.Result = "Thua"; bet.WinAmount = 0;
                    }
                }
                await db.SaveChangesAsync(ct);

                foreach (var bet in pendingBets) {
                    if (bet.User != null) {
                        await _hub.Clients.Group($"user_{bet.User.Username}").SendAsync("BetResolved", new {
                            betId = bet.Id, result = bet.Result, winAmount = bet.WinAmount, balance = bet.User.Balance
                        }, ct);
                    }
                }
            }
            await _hub.Clients.All.SendAsync("GameResult", new { dice = new[] { d1, d2, d3 }, total, result = total >= 4 && total <= 10 ? "xiu" : "tai" }, ct);
        }

        private async Task ProcessXocDiaResult(int[] coins, CancellationToken ct)
        {
            int redCount = 0;
            foreach (var c in coins) if (c == 1) redCount++;
            string winnerSide = (redCount % 2 == 0) ? "chan" : "le";
            var state = _engine.State.XocDia;

            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            foreach (var side in state.ActiveBets.Keys)
            {
                bool isWin = side == winnerSide;
                foreach (var bet in state.ActiveBets[side])
                {
                    if (isWin)
                    {
                        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == bet.username, ct);
                        if (user != null)
                        {
                            user.Balance += bet.amount * 2;
                            await _hub.Clients.Group($"user_{user.Username}").SendAsync("BetResolved", new {
                                result = "Thắng", winAmount = bet.amount * 2, balance = user.Balance
                            }, ct);
                        }
                    }
                    else
                    {
                        await _hub.Clients.Group($"user_{bet.username}").SendAsync("BetResolved", new {
                            result = "Thua", winAmount = 0
                        }, ct);
                    }
                }
            }
            await db.SaveChangesAsync(ct);
            await _hub.Clients.All.SendAsync("XocDiaResult", new { coins }, ct);
        }

        private async Task ProcessBauCuaResult(string[] result, CancellationToken ct)
        {
            var state = _engine.State.BauCua;
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            foreach (var choice in state.ActiveBets.Keys)
            {
                int matches = 0;
                foreach (var r in result) if (r == choice) matches++;

                foreach (var bet in state.ActiveBets[choice])
                {
                    if (matches > 0)
                    {
                        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == bet.username, ct);
                        if (user != null)
                        {
                            long winAmount = bet.amount + (bet.amount * matches);
                            user.Balance += winAmount;
                            await _hub.Clients.Group($"user_{user.Username}").SendAsync("BetResolved", new {
                                result = "Thắng", winAmount = winAmount, balance = user.Balance
                            }, ct);
                        }
                    }
                    else
                    {
                        await _hub.Clients.Group($"user_{bet.username}").SendAsync("BetResolved", new {
                            result = "Thua", winAmount = 0
                        }, ct);
                    }
                }
            }
            await db.SaveChangesAsync(ct);
            await _hub.Clients.All.SendAsync("BauCuaResult", new { result }, ct);
        }

        private async Task StartNewTaiXiuSession(GameState state, CancellationToken ct)
        {
            _engine.ResetSession();
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var oldSession = await db.GameSessions.FindAsync(state.CurrentSessionId);
            if (oldSession != null) oldSession.Phase = "finished";

            var newSession = new GameSession {
                SessionCode = $"GS-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6]}",
                Phase = "betting"
            };
            db.GameSessions.Add(newSession);
            await db.SaveChangesAsync(ct);
            state.CurrentSessionId = newSession.Id;
            await _hub.Clients.All.SendAsync("NewSession", new { sessionCode = newSession.SessionCode }, ct);
        }
    }
}
