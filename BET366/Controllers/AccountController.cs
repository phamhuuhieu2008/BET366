using BET366.Data;
using BET366.Models.ViewModels;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BET366.Controllers
{
    public class AccountController : Controller
    {
        private readonly ApplicationDbContext _db;

        public AccountController(ApplicationDbContext db)
        {
            _db = db;
        }

        [HttpGet]
        public IActionResult Login()
        {
            if (User.Identity?.IsAuthenticated == true) return RedirectToAction("Index", "Home");
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            if (string.IsNullOrEmpty(model.Username) || string.IsNullOrEmpty(model.Password))
            {
                ViewBag.Error = "Vui lòng nhập đầy đủ!";
                return View(model);
            }

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == model.Username);
            if (user == null || !BCrypt.Net.BCrypt.Verify(model.Password, user.PasswordHash))
            {
                ViewBag.Error = "Sai tài khoản hoặc mật khẩu!";
                return View(model);
            }

            if (user.UserStatus == 3)
            {
                ViewBag.Error = "Tài khoản bị khóa!";
                return View(model);
            }

            var role = user.UserStatus == 1 ? "Admin" : "User";
            var claims = new List<Claim>
            {
                new(ClaimTypes.Name, user.Username),
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Role, role)
            };

            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7) });

            if (user.UserStatus == 1)
            {
                return RedirectToAction("Index", "Admin");
            }
            return RedirectToAction("Index", "Home");
        }

        [HttpGet]
        public IActionResult Register()
        {
            if (User.Identity?.IsAuthenticated == true) return RedirectToAction("Index", "Home");
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            if (string.IsNullOrEmpty(model.Username) || model.Username.Length < 4)
            {
                ViewBag.Error = "Tên đăng nhập tối thiểu 4 ký tự";
                return View(model);
            }
            if (string.IsNullOrEmpty(model.Password) || model.Password.Length < 4)
            {
                ViewBag.Error = "Mật khẩu tối thiểu 4 ký tự";
                return View(model);
            }
            if (model.Password != model.ConfirmPassword)
            {
                ViewBag.Error = "Mật khẩu nhập lại không khớp";
                return View(model);
            }

            if (await _db.Users.AnyAsync(u => u.Username == model.Username))
            {
                ViewBag.Error = "Tài khoản đã tồn tại!";
                return View(model);
            }

            var defaultBalance = await _db.SystemConfigs.FirstOrDefaultAsync(c => c.ConfigKey == "DefaultBalance");
            var balance = long.TryParse(defaultBalance?.ConfigValue, out var b) ? b : 10000;

            _db.Users.Add(new Models.User
            {
                Username = model.Username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(model.Password),
                Balance = balance
            });
            await _db.SaveChangesAsync();

            TempData["Success"] = "Đăng ký thành công! Hãy đăng nhập.";
            return RedirectToAction("Login");
        }

        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return RedirectToAction("Login");
        }
    }
}
