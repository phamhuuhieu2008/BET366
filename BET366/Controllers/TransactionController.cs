using BET366.Data;
using BET366.Hubs;
using BET366.Models;
using BET366.Models.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BET366.Controllers
{
    [Authorize]
    public class TransactionController : Controller
    {
        private readonly ApplicationDbContext _db;
        private readonly IHubContext<GameHub> _hub;

        public TransactionController(ApplicationDbContext db, IHubContext<GameHub> hub)
        {
            _db = db;
            _hub = hub;
        }

        [HttpPost]
        public async Task<IActionResult> Deposit([FromBody] DepositViewModel model)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var username = User.FindFirstValue(ClaimTypes.Name)!;

            var minDep = await _db.SystemConfigs.FirstOrDefaultAsync(c => c.ConfigKey == "MinDeposit");
            var minAmount = long.TryParse(minDep?.ConfigValue, out var m) ? m : 10000;
            if (model.Amount < minAmount)
                return Json(new { success = false, message = $"Số tiền tối thiểu {minAmount:N0}đ" });

            var bankAccount = await _db.SystemConfigs.FirstOrDefaultAsync(c => c.ConfigKey == "BankAccount");

            _db.Deposits.Add(new Deposit
            {
                UserId = userId,
                Amount = model.Amount,
                TransferCode = model.TransferCode,
                SenderName = model.SenderName
            });
            await _db.SaveChangesAsync();

            // Notify admin
            await _hub.Clients.Group("admin").SendAsync("NewDeposit", new { username, amount = model.Amount });

            return Json(new { success = true, message = "Hệ thống đã nhận thông tin, vui lòng chờ giây lát để xử lý." });
        }

        [HttpPost]
        public async Task<IActionResult> Withdraw([FromBody] WithdrawViewModel model)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var username = User.FindFirstValue(ClaimTypes.Name)!;
            var user = await _db.Users.FindAsync(userId);

            if (user == null) return Json(new { success = false, message = "Người dùng không tồn tại" });
            if (!user.HasDeposited) return Json(new { success = false, message = "Bạn phải nạp tiền lần đầu và được Admin duyệt mới có thể rút tiền!" });

            var minWd = await _db.SystemConfigs.FirstOrDefaultAsync(c => c.ConfigKey == "MinWithdraw");
            var minAmount = long.TryParse(minWd?.ConfigValue, out var m) ? m : 50000;
            if (model.Amount < minAmount) return Json(new { success = false, message = $"Tối thiểu {minAmount:N0}đ" });
            if (user.Balance < model.Amount) return Json(new { success = false, message = "Số dư không đủ!" });

            user.Balance -= model.Amount;
            _db.Withdraws.Add(new Withdraw
            {
                UserId = userId,
                Amount = model.Amount,
                BankName = model.BankName,
                AccountNumber = model.AccountNumber,
                AccountHolder = model.AccountHolder
            });
            await _db.SaveChangesAsync();

            await _hub.Clients.Group("admin").SendAsync("NewWithdraw", new { username, amount = model.Amount });

            return Json(new { success = true, balance = user.Balance });
        }

        [HttpPost]
        public async Task<IActionResult> CancelDeposit(int id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var dep = await _db.Deposits.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId);
            if (dep == null || dep.Status != "Pending") return Json(new { success = false, message = "Không thể hủy yêu cầu này" });

            dep.Status = "Bị hủy";
            dep.ProcessedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Json(new { success = true, message = "Đã hủy yêu cầu nạp tiền" });
        }

        [HttpPost]
        public async Task<IActionResult> CancelWithdraw(int id)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var wit = await _db.Withdraws.FirstOrDefaultAsync(w => w.Id == id && w.UserId == userId);
            if (wit == null) return Json(new { success = false, message = "Yêu cầu không tồn tại" });
            
            if (wit.Status == "Đang chuyển") return Json(new { success = false, message = "Lệnh đang được chuyển tiền, không thể hủy!" });
            if (wit.Status != "Đang xử lý") return Json(new { success = false, message = "Không thể hủy yêu cầu này" });

            var user = await _db.Users.FindAsync(userId);
            if (user != null)
            {
                user.Balance += wit.Amount;
                await _hub.Clients.Group($"user_{user.Username}").SendAsync("BalanceUpdate", new { balance = user.Balance });
            }

            wit.Status = "Bị hủy";
            wit.ProcessedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Json(new { success = true, message = "Đã hủy lệnh rút tiền, tiền đã được hoàn lại" });
        }

        [HttpGet]
        public async Task<IActionResult> GetBankInfo()
        {
            var configs = await _db.SystemConfigs
                .Where(c => c.ConfigKey == "BankName" || c.ConfigKey == "BankAccount" || c.ConfigKey == "BankHolder" || c.ConfigKey == "BankCode")
                .ToDictionaryAsync(c => c.ConfigKey, c => c.ConfigValue);

            return Json(new
            {
                bankName = configs.GetValueOrDefault("BankName", "Ngân hàng Bản Việt"),
                bankAccount = configs.GetValueOrDefault("BankAccount", "99ZP24249M42049701"),
                bankHolder = configs.GetValueOrDefault("BankHolder", "PHAM HUU HIEU"),
                bankCode = configs.GetValueOrDefault("BankCode", "VCCB")
            });
        }
    }
}
