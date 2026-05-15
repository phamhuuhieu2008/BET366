using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BET366.Models
{
    public class BetHistory
    {
        public int Id { get; set; }

        public int UserId { get; set; }
        public int GameSessionId { get; set; }

        [Required, MaxLength(10)]
        public string Side { get; set; } = string.Empty; // "left" (Xỉu) / "right" (Tài)

        public long Amount { get; set; }

        [MaxLength(20)]
        public string Result { get; set; } = "Đang chờ";

        public long WinAmount { get; set; } = 0;
        public int? Dice1 { get; set; }
        public int? Dice2 { get; set; }
        public int? Dice3 { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        [ForeignKey("UserId")]
        public User? User { get; set; }

        [ForeignKey("GameSessionId")]
        public GameSession? GameSession { get; set; }
    }
}
