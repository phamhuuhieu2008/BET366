using BET366.Data;
using BET366.Models.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BET366.Controllers
{
    [Authorize]
    public class ProfileController : Controller
    {
        private readonly ApplicationDbContext _db;

        public ProfileController(ApplicationDbContext db)
        {
            _db = db;
        }

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var user = await _db.Users.FindAsync(userId);
            if (user == null) return Json(new { success = false });

            return Json(new
            {
                success = true,
                user = new
                {
                    user.Username,
                    user.Balance,
                    user.FullName,
                    user.Phone,
                    user.AvatarUrl
                }
            });
        }

        [HttpPost]
        public async Task<IActionResult> Update([FromBody] ProfileViewModel model)
        {
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var user = await _db.Users.FindAsync(userId);
            if (user == null || user.UserStatus == 3)
                return Json(new { success = false, message = "Tài khoản bị khóa hoặc không tồn tại" });

            if (string.IsNullOrWhiteSpace(model.FullName) || model.FullName.Length < 2)
                return Json(new { success = false, message = "Họ tên không hợp lệ" });
            if (string.IsNullOrWhiteSpace(model.Phone) || !System.Text.RegularExpressions.Regex.IsMatch(model.Phone, @"^\d{10,11}$"))
                return Json(new { success = false, message = "Số điện thoại phải là 10-11 chữ số" });

            user.FullName = model.FullName.Trim();
            user.Phone = model.Phone.Trim();
            user.UpdatedAt = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(model.AvatarUrl)) user.AvatarUrl = model.AvatarUrl;

            await _db.SaveChangesAsync();
            return Json(new { success = true, message = "Cập nhật thành công" });
        }
    }
}
