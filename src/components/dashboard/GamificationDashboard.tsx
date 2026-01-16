import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { Trophy, Target, Flame, Star, TrendingUp, Award } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function GamificationDashboard() {
  const { data: organizationId } = useOrganization();

  const { data: achievements = [] } = useQuery({
    queryKey: ['achievements'],
    queryFn: async () => {
      const response = await apiClient.select('achievements', {
        select: '*',
        order: { points: 'desc' }
      });
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    },
  });

  const { data: userAchievements = [] } = useQuery({
    queryKey: ['user-achievements', organizationId],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('No organization');
      
      const response = await apiClient.select('user_achievements', {
        select: '*, achievement:achievements(*)',
        eq: { 
          user_id: user.id,
          organization_id: organizationId 
        },
        order: { earned_at: 'desc' }
      });
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    },
    enabled: !!organizationId,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not found');
      
      // Organization-specific leaderboard for data isolation
      const response = await apiClient.select('leaderboard', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { total_points: 'desc' },
        limit: 10
      });
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    },
    enabled: !!organizationId,
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ['challenges', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');
      
      const response = await apiClient.select('challenges', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          is_active: true 
        },
        order: { end_date: 'asc' }
      });
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    },
    enabled: !!organizationId,
  });

  const totalPoints = userAchievements.reduce((sum, ua: any) => sum + (ua.achievement?.points || 0), 0);
  const earnedAchievements = userAchievements.length;
  const totalAchievements = achievements.length;
  const progressPercentage = totalAchievements > 0 ? (earnedAchievements / totalAchievements) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Gamificação & Desafios
        </CardTitle>
        <CardDescription>
          Ganhe pontos, badges e complete desafios de economia
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="achievements">Conquistas</TabsTrigger>
            <TabsTrigger value="challenges">Desafios</TabsTrigger>
            <TabsTrigger value="leaderboard">Ranking</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm opacity-90">Total de Pontos</div>
                      <div className="text-3xl font-semibold">{totalPoints}</div>
                    </div>
                    <Star className="w-12 h-12 opacity-80" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm opacity-90">Conquistas</div>
                      <div className="text-3xl font-semibold">{earnedAchievements}/{totalAchievements}</div>
                    </div>
                    <Award className="w-12 h-12 opacity-80" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm opacity-90">Progresso</div>
                      <div className="text-3xl font-semibold">{progressPercentage.toFixed(0)}%</div>
                    </div>
                    <TrendingUp className="w-12 h-12 opacity-80" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Achievements */}
            <div>
              <h3 className="font-semibold mb-3">Conquistas Recentes</h3>
              {userAchievements.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <Award className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma conquista desbloqueada ainda</p>
                  <p className="text-sm mt-1">Complete tarefas para ganhar suas primeiras badges!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {userAchievements.slice(0, 4).map((ua: any) => (
                    <div key={ua.id} className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-start gap-3">
                        <div className="text-3xl">{ua.achievement?.icon || '🏆'}</div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{ua.achievement?.name}</h4>
                          <p className="text-sm text-muted-foreground mb-2">{ua.achievement?.description}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">+{ua.achievement?.points} pontos</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(ua.earned_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="achievements" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {achievements.map(achievement => {
                const isEarned = userAchievements.some((ua: any) => ua.achievement_id === achievement.id);
                
                return (
                  <div
                    key={achievement.id}
                    className={`p-4 border rounded-lg ${
                      isEarned ? 'bg-primary/5 border-primary' : 'opacity-60 grayscale'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">{achievement.icon || '🏆'}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-sm">{achievement.name}</h4>
                          {isEarned && (
                            <Badge variant="default" className="bg-green-600">
                              Conquistado ✓
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{achievement.description}</p>
                        <Badge variant="outline">{achievement.points} pontos</Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="challenges" className="space-y-4">
            {challenges.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum desafio ativo no momento</p>
              </div>
            ) : (
              challenges.map(challenge => {
                const daysLeft = Math.ceil((new Date(challenge.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                
                return (
                  <Card key={challenge.id} className="border-2 border-primary">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Target className="w-5 h-5 text-primary" />
                            <h3 className="font-semibold text-lg">{challenge.title}</h3>
                          </div>
                          <p className="text-sm text-muted-foreground">{challenge.description}</p>
                        </div>
                        <Badge variant="default" className="bg-orange-600">
                          {challenge.reward_points} pts
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Meta: ${challenge.target_savings.toLocaleString()}</span>
                          <span className="text-muted-foreground">{daysLeft} dias restantes</span>
                        </div>
                        <Progress value={0} className="h-2" />
                        <div className="text-xs text-muted-foreground">
                          {challenge.participants_count || 0} participantes
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="leaderboard" className="space-y-4">
            {leaderboard.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Ranking ainda vazio</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`p-4 border rounded-lg flex items-center gap-4 ${
                      index === 0 ? 'bg-yellow-50 border-yellow-500' :
                      index === 1 ? 'bg-gray-50 border-gray-400' :
                      index === 2 ? 'bg-orange-50 border-orange-500' :
                      ''
                    }`}
                  >
                    <div className="text-2xl font-semibold w-8">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{entry.team_name || `Usuário ${entry.user_id?.substring(0, 8)}`}</div>
                      <div className="text-sm text-muted-foreground">
                        {entry.achievements_count} conquistas · ${(entry.total_savings || 0).toLocaleString()} economizados
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-yellow-600">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="font-semibold">{entry.total_points}</span>
                      </div>
                      {entry.current_streak > 0 && (
                        <div className="flex items-center gap-1 text-orange-600 text-xs">
                          <Flame className="w-3 h-3" />
                          <span>{entry.current_streak} dias</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
