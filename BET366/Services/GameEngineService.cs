namespace BET366.Services
{
    public class XocDiaState
    {
        public int TimeLeft { get; set; } = 30;
        public string Phase { get; set; } = "betting";
        public int[] Coins { get; set; } = { 0, 0, 1, 1 };
        public List<string> History { get; set; } = new();
        public Dictionary<string, List<(string username, long amount)>> ActiveBets { get; set; } = new()
        {
            { "chan", new() }, { "le", new() }
        };
    }

    public class BauCuaState
    {
        public int TimeLeft { get; set; } = 35;
        public string Phase { get; set; } = "betting";
        public string[] Result { get; set; } = { "nai", "bau", "ga" };
        public List<string[]> History { get; set; } = new();
        public Dictionary<string, List<(string username, long amount)>> ActiveBets { get; set; } = new()
        {
            { "nai", new() }, { "bau", new() }, { "ga", new() }, { "ca", new() }, { "cua", new() }, { "tom", new() }
        };
    }

    public class GameState
    {
        public int TimeLeft { get; set; } = 40;
        public string Phase { get; set; } = "betting"; 
        public int[] Dice { get; set; } = { 1, 2, 3 };
        public int Total { get; set; } = 6;
        public string ResultOverride { get; set; } = "random";
        public string XocDiaOverride { get; set; } = "random";
        public string BauCuaOverride { get; set; } = "random";
        public long TotalBetLeft { get; set; } = 0;
        public long TotalBetRight { get; set; } = 0;
        public string HeavySide { get; set; } = "left";
        public List<string> GameHistory { get; set; } = new();
        public int CurrentSessionId { get; set; } = 0;

        public XocDiaState XocDia { get; set; } = new();
        public BauCuaState BauCua { get; set; } = new();
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

        public int[] RollXocDia()
        {
            lock (_lock)
            {
                var coins = new int[4];
                var mode = _state.XocDiaOverride;
                
                bool valid = false;
                int redCount = 0; // Khai báo biến redCount một lần duy nhất
                while (!valid) {
                    for (int i = 0; i < 4; i++) coins[i] = _rng.Next(0, 2);
                    redCount = 0; // Reset giá trị cho mỗi lần lặp
                    foreach(var c in coins) if(c == 1) redCount++;
                    string result = redCount % 2 == 0 ? "chan" : "le";
                    
                    if (mode == "random" || mode == result) valid = true;
                }

                _state.XocDia.Coins = coins;
                _state.XocDiaOverride = "random"; // Reset sau khi dùng
                _state.XocDia.Phase = "rolling";
                _state.XocDia.TimeLeft = 10;
                
                _state.XocDia.History.Add(redCount % 2 == 0 ? "chan" : "le");
                if (_state.XocDia.History.Count > 20) _state.XocDia.History.RemoveAt(0);
                
                return coins;
            }
        }

        public string[] RollBauCua()
        {
            lock (_lock)
            {
                string[] symbols = { "nai", "bau", "ga", "ca", "cua", "tom" };
                string[] res;
                var mode = _state.BauCuaOverride;

                if (mode != "random" && !string.IsNullOrEmpty(mode))
                {
                    res = mode.Split(',');
                    if (res.Length != 3) res = new[] { symbols[_rng.Next(6)], symbols[_rng.Next(6)], symbols[_rng.Next(6)] };
                }
                else
                {
                    res = new[] { symbols[_rng.Next(6)], symbols[_rng.Next(6)], symbols[_rng.Next(6)] };
                }

                _state.BauCua.Result = res;
                _state.BauCuaOverride = "random"; // Reset sau khi dùng
                _state.BauCua.Phase = "rolling";
                _state.BauCua.TimeLeft = 10;
                
                _state.BauCua.History.Add(res);
                if (_state.BauCua.History.Count > 20) _state.BauCua.History.RemoveAt(0);
                
                return res;
            }
        }

        public void AddXocDiaBet(string side, string username, long amount)
        {
            lock (_lock)
            {
                if (_state.XocDia.Phase == "betting" && _state.XocDia.ActiveBets.ContainsKey(side))
                    _state.XocDia.ActiveBets[side].Add((username, amount));
            }
        }

        public void AddBauCuaBet(string choice, string username, long amount)
        {
            lock (_lock)
            {
                if (_state.BauCua.Phase == "betting" && _state.BauCua.ActiveBets.ContainsKey(choice))
                    _state.BauCua.ActiveBets[choice].Add((username, amount));
            }
        }

        public void ClearXocDiaBets()
        {
            lock (_lock)
            {
                foreach (var key in _state.XocDia.ActiveBets.Keys) _state.XocDia.ActiveBets[key].Clear();
            }
        }

        public void ClearBauCuaBets()
        {
            lock (_lock)
            {
                foreach (var key in _state.BauCua.ActiveBets.Keys) _state.BauCua.ActiveBets[key].Clear();
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
