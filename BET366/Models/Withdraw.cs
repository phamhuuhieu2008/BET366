using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BET366.Models
{
    public class Withdraw
    {
        public int Id { get; set; }

        public int UserId { get; set; }
        public long Amount { get; set; }

        [Required, MaxLength(100)]
        public string BankName { get; set; } = string.Empty;

        [Required, MaxLength(50)]
        public string AccountNumber { get; set; } = string.Empty;

        [Required, MaxLength(100)]
        public string AccountHolder { get; set; } = string.Empty;

        [MaxLength(20)]
        public string Status { get; set; } = "Đang xử lý";

        public int? ProcessedBy { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ProcessedAt { get; set; }

        // Navigation
        [ForeignKey("UserId")]
        public User? User { get; set; }
    }
}
