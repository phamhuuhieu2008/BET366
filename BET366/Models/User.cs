using System.ComponentModel.DataAnnotations;

namespace BET366.Models
{
    public class User
    {
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string Username { get; set; } = string.Empty;

        [Required, MaxLength(256)]
        public string PasswordHash { get; set; } = string.Empty;

        public long Balance { get; set; } = 10000;
        public int UserStatus { get; set; } = 2; // 1: Admin, 2: User, 3: Locked
        public bool HasDeposited { get; set; } = false;

        [MaxLength(100)]
        public string? FullName { get; set; }

        [MaxLength(15)]
        public string? Phone { get; set; }

        [MaxLength(500)]
        public string? AvatarUrl { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public ICollection<BetHistory> BetHistories { get; set; } = new List<BetHistory>();
        public ICollection<Deposit> Deposits { get; set; } = new List<Deposit>();
        public ICollection<Withdraw> Withdraws { get; set; } = new List<Withdraw>();
    }
}
