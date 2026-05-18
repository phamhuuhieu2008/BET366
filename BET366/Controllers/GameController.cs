using BET366.Data;
using BET366.Models.ViewModels;
using BET366.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BET366.Controllers
{
    [Authorize]
    public class GameController : Controller
    {
        private readonly ApplicationDbContext _db;
        private readonly GameEngineService _engine;

        public GameController(ApplicationDbContext db, GameEngineService engine)
        {
            _db = db;
            _engine = engine;
        }

        [HttpGet]
        public async Task<IActionResult> GetState()
        {
            var username = User.FindFirstValue(ClaimTypes.Name);
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (user == null) return Unauthorized();

            var state = _engine.State;
            var currentBet = await _db.BetHistories
                .Where(b => b.UserId == user.Id && b.GameSessionId == state.CurrentSessionId)
                .Select(b => new { b.Side, b.Amount })
                .FirstOrDefaultAsync();

            return Json(new
            {
                success = true,
                timeLeft = state.TimeLeft,
                phase = state.Phase,
                balance = user.Balance,
                isLocked = user.UserStatus == 3,
                gameHistory = state.GameHistory,
                totalBets = new { left = state.TotalBetLeft, right = state.TotalBetRight },
                currentUserBet = currentBet
            });
        }

        [HttpGet]
        public async Task<IActionResult> GetBetHistory()
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var bets = await _db.BetHistories
                .Where(b => b.UserId == userId)
                .OrderByDescending(b => b.CreatedAt)
                .Take(50)
                .Select(b => new
                {
                    b.Id,
                    b.Side,
                    b.Amount,
                    b.Result,
                    b.WinAmount,
                    dice = new[] { b.Dice1, b.Dice2, b.Dice3 },
                    time = b.CreatedAt
                })
                .ToListAsync();

            return Json(new { success = true, betHistory = bets });
        }

        [HttpGet]
        public async Task<IActionResult> GetDepositHistory()
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var deposits = await _db.Deposits
                .Where(d => d.UserId == userId)
                .OrderByDescending(d => d.CreatedAt)
                .Take(50)
                .Select(d => new { d.Id, d.Amount, d.Status, time = d.CreatedAt })
                .ToListAsync();

            return Json(new { success = true, depositHistory = deposits });
        }

        [HttpGet]
        public async Task<IActionResult> GetWithdrawHistory()
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var withdraws = await _db.Withdraws
                .Where(w => w.UserId == userId)
                .OrderByDescending(w => w.CreatedAt)
                .Take(50)
                .Select(w => new { w.Id, w.Amount, w.Status, w.BankName, w.AccountNumber, time = w.CreatedAt })
                .ToListAsync();

            return Json(new { success = true, withdrawHistory = withdraws });
        }

        [HttpGet]
        public async Task<IActionResult> Leaderboard()
        {
            var top = await _db.Users
                .Where(u => u.UserStatus == 2)
                .OrderByDescending(u => u.Balance)
                .Take(3)
                .Select(u => new { u.Username, u.Balance })
                .ToListAsync();

            return Json(new { success = true, leaderboard = top });
        }

        [HttpGet]
        public async Task<IActionResult> GetDetailedHistory()
        {
            var sessions = await _db.GameSessions
                .Where(s => s.Total != null)
                .OrderByDescending(s => s.CreatedAt)
                .Take(60)
                .Select(s => new
                {
                    s.SessionCode,
                    s.Dice1,
                    s.Dice2,
                    s.Dice3,
                    s.Total,
                    s.Result
                })
                .ToListAsync();
            
            sessions.Reverse(); // Show chronological order on chart
            return Json(new { success = true, history = sessions });
        }
    }
}
