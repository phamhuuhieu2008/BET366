using System.ComponentModel.DataAnnotations;

namespace BET366.Models
{
    public class GameSession
    {
        public int Id { get; set; }

        [Required, MaxLength(20)]
        public string SessionCode { get; set; } = string.Empty;

        public int? Dice1 { get; set; }
        public int? Dice2 { get; set; }
        public int? Dice3 { get; set; }
        public int? Total { get; set; }

        [MaxLength(10)]
        public string? Result { get; set; } // "tai" or "xiu"

        [MaxLength(20)]
        public string Phase { get; set; } = "betting";

        [MaxLength(10)]
        public string ResultOverride { get; set; } = "random";

        public DateTime StartTime { get; set; } = DateTime.UtcNow;
        public DateTime? EndTime { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public ICollection<BetHistory> BetHistories { get; set; } = new List<BetHistory>();
    }
}
