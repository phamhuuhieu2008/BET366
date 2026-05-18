using BET366.Data;
using BET366.Hubs;
using BET366.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

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

// Check for migration flag
if (args.Contains("--migrate"))
{
    using (var scope = app.Services.CreateScope())
    {
        var sqlServerConn = builder.Configuration.GetConnectionString("SqlServerSource")
                            ?? "Server=(localdb)\\MSSQLLocalDB;Database=BET366DB;Trusted_Connection=True;TrustServerCertificate=True;";
        var pgConn = builder.Configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrEmpty(pgConn))
        {
            throw new InvalidOperationException("DefaultConnection connection string is not configured in appsettings.json.");
        }
        await BET366.Utilities.DataMigrator.MigrateData(sqlServerConn, pgConn);
    }
    return; // Exit after migration
}

// Auto-migrate and Seed Data
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var db = services.GetRequiredService<ApplicationDbContext>();

    // Fix Database Schema if needed (PostgreSQL syntax)
    try
    {
        db.Database.ExecuteSqlRaw(@"
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='UserStatus') THEN 
                    ALTER TABLE ""Users"" ADD COLUMN ""UserStatus"" INTEGER NOT NULL DEFAULT 2; 
                END IF; 
            END $$;");

        db.Database.ExecuteSqlRaw(@"
            DO $$ 
            BEGIN 
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='IsLocked') THEN 
                    ALTER TABLE ""Users"" DROP COLUMN ""IsLocked""; 
                END IF; 
            END $$;");

        db.Database.ExecuteSqlRaw(@"
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Deposits' AND column_name='SenderName') THEN 
                    ALTER TABLE ""Deposits"" ADD COLUMN ""SenderName"" VARCHAR(100) NULL; 
                END IF; 
            END $$;");

        // SlotHistories Table
        try
        {
            db.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS ""SlotHistories"" (
                    ""Id"" SERIAL PRIMARY KEY,
                    ""UserId"" INTEGER NOT NULL REFERENCES ""Users""(""Id"") ON DELETE CASCADE,
                    ""BetAmount"" BIGINT NOT NULL,
                    ""ResultGrid"" TEXT NOT NULL,
                    ""WinAmount"" BIGINT NOT NULL,
                    ""IsJackpot"" BOOLEAN NOT NULL,
                    ""CreatedAt"" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );");
        }
        catch { }

        // Jackpot Config
        try
        {
            db.Database.ExecuteSqlRaw(@"
                INSERT INTO ""SystemConfigs"" (""Id"", ""ConfigKey"", ""ConfigValue"", ""Description"", ""UpdatedAt"") 
                SELECT 15, 'JackpotValue', '100000000', 'Giá trị nổ hũ', CURRENT_TIMESTAMP
                WHERE NOT EXISTS (SELECT 1 FROM ""SystemConfigs"" WHERE ""ConfigKey"" = 'JackpotValue');");
        }
        catch { }

        // Xoc Dia Config
        try
        {
            db.Database.ExecuteSqlRaw(@"
                INSERT INTO ""SystemConfigs"" (""Id"", ""ConfigKey"", ""ConfigValue"", ""Description"", ""UpdatedAt"") 
                SELECT 16, 'XocDiaBettingDuration', '30', 'Thời gian đặt cược Xóc Đĩa (giây)', CURRENT_TIMESTAMP
                WHERE NOT EXISTS (SELECT 1 FROM ""SystemConfigs"" WHERE ""ConfigKey"" = 'XocDiaBettingDuration');");
        }
        catch { }
        // Bau Cua Config
        try
        {
            db.Database.ExecuteSqlRaw(@"
                INSERT INTO ""SystemConfigs"" (""Id"", ""ConfigKey"", ""ConfigValue"", ""Description"", ""UpdatedAt"") 
                SELECT 17, 'BauCuaBettingDuration', '35', 'Thời gian đặt cược Bầu Cua (giây)', CURRENT_TIMESTAMP
                WHERE NOT EXISTS (SELECT 1 FROM ""SystemConfigs"" WHERE ""ConfigKey"" = 'BauCuaBettingDuration');");
        }
        catch { }
    }
    catch (Exception ex) { Console.WriteLine("⚠️ DB Patch error: " + ex.Message); }

    try
    {
        db.Database.EnsureCreated(); // Ensure schema exists for new DB
    }
    catch (Exception ex)
    {
        Console.WriteLine($"⚠️ DB EnsureCreated warning: {ex.Message}");
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
        else if (adminUser.UserStatus != 1)
        {
            adminUser.UserStatus = 1;
            db.SaveChanges();
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
