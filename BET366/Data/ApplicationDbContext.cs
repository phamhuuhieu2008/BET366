using Microsoft.EntityFrameworkCore;

namespace BET366.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

        public DbSet<Models.User> Users { get; set; }
        public DbSet<Models.GameSession> GameSessions { get; set; }
        public DbSet<Models.BetHistory> BetHistories { get; set; }
        public DbSet<Models.Deposit> Deposits { get; set; }
        public DbSet<Models.Withdraw> Withdraws { get; set; }
        public DbSet<Models.SlotHistory> SlotHistories { get; set; }
        public DbSet<Models.SystemConfig> SystemConfigs { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User
            modelBuilder.Entity<Models.User>(e =>
            {
                e.HasIndex(u => u.Username).IsUnique();
            });

            // GameSession
            modelBuilder.Entity<Models.GameSession>(e =>
            {
                e.HasIndex(g => g.SessionCode).IsUnique();
            });

            // SystemConfig
            modelBuilder.Entity<Models.SystemConfig>(e =>
            {
                e.HasIndex(s => s.ConfigKey).IsUnique();
            });

            // Seed default SystemConfigs - dùng giá trị tĩnh, không dùng DateTime.UtcNow
            var fixedDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

            modelBuilder.Entity<Models.SystemConfig>().HasData(
                new Models.SystemConfig { Id = 1, ConfigKey = "BettingDuration", ConfigValue = "40", Description = "Thời gian đặt cược (giây)", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 2, ConfigKey = "RollingDuration", ConfigValue = "10", Description = "Thời gian xem kết quả (giây)", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 3, ConfigKey = "MinBet", ConfigValue = "1000", Description = "Tiền cược tối thiểu", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 4, ConfigKey = "MaxBet", ConfigValue = "10000000", Description = "Tiền cược tối đa", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 5, ConfigKey = "DefaultBalance", ConfigValue = "10000", Description = "Số dư mặc định khi đăng ký", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 6, ConfigKey = "MinDeposit", ConfigValue = "10000", Description = "Nạp tối thiểu", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 7, ConfigKey = "MinWithdraw", ConfigValue = "50000", Description = "Rút tối thiểu", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 8, ConfigKey = "WinMultiplier", ConfigValue = "2", Description = "Hệ số thắng (x2)", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 9, ConfigKey = "BankName", ConfigValue = "Ngân hàng Bản Việt", Description = "Tên ngân hàng nhận nạp", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 10, ConfigKey = "BankAccount", ConfigValue = "99ZP24249M42049701", Description = "Số tài khoản ngân hàng", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 11, ConfigKey = "BankHolder", ConfigValue = "PHAM HUU HIEU", Description = "Chủ tài khoản", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 12, ConfigKey = "FakeBetEnabled", ConfigValue = "true", Description = "Bật/tắt tiền cược ảo", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 13, ConfigKey = "MaxFakeBetTotal", ConfigValue = "2000000000", Description = "Giới hạn cược ảo", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 14, ConfigKey = "BankCode", ConfigValue = "VCCB", Description = "Mã ngân hàng VietQR", UpdatedAt = fixedDate },
                new Models.SystemConfig { Id = 15, ConfigKey = "JackpotValue", ConfigValue = "100000000", Description = "Giá trị nổ hũ khởi tạo", UpdatedAt = fixedDate }
            );

            // User seeding moved to Program.cs for reliability
        }
    }
}
