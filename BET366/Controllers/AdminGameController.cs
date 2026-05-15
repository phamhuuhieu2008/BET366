using BET366.Data;
using BET366.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace BET366.Controllers
{
    [Authorize(Roles = "Admin")] // Chỉ Admin mới được truy cập
    [Route("Admin/[controller]")]
    public class AdminGameController : Controller
    {
        private readonly ApplicationDbContext _db;
        private readonly GameEngineService _engine;

        public AdminGameController(ApplicationDbContext db, GameEngineService engine)
        {
            _db = db;
            _engine = engine;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            // Lấy tất cả các cấu hình liên quan đến game
            var gameConfigs = await _db.SystemConfigs
                .Where(c => c.ConfigKey == "BettingDuration" ||
                            c.ConfigKey == "RollingDuration" ||
                            c.ConfigKey == "MinBet" ||
                            c.ConfigKey == "MaxBet" ||
                            c.ConfigKey == "WinMultiplier" ||
                            c.ConfigKey == "XocDiaBettingDuration" ||
                            c.ConfigKey == "BauCuaBettingDuration" ||
                            c.ConfigKey == "JackpotValue" ||
                            c.ConfigKey == "FakeBetEnabled" ||
                            c.ConfigKey == "MaxFakeBetTotal")
                .OrderBy(c => c.ConfigKey)
                .ToListAsync();

            return View("GameSettings", gameConfigs);
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update([FromForm] Dictionary<string, string> configs)
        {
            foreach (var item in configs)
            {
                var configKey = item.Key;
                var configValue = item.Value;

                var existingConfig = await _db.SystemConfigs.FirstOrDefaultAsync(c => c.ConfigKey == configKey);
                if (existingConfig != null)
                {
                    existingConfig.ConfigValue = configValue;
                    existingConfig.UpdatedAt = System.DateTime.UtcNow;
                }
                // Nếu không tìm thấy, có thể thêm mới hoặc bỏ qua tùy logic mong muốn
            }

            await _db.SaveChangesAsync();

            TempData["SuccessMessage"] = "Cập nhật cài đặt trò chơi thành công!";
            return RedirectToAction(nameof(Index));
        }

        [HttpGet("Control")]
        public IActionResult Control()
        {
            return View("GameControl", _engine.State);
        }
    }
}