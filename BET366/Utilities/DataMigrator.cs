using Microsoft.EntityFrameworkCore;
using BET366.Data;
using BET366.Models;

namespace BET366.Utilities
{
    public static class DataMigrator
    {
        public static async Task MigrateData(string sqlServerConn, string pgConn)
        {
            Console.WriteLine("🚀 Starting Data Migration: SQL Server -> PostgreSQL...");

            var sqlOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(sqlServerConn)
                .Options;

            var pgOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseNpgsql(pgConn)
                .Options;

            using var sqlDb = new ApplicationDbContext(sqlOptions);
            using var pgDb = new ApplicationDbContext(pgOptions);

            // Ensure PG schema is ready
            Console.WriteLine("📦 Ensuring PostgreSQL schema exists...");
            await pgDb.Database.EnsureCreatedAsync();

            // 1. Users
            Console.WriteLine("👥 Migrating Users...");
            var users = await sqlDb.Users.AsNoTracking().ToListAsync();
            foreach (var u in users)
            {
                if (!await pgDb.Users.AnyAsync(x => x.Username == u.Username))
                {
                    u.Id = 0; // Let PG generate new ID
                    pgDb.Users.Add(u);
                }
            }
            await pgDb.SaveChangesAsync();

            // 2. SystemConfigs
            Console.WriteLine("⚙️ Migrating SystemConfigs...");
            var configs = await sqlDb.SystemConfigs.AsNoTracking().ToListAsync();
            foreach (var c in configs)
            {
                if (!await pgDb.SystemConfigs.AnyAsync(x => x.ConfigKey == c.ConfigKey))
                {
                    c.Id = 0;
                    pgDb.SystemConfigs.Add(c);
                }
            }
            await pgDb.SaveChangesAsync();

            // 3. GameSessions (Keep only last 50 for speed)
            Console.WriteLine("🎲 Migrating GameSessions...");
            var sessions = await sqlDb.GameSessions.AsNoTracking().OrderByDescending(s => s.Id).Take(50).ToListAsync();
            foreach (var s in sessions)
            {
                if (!await pgDb.GameSessions.AnyAsync(x => x.SessionCode == s.SessionCode))
                {
                    s.Id = 0;
                    pgDb.GameSessions.Add(s);
                }
            }
            await pgDb.SaveChangesAsync();

            Console.WriteLine("✅ Data Migration Completed!");
        }
    }
}
