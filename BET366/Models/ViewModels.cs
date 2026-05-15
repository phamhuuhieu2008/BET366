namespace BET366.Models.ViewModels
{
    public class LoginViewModel
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class RegisterViewModel
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string ConfirmPassword { get; set; } = string.Empty;
    }

    public class ProfileViewModel
    {
        public string Username { get; set; } = string.Empty;
        public long Balance { get; set; }
        public string? FullName { get; set; }
        public string? Phone { get; set; }
        public string? AvatarUrl { get; set; }
    }

    public class DepositViewModel
    {
        public long Amount { get; set; }
        public string? TransferCode { get; set; }
        public string? SenderName { get; set; }
    }

    public class WithdrawViewModel
    {
        public long Amount { get; set; }
        public string BankName { get; set; } = string.Empty;
        public string AccountNumber { get; set; } = string.Empty;
        public string AccountHolder { get; set; } = string.Empty;
    }

    public class PlaceBetRequest
    {
        public string Side { get; set; } = string.Empty;
        public long Amount { get; set; }
    }

    public class AdminDashboardViewModel
    {
        public int TotalUsers { get; set; }
        public int OnlineUsers { get; set; }
        public long TotalDepositToday { get; set; }
        public long TotalWithdrawToday { get; set; }
        public List<Deposit> RecentDeposits { get; set; } = new();
        public List<Withdraw> RecentWithdraws { get; set; } = new();
    }

    public class AdminGameControlViewModel
    {
        public string CurrentPhase { get; set; } = "betting";
        public int TimeLeft { get; set; }
        public string CurrentOverride { get; set; } = "random";
        public List<string> GameHistory { get; set; } = new();
        public long TotalBetLeft { get; set; }
        public long TotalBetRight { get; set; }
    }
}
