using System.ComponentModel.DataAnnotations;

namespace BET366.Models
{
    public class SlotHistory
    {
        [Key]
        public int Id { get; set; }
        public int UserId { get; set; }
        public User? User { get; set; }

        public long BetAmount { get; set; }
        public string ResultGrid { get; set; } = ""; // JSON string of 3x3 results
        public long WinAmount { get; set; }
        public bool IsJackpot { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
