using BET366.Data;
using BET366.Models;
using BET366.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace BET366.Hubs
{
    public class GameHub : Hub
    {
        private readonly GameEngineService _engine;
        private readonly IServiceProvider _sp;
        private static int _onlineCount = 0;

        public GameHub(GameEngineService engine, IServiceProvider sp)
        {
            _engine = engine;
            _sp = sp;
        }

        public static int OnlineCount => _onlineCount;

        public async Task JoinGame(string username)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{username}");
            Context.Items["username"] = username;

            // Send current state immediately
            var state = _engine.State;
            await Clients.Caller.SendAsync("TimerUpdate", new { timeLeft = state.TimeLeft, phase = state.Phase });
            await Clients.Caller.SendAsync("XocDiaTimerUpdate", new { timeLeft = state.XocDia.TimeLeft, phase = state.XocDia.Phase });
            await Clients.Caller.SendAsync("BauCuaTimerUpdate", new { timeLeft = state.BauCua.TimeLeft, phase = state.BauCua.Phase });
            await Clients.Caller.SendAsync("TotalBetsUpdate", new { leftTotal = state.TotalBetLeft, rightTotal = state.TotalBetRight });
            await Clients.Caller.SendAsync("GameHistoryUpdate", state.GameHistory);
        }

        public async Task JoinAdmin()
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "admin");
        }

        public async Task<object> SpinSlot(long amount)
        {
            var username = Context.Items["username"]?.ToString();
            if (string.IsNullOrEmpty(username))
                return new { success = false, message = "Chưa đăng nhập" };

            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);

            if (user == null || user.UserStatus == 3)
                return new { success = false, message = "Tài khoản bị khóa" };
            if (user.Balance < amount)
                return new { success = false, message = "Số dư không đủ!" };
            if (amount < 1000)
                return new { success = false, message = "Cược tối thiểu 1,000đ" };

            // Deduction
            user.Balance -= amount;

            // Update Jackpot (1% of bet)
            var jpConfig = await db.SystemConfigs.FirstOrDefaultAsync(c => c.ConfigKey == "JackpotValue");
            long currentJp = long.Parse(jpConfig?.ConfigValue ?? "100000000");
            currentJp += (long)(amount * 0.01);
            if (jpConfig != null) jpConfig.ConfigValue = currentJp.ToString();

            // Generate Grid 3x3 (Jagged array for JSON support)
            var rand = new Random();
            int[][] grid = new int[3][];
            for (int i = 0; i < 3; i++)
            {
                grid[i] = new int[3];
                for (int j = 0; j < 3; j++)
                    grid[i][j] = rand.Next(0, 10);
            }

            // Check Wins (5 lines)
            long winAmount = 0;
            bool isJackpot = false;
            long lineBet = amount / 5;

            int[][] lines = new int[][] {
                new int[] { grid[0][0], grid[0][1], grid[0][2] }, // Row 1
                new int[] { grid[1][0], grid[1][1], grid[1][2] }, // Row 2
                new int[] { grid[2][0], grid[2][1], grid[2][2] }, // Row 3
                new int[] { grid[0][0], grid[1][1], grid[2][2] }, // Diag 1
                new int[] { grid[0][2], grid[1][1], grid[2][0] }  // Diag 2
            };

            foreach (var line in lines)
            {
                if (line[0] == line[1] && line[1] == line[2])
                {
                    if (line[0] == 9) // Symbol 9 is Jackpot
                    {
                        winAmount += currentJp;
                        isJackpot = true;
                        currentJp = 100000000; // Reset Jackpot
                        if (jpConfig != null) jpConfig.ConfigValue = currentJp.ToString();
                    }
                    else
                    {
                        winAmount += lineBet * 10; // 3 of a kind = x10 line bet
                    }
                }
            }

            try {
                user.Balance += winAmount;

                var history = new SlotHistory
                {
                    UserId = user.Id,
                    BetAmount = amount,
                    ResultGrid = System.Text.Json.JsonSerializer.Serialize(grid),
                    WinAmount = winAmount,
                    IsJackpot = isJackpot
                };
                db.SlotHistories.Add(history);
                await db.SaveChangesAsync();

                // Broadcast new Jackpot
                await Clients.All.SendAsync("JackpotUpdate", currentJp);

                return new { 
                    success = true, 
                    balance = user.Balance, 
                    grid = grid, 
                    winAmount = winAmount, 
                    isJackpot = isJackpot,
                    jackpot = currentJp
                };
            } catch (Exception ex) {
                return new { success = false, message = "Lỗi hệ thống: " + ex.Message };
            }
        }

        public async Task<object> PlaceBet(string side, long amount)
        {
            var username = Context.Items["username"]?.ToString();
            if (string.IsNullOrEmpty(username))
                return new { success = false, message = "Chưa đăng nhập" };

            var state = _engine.State;
            if (state.Phase != "betting" || state.TimeLeft <= 3)
                return new { success = false, message = "Hết thời gian đặt cược" };

            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);

            if (user == null || user.UserStatus == 3)
                return new { success = false, message = "Tài khoản bị khóa hoặc không tồn tại" };
            if (user.Balance < amount)
                return new { success = false, message = "Số dư không đủ!" };
            if (amount < 1000)
                return new { success = false, message = "Cược tối thiểu 1,000đ" };

            user.Balance -= amount;
            _engine.AddRealBet(side, amount);

            var bet = new BetHistory
            {
                UserId = user.Id,
                GameSessionId = state.CurrentSessionId,
                Side = side,
                Amount = amount,
                Result = "Đang chờ"
            };
            db.BetHistories.Add(bet);
            await db.SaveChangesAsync();

            return new { success = true, balance = user.Balance, betId = bet.Id };
        }

        public async Task<object> PlayXocDia(string side, long amount)
        {
            var username = Context.Items["username"]?.ToString();
            if (string.IsNullOrEmpty(username)) return new { success = false, message = "Chưa đăng nhập" };

            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);

            if (user == null || user.Balance < amount) return new { success = false, message = "Số dư không đủ!" };
            if (amount < 1000) return new { success = false, message = "Cược tối thiểu 1,000đ" };
            if (_engine.State.XocDia.Phase != "betting") return new { success = false, message = "Đã hết thời gian cược!" };

            user.Balance -= amount;
            _engine.AddXocDiaBet(side, username, amount);
            await db.SaveChangesAsync();

            return new { success = true, balance = user.Balance };
        }

        public async Task<object> PlayBauCua(string choice, long amount)
        {
            var username = Context.Items["username"]?.ToString();
            if (string.IsNullOrEmpty(username)) return new { success = false, message = "Chưa đăng nhập" };

            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);

            if (user == null || user.Balance < amount) return new { success = false, message = "Số dư không đủ!" };
            if (amount < 1000) return new { success = false, message = "Cược tối thiểu 1,000đ" };
            if (_engine.State.BauCua.Phase != "betting") return new { success = false, message = "Đã hết thời gian cược!" };

            user.Balance -= amount;
            _engine.AddBauCuaBet(choice, username, amount);
            await db.SaveChangesAsync();

            return new { success = true, balance = user.Balance };
        }

        [Authorize(Roles = "Admin")]
        public void SetTaiXiuOverride(string mode) => _engine.SetResultOverride(mode);

        [Authorize(Roles = "Admin")]
        public void SetXocDiaOverride(string mode) => _engine.State.XocDiaOverride = mode;

        [Authorize(Roles = "Admin")]
        public void SetBauCuaOverride(string mode) => _engine.State.BauCuaOverride = mode;

        public override Task OnConnectedAsync()
        {
            Interlocked.Increment(ref _onlineCount);
            return base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? ex)
        {
            Interlocked.Decrement(ref _onlineCount);
            var username = Context.Items["username"]?.ToString();
            if (!string.IsNullOrEmpty(username))
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{username}");
            await base.OnDisconnectedAsync(ex);
        }
    }
}
