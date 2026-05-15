namespace BET366.Services
{
    public class GameState
    {
        public int TimeLeft { get; set; } = 40;
        public string Phase { get; set; } = "betting"; // "betting" or "rolling"
        public int[] Dice { get; set; } = { 1, 2, 3 };
        public int Total { get; set; } = 6;
        public string ResultOverride { get; set; } = "random";
        public long TotalBetLeft { get; set; } = 0;
        public long TotalBetRight { get; set; } = 0;
        public string HeavySide { get; set; } = "left";
        public List<string> GameHistory { get; set; } = new();
        public int CurrentSessionId { get; set; } = 0;
    }

    public class GameEngineService
    {
        private readonly GameState _state = new();
        private readonly Random _rng = new();
        private readonly object _lock = new();

        public GameState State => _state;

        public void SetResultOverride(string mode)
        {
            lock (_lock) { _state.ResultOverride = mode; }
        }

        public (int d1, int d2, int d3, int total) RollDice()
        {
            lock (_lock)
            {
                int d1, d2, d3;
                var mode = _state.ResultOverride;

                do
                {
                    d1 = _rng.Next(1, 7);
                    d2 = _rng.Next(1, 7);
                    d3 = _rng.Next(1, 7);
                } while (
                    (mode == "left" && (d1 + d2 + d3 < 4 || d1 + d2 + d3 > 10)) ||
                    (mode == "right" && (d1 + d2 + d3 < 11 || d1 + d2 + d3 > 17))
                );

                var total = d1 + d2 + d3;
                _state.Dice = new[] { d1, d2, d3 };
                _state.Total = total;
                _state.ResultOverride = "random"; // Reset after use

                var result = total >= 4 && total <= 10 ? "xiu" : "tai";
                _state.GameHistory.Add(result);
                if (_state.GameHistory.Count > 24) _state.GameHistory.RemoveAt(0);

                return (d1, d2, d3, total);
            }
        }

        public void ResetSession()
        {
            lock (_lock)
            {
                _state.Phase = "betting";
                _state.TimeLeft = 40;
                _state.HeavySide = _rng.Next(2) == 0 ? "left" : "right";

                var startAmt = _rng.Next(5000000, 15000000);
                var ratio = 0.68 + (_rng.NextDouble() * 0.04);
                if (_state.HeavySide == "left")
                {
                    _state.TotalBetLeft = startAmt;
                    _state.TotalBetRight = (long)(startAmt * ratio);
                }
                else
                {
                    _state.TotalBetRight = startAmt;
                    _state.TotalBetLeft = (long)(startAmt * ratio);
                }
            }
        }

        public void AddFakeBets()
        {
            lock (_lock)
            {
                if (_state.Phase != "betting" || _state.TimeLeft <= 0) return;

                long maxTotal = 2000000000;
                var ratio = 0.68 + (_rng.NextDouble() * 0.04);
                var heavyInc = _rng.Next(15000000, 45000000);
                var lightInc = (long)(heavyInc * ratio);

                if (_state.HeavySide == "left")
                {
                    if (_state.TotalBetLeft < maxTotal) _state.TotalBetLeft += heavyInc;
                    _state.TotalBetRight += lightInc;
                }
                else
                {
                    if (_state.TotalBetRight < maxTotal) _state.TotalBetRight += heavyInc;
                    _state.TotalBetLeft += lightInc;
                }
            }
        }

        public void AddRealBet(string side, long amount)
        {
            lock (_lock)
            {
                if (side == "left") _state.TotalBetLeft += amount;
                else _state.TotalBetRight += amount;
            }
        }
    }
}
