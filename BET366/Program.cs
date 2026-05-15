using BET366.Data;
using BET366.Hubs;
using BET366.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Authentication
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.LogoutPath = "/Account/Logout";
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
    });

// SignalR
builder.Services.AddSignalR();

// Game services (Singleton - shared state)
builder.Services.AddSingleton<GameEngineService>();
builder.Services.AddHostedService<GameTimerService>();

builder.Services.AddControllersWithViews();

var app = builder.Build();

// Auto-migrate and Seed Data
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var db = services.GetRequiredService<ApplicationDbContext>();
    
    // Fix Database Schema if needed
    try {
        db.Database.ExecuteSqlRaw("IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[Users]') AND name = 'UserStatus') BEGIN ALTER TABLE [Users] ADD [UserStatus] INT NOT NULL DEFAULT 2; END");
        db.Database.ExecuteSqlRaw("IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[Users]') AND name = 'IsLocked') BEGIN ALTER TABLE [Users] DROP COLUMN [IsLocked]; END");
        db.Database.ExecuteSqlRaw("IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[Users]') AND name = 'Role') BEGIN ALTER TABLE [Users] DROP COLUMN [Role]; END");
        
        // Fix for Deposit table missing SenderName
        db.Database.ExecuteSqlRaw("IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[Deposits]') AND name = 'SenderName') BEGIN ALTER TABLE [Deposits] ADD [SenderName] NVARCHAR(100) NULL; END");
        
        // SlotHistories Table
        try {
            db.Database.ExecuteSqlRaw(@"
                IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[SlotHistories]') AND type in (N'U'))
                BEGIN
                    CREATE TABLE [SlotHistories] (
                        [Id] INT IDENTITY(1,1) NOT NULL,
                        [UserId] INT NOT NULL,
                        [BetAmount] BIGINT NOT NULL,
                        [ResultGrid] NVARCHAR(MAX) NOT NULL,
                        [WinAmount] BIGINT NOT NULL,
                        [IsJackpot] BIT NOT NULL,
                        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
                        CONSTRAINT [PK_SlotHistories] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_SlotHistories_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
                    );
                END");
        } catch { }

        // Jackpot Config
        try {
            db.Database.ExecuteSqlRaw("IF NOT EXISTS (SELECT * FROM [SystemConfigs] WHERE [ConfigKey] = 'JackpotValue') BEGIN INSERT INTO [SystemConfigs] (ConfigKey, ConfigValue, Description, UpdatedAt) VALUES ('JackpotValue', '100000000', 'Giá trị nổ hũ', GETDATE()); END");
        } catch { }
    } catch (Exception ex) { Console.WriteLine("⚠️ DB Patch error: " + ex.Message); }
    
    try 
    {
        db.Database.Migrate();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"⚠️ EF Migration warning (can be ignored if schema is patched): {ex.Message}");
    }
    
    try
    {
        // Manual Seed Check - Rename or Create Admin
        var adminUser = db.Users.FirstOrDefault(u => u.Username == "admin" || u.Username == "0708069602");
        if (adminUser == null)
        {
            db.Users.Add(new BET366.Models.User
            {
                Username = "0708069602",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("0708069602"),
                Balance = 99999999,
                UserStatus = 1, // Admin
                FullName = "Administrator",
                HasDeposited = true
            });
            db.SaveChanges();
            Console.WriteLine("✅ Đã tạo tài khoản Admin 0708069602.");
        }
         if (adminUser != null)
        {
            adminUser.Username = "0708069602";
            adminUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword("0708069602");
            adminUser.UserStatus = 1;
            db.SaveChanges();
            Console.WriteLine("✅ Đã cập nhật Admin 0708069602.");
        }

        // Seed System Config
        if (!db.SystemConfigs.Any())
        {
            db.SystemConfigs.AddRange(new List<BET366.Models.SystemConfig>
            {
                new() { ConfigKey = "BankName", ConfigValue = "MB Bank", UpdatedAt = DateTime.UtcNow },
                new() { ConfigKey = "BankCode", ConfigValue = "MB", UpdatedAt = DateTime.UtcNow },
                new() { ConfigKey = "BankAccount", ConfigValue = "0708069602", UpdatedAt = DateTime.UtcNow },
                new() { ConfigKey = "BankHolder", ConfigValue = "PHAM HUU HIEU", UpdatedAt = DateTime.UtcNow }
            });
            db.SaveChanges();
            Console.WriteLine("✅ Đã khởi tạo cấu hình Ngân hàng.");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ Lỗi khi khởi tạo DB: {ex.Message}");
    }
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

// SignalR Hub
app.MapHub<GameHub>("/gamehub");

Console.WriteLine("========================================");
Console.WriteLine("🎲 BET366 SERVER ĐANG CHẠY THÀNH CÔNG!");
Console.WriteLine("========================================");

app.Run();
