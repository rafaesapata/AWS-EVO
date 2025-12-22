-- Create gamification tables
CREATE TABLE IF NOT EXISTS public.gamification_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,
  type TEXT NOT NULL CHECK (type IN ('savings', 'security', 'compliance', 'streak')),
  requirement JSONB NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  achievement_id UUID REFERENCES public.gamification_achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS public.gamification_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  team_name TEXT,
  total_points INTEGER DEFAULT 0,
  total_savings NUMERIC DEFAULT 0,
  achievements_count INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.savings_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_savings NUMERIC NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  reward_points INTEGER DEFAULT 0,
  participants_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES public.savings_challenges(id) ON DELETE CASCADE,
  user_id UUID,
  current_savings NUMERIC DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.gamification_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read" ON public.gamification_achievements FOR SELECT USING (true);
CREATE POLICY "Allow public access" ON public.user_achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.gamification_leaderboard FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.savings_challenges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.challenge_progress FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON public.gamification_leaderboard(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_savings ON public.gamification_leaderboard(total_savings DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON public.savings_challenges(status);

-- Insert default achievements
INSERT INTO public.gamification_achievements (name, description, icon, type, requirement, points) VALUES
('First Blood', 'Resolva seu primeiro achado de segurança', '🎯', 'security', '{"findings_resolved": 1}', 100),
('Economy Hero', 'Economize $1,000 em um mês', '💰', 'savings', '{"monthly_savings": 1000}', 200),
('Compliance Master', 'Alcance 90% de compliance em todos os frameworks', '🏆', 'compliance', '{"compliance_score": 90}', 500),
('Cost Ninja', 'Implemente 5 recomendações de custo', '⚡', 'savings', '{"recommendations_implemented": 5}', 300),
('Security Champion', 'Resolva 10 achados críticos', '🛡️', 'security', '{"critical_resolved": 10}', 400),
('7-Day Streak', 'Acesse a plataforma por 7 dias consecutivos', '🔥', 'streak', '{"login_streak": 7}', 150),
('Big Saver', 'Economize $10,000 total', '💎', 'savings', '{"total_savings": 10000}', 1000),
('Zero Critical', 'Mantenha zero achados críticos por 30 dias', '✨', 'security', '{"days_zero_critical": 30}', 800)
ON CONFLICT DO NOTHING;

-- Create trigger for leaderboard updated_at
CREATE TRIGGER update_gamification_leaderboard_updated_at
  BEFORE UPDATE ON public.gamification_leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.gamification_achievements IS 'Available achievements and badges';
COMMENT ON TABLE public.user_achievements IS 'Achievements earned by users';
COMMENT ON TABLE public.gamification_leaderboard IS 'Leaderboard rankings for users and teams';
COMMENT ON TABLE public.savings_challenges IS 'Active savings challenges';
COMMENT ON TABLE public.challenge_progress IS 'User progress on challenges';
