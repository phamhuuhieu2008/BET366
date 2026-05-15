using BET366.Data;
using BET366.Hubs;
using BET366.Models;
using BET366.Models.ViewModels;
using BET366.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BET366.Controllers
{
    [Authorize(Roles = "Admin")]
    public class AdminController : Controller
    {
        private readonly ApplicationDbContext _db;
        private readonly GameEngineService _engine;
        private readonly IHubContext<GameHub> _hub;

        public AdminController(ApplicationDbContext db, GameEngineService engine, IHubContext<GameHub> hub)
        {
            _db = db;
            _engine = engine;
            _hub = hub;
        }

        public async Task<IActionResult> Index()
        {
            var today = DateTime.UtcNow.Date;
            var vm = new AdminDashboardViewModel
            {
                TotalUsers = await _db.Users.CountAsync(u => u.UserStatus != 1),
                OnlineUsers = GameHub.OnlineCount,
                TotalDepositToday = await _db.Deposits.Where(d => d.CreatedAt >= today && d.Status == "Success").SumAsync(d => d.Amount),
                TotalWithdrawToday = await _db.Withdraws.Where(w => w.CreatedAt >= today && w.Status == "Hoàn thành").SumAsync(w => w.Amount),
                RecentDeposits = await _db.Deposits.Include(d => d.User).OrderByDescending(d => d.CreatedAt).Take(10).ToListAsync(),
                RecentWithdraws = await _db.Withdraws.Include(w => w.User).OrderByDescending(w => w.CreatedAt).Take(10).ToListAsync()
            };
            return View(vm);
        }

        // ─── USER MANAGEMENT ────────────────────────────────────
        public async Task<IActionResult> Users()
        {
            var users = await _db.Users.Where(u => u.UserStatus != 1).OrderByDescending(u => u.CreatedAt).ToListAsync();
            return View(users);
        }

        [HttpPost]
        public async Task<IActionResult> ToggleLock(int id)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null || user.UserStatus == 1) return Json(new { success = false });
            
            // Toggle between 2 (User) and 3 (Locked)
            user.UserStatus = user.UserStatus == 2 ? 3 : 2;
            await _db.SaveChangesAsync();
            
            bool isLocked = user.UserStatus == 3;
            if (isLocked)
                await _hub.Clients.Group($"user_{user.Username}").SendAsync("AccountLocked");
                
            return Json(new { success = true, isLocked = isLocked, status = user.UserStatus });
        }

        [HttpPost]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return Json(new { success = false });
            _db.Users.Remove(user);
            await _db.SaveChangesAsync();
            return Json(new { success = true });
        }

        [HttpPost]
        public async Task<IActionResult> UpdateBalance(int id, long balance)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return Json(new { success = false });
            user.Balance = balance;
            await _db.SaveChangesAsync();
            await _hub.Clients.Group($"user_{user.Username}").SendAsync("BalanceUpdate", new { balance });
            return Json(new { success = true });
        }

        // ─── DEPOSITS ───────────────────────────────────────────
        public async Task<IActionResult> Deposits()
        {
            var deposits = await _db.Deposits.Include(d => d.User).OrderByDescending(d => d.CreatedAt).ToListAsync();
            return View(deposits);
        }

        [HttpPost]
        public async Task<IActionResult> ApproveDeposit(int id)
        {
            var dep = await _db.Deposits.Include(d => d.User).FirstOrDefaultAsync(d => d.Id == id);
            if (dep == null || dep.Status != "Pending") return Json(new { success = false });

            dep.Status = "Success";
            dep.ProcessedAt = DateTime.UtcNow;
            if (dep.User != null)
            {
                dep.User.Balance += dep.Amount;
                dep.User.HasDeposited = true;
                await _hub.Clients.Group($"user_{dep.User.Username}").SendAsync("DepositApproved", new { amount = dep.Amount, balance = dep.User.Balance });
            }
            await _db.SaveChangesAsync();
            return Json(new { success = true });
        }

        [HttpPost]
        public async Task<IActionResult> RejectDeposit(int id)
        {
            var dep = await _db.Deposits.FindAsync(id);
            if (dep == null || dep.Status != "Pending") return Json(new { success = false });
            dep.Status = "Failed";
            dep.ProcessedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Json(new { success = true });
        }

        // ─── WITHDRAWS ──────────────────────────────────────────
        public async Task<IActionResult> Withdraws()
        {
            var withdraws = await _db.Withdraws.Include(w => w.User).OrderByDescending(w => w.CreatedAt).ToListAsync();
            return View(withdraws);
        }

        [HttpPost]
        public async Task<IActionResult> ApproveWithdraw(int id)
        {
            var wit = await _db.Withdraws.Include(w => w.User).FirstOrDefaultAsync(w => w.Id == id);
            if (wit == null) return Json(new { success = false });

            if (wit.Status == "Đang xử lý") wit.Status = "Đang chuyển";
            else if (wit.Status == "Đang chuyển") wit.Status = "Hoàn thành";

            wit.ProcessedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            if (wit.User != null)
                await _hub.Clients.Group($"user_{wit.User.Username}").SendAsync("WithdrawUpdated", new { status = wit.Status });

            return Json(new { success = true });
        }

        [HttpPost]
        public async Task<IActionResult> RejectWithdraw(int id)
        {
            var wit = await _db.Withdraws.Include(w => w.User).FirstOrDefaultAsync(w => w.Id == id);
            if (wit == null || wit.Status == "Hoàn thành" || wit.Status == "Bị từ chối") return Json(new { success = false });

            if (wit.User != null)
            {
                wit.User.Balance += wit.Amount;
                await _hub.Clients.Group($"user_{wit.User.Username}").SendAsync("BalanceUpdate", new { balance = wit.User.Balance });
            }
            wit.Status = "Bị từ chối";
            wit.ProcessedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Json(new { success = true });
        }

        // ─── GAME CONTROL ───────────────────────────────────────
        public IActionResult GameControl()
        {
            var state = _engine.State;
            var vm = new AdminGameControlViewModel
            {
                CurrentPhase = state.Phase,
                TimeLeft = state.TimeLeft,
                CurrentOverride = state.ResultOverride,
                GameHistory = state.GameHistory,
                TotalBetLeft = state.TotalBetLeft,
                TotalBetRight = state.TotalBetRight
            };
            return View(vm);
        }

        [HttpPost]
        public IActionResult SetResult(string mode)
        {
            _engine.SetResultOverride(mode);
            return Json(new { success = true });
        }

        // ─── SYSTEM CONFIG ──────────────────────────────────────
        public async Task<IActionResult> Config()
        {
            var configs = await _db.SystemConfigs.OrderBy(c => c.Id).ToListAsync();
            return View(configs);
        }

        [HttpPost]
        public async Task<IActionResult> UpdateConfig(int id, string value)
        {
            var config = await _db.SystemConfigs.FindAsync(id);
            if (config == null) return Json(new { success = false });
            config.ConfigValue = value;
            config.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Json(new { success = true });
        }
    }
}
