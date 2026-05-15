using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BET366.Models
{
    public class Deposit
    {
        public int Id { get; set; }

        public int UserId { get; set; }
        public long Amount { get; set; }

        [MaxLength(100)]
        public string? TransferCode { get; set; }
        
        [MaxLength(100)]
        public string? SenderName { get; set; }

        [MaxLength(20)]
        public string Status { get; set; } = "Pending";

        public int? ProcessedBy { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ProcessedAt { get; set; }

        // Navigation
        [ForeignKey("UserId")]
        public User? User { get; set; }
    }
}
