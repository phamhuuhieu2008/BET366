using System.ComponentModel.DataAnnotations;

namespace BET366.Models
{
    public class SystemConfig
    {
        public int Id { get; set; }

        [Required, MaxLength(100)]
        public string ConfigKey { get; set; } = string.Empty;

        [Required, MaxLength(500)]
        public string ConfigValue { get; set; } = string.Empty;

        [MaxLength(200)]
        public string? Description { get; set; }

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
