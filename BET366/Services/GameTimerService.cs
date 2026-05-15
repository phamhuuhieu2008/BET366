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
                        // Roll dice
                        state.Phase = "rolling";
                        state.TimeLeft = 10;
                        var (d1, d2, d3, total) = _engine.RollDice();

                        // Save result to DB
                        using var scope = _sp.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                        var session = await db.GameSessions.FindAsync(state.CurrentSessionId);
                        if (session != null)
                        {
                            session.Dice1 = d1;
                            session.Dice2 = d2;
                            session.Dice3 = d3;
                            session.Total = total;
                            session.Result = total >= 4 && total <= 10 ? "xiu" : "tai";
                            session.Phase = "rolling";
                            session.EndTime = DateTime.UtcNow;

                            // Resolve all pending bets for this session
                            var pendingBets = await db.BetHistories
                                .Include(b => b.User)
                                .Where(b => b.GameSessionId == session.Id && b.Result == "Đang chờ")
                                .ToListAsync(ct);

                            var winnerSide = total >= 4 && total <= 10 ? "left" : "right";

                            foreach (var bet in pendingBets)
                            {
                                bet.Dice1 = d1;
                                bet.Dice2 = d2;
                                bet.Dice3 = d3;
                                if (bet.Side == winnerSide)
                                {
                                    bet.Result = "Thắng";
                                    bet.WinAmount = bet.Amount * 2;
                                    if (bet.User != null) bet.User.Balance += bet.WinAmount;
                                }
                                else
                                {
                                    bet.Result = "Thua";
                                    bet.WinAmount = 0;
                                }
                            }

                            await db.SaveChangesAsync(ct);

                            // Notify each user individually via SignalR
                            foreach (var bet in pendingBets)
                            {
                                if (bet.User != null)
                                {
                                    await _hub.Clients.Group($"user_{bet.User.Username}")
                                        .SendAsync("BetResolved", new
                                        {
                                            betId = bet.Id,
                                            result = bet.Result,
                                            winAmount = bet.WinAmount,
                                            balance = bet.User.Balance
                                        }, ct);
                                }
                            }
                        }

                        // Broadcast game result
                        await _hub.Clients.All.SendAsync("GameResult", new
                        {
                            dice = new[] { d1, d2, d3 },
                            total,
                            result = total >= 4 && total <= 10 ? "xiu" : "tai"
                        }, ct);
                    }
                    else // rolling -> new session
                    {
                        _engine.ResetSession();

                        // Create new session in DB
                        using var scope = _sp.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                        var oldSession = await db.GameSessions.FindAsync(state.CurrentSessionId);
                        if (oldSession != null) { oldSession.Phase = "finished"; }

                        var newSession = new GameSession
                        {
                            SessionCode = $"GS-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6]}",
                            Phase = "betting"
                        };
                        db.GameSessions.Add(newSession);
                        
                        // Cleanup old sessions (Keep only latest 20)
                        var sessionsToRemove = await db.GameSessions
                            .OrderByDescending(s => s.Id)
                            .Skip(20)
                            .ToListAsync(ct);
                        if (sessionsToRemove.Any()) db.GameSessions.RemoveRange(sessionsToRemove);

                        await db.SaveChangesAsync(ct);
                        state.CurrentSessionId = newSession.Id;

                        await _hub.Clients.All.SendAsync("NewSession", new { sessionCode = newSession.SessionCode }, ct);
                    }
                }

                // Broadcast timer + bets every second
                await _hub.Clients.All.SendAsync("TimerUpdate", new
                {
                    timeLeft = state.TimeLeft,
                    phase = state.Phase
                }, ct);

                await _hub.Clients.All.SendAsync("TotalBetsUpdate", new
                {
                    leftTotal = state.TotalBetLeft,
                    rightTotal = state.TotalBetRight
                }, ct);

                await _hub.Clients.All.SendAsync("GameHistoryUpdate", state.GameHistory, ct);
            }
        }
    }
}
