import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import evoLogo from "@/assets/evo-logo.png";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen animated-gradient p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center mb-4">
            <img src={evoLogo} alt="EVO Cloud Intelligence" className="h-16" />
          </div>
          <p className="text-muted-foreground">FinOps & Security Intelligence Platform</p>
        </div>

        <Card className="glass shadow-elegant animate-scale-in">
          <CardHeader>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="mb-4 w-fit"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <CardTitle className="text-3xl">Termos de Serviço</CardTitle>
            <CardDescription>
              Última atualização: {new Date().toLocaleDateString('pt-BR')}
            </CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
              <p className="text-muted-foreground">
                Ao acessar e usar a plataforma EVO (FinOps & Security Intelligence Platform), você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso. Se você não concordar com qualquer parte destes termos, não deverá usar nossos serviços.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
              <p className="text-muted-foreground">
                A EVO é uma plataforma de inteligência que oferece análise de custos (FinOps) e segurança para infraestruturas AWS. Nossos serviços incluem:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Análise de custos e otimização financeira</li>
                <li>Detecção de anomalias e ameaças de segurança</li>
                <li>Monitoramento de recursos e conformidade</li>
                <li>Recomendações de otimização baseadas em IA</li>
                <li>Relatórios e dashboards personalizados</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Requisitos de Conta</h2>
              <p className="text-muted-foreground mb-2">
                Para usar a plataforma EVO, você deve:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Fornecer informações precisas e completas durante o registro</li>
                <li>Utilizar um endereço de e-mail corporativo válido</li>
                <li>Manter a confidencialidade de suas credenciais de acesso</li>
                <li>Notificar-nos imediatamente sobre qualquer uso não autorizado de sua conta</li>
                <li>Ser responsável por todas as atividades realizadas através de sua conta</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Licenciamento e Assinaturas</h2>
              <p className="text-muted-foreground">
                O acesso à plataforma EVO requer uma licença válida. As licenças são vinculadas à sua organização através de um customer_id fornecido após a aquisição. O uso da plataforma está sujeito aos limites de assentos (seats) contratados. Administradores da organização têm prioridade na alocação de assentos em caso de excedente de usuários.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Uso Aceitável</h2>
              <p className="text-muted-foreground mb-2">
                Você concorda em não:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Usar a plataforma para qualquer finalidade ilegal ou não autorizada</li>
                <li>Tentar acessar dados ou recursos de outras organizações</li>
                <li>Interferir ou interromper a integridade ou desempenho da plataforma</li>
                <li>Fazer engenharia reversa, descompilar ou desmontar qualquer parte do serviço</li>
                <li>Compartilhar credenciais de acesso com terceiros não autorizados</li>
                <li>Realizar atividades que possam sobrecarregar nossos sistemas</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Acesso AWS e Credenciais</h2>
              <p className="text-muted-foreground">
                Para utilizar os recursos de análise da plataforma, você deve fornecer credenciais de acesso AWS com permissões adequadas. Você é responsável por:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Garantir que as credenciais AWS fornecidas tenham apenas as permissões necessárias (princípio do menor privilégio)</li>
                <li>Manter a segurança e confidencialidade de suas credenciais AWS</li>
                <li>Gerenciar os custos associados ao uso dos serviços AWS</li>
                <li>Revisar e aprovar ações recomendadas antes de sua execução</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Privacidade e Proteção de Dados</h2>
              <p className="text-muted-foreground">
                Levamos a privacidade de seus dados a sério. Todas as informações coletadas são isoladas por organização e protegidas por políticas de segurança rigorosas (RLS - Row Level Security). Seus dados AWS são acessados apenas para fins de análise e não são compartilhados com terceiros. Para mais informações, consulte nossa Política de Privacidade.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Propriedade Intelectual</h2>
              <p className="text-muted-foreground">
                Todo o conteúdo, funcionalidades e código da plataforma EVO são propriedade exclusiva da Nueva Core e seus licenciadores. Você recebe uma licença limitada, não exclusiva e não transferível para usar a plataforma conforme estes termos. Todos os direitos não expressamente concedidos são reservados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Limitação de Responsabilidade</h2>
              <p className="text-muted-foreground">
                A plataforma EVO fornece recomendações e análises baseadas em dados disponíveis. No entanto, você é o único responsável por revisar e aprovar quaisquer mudanças em sua infraestrutura AWS. Não nos responsabilizamos por:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Custos adicionais incorridos devido a ações executadas com base em nossas recomendações</li>
                <li>Interrupções de serviço ou perda de dados resultantes de ações realizadas</li>
                <li>Decisões tomadas com base nas análises fornecidas</li>
                <li>Problemas causados por configurações incorretas de credenciais AWS</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">10. Disponibilidade do Serviço</h2>
              <p className="text-muted-foreground">
                Embora nos esforcemos para manter a plataforma disponível 24/7, não garantimos que o serviço será ininterrupto ou livre de erros. Reservamo-nos o direito de modificar, suspender ou descontinuar qualquer aspecto do serviço a qualquer momento, com ou sem aviso prévio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">11. Modificações dos Termos</h2>
              <p className="text-muted-foreground">
                Reservamo-nos o direito de modificar estes termos a qualquer momento. Notificaremos você sobre mudanças significativas através da plataforma ou por e-mail. O uso continuado da plataforma após tais modificações constitui sua aceitação dos novos termos.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">12. Rescisão</h2>
              <p className="text-muted-foreground">
                Podemos suspender ou encerrar seu acesso à plataforma imediatamente, sem aviso prévio, por qualquer violação destes termos. Você pode encerrar sua conta a qualquer momento entrando em contato conosco. Após o encerramento, você perderá acesso a todos os dados e configurações da plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">13. Lei Aplicável</h2>
              <p className="text-muted-foreground">
                Estes termos são regidos pelas leis do Brasil. Qualquer disputa relacionada a estes termos será resolvida nos tribunais competentes do Brasil.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">14. Contato</h2>
              <p className="text-muted-foreground">
                Para dúvidas sobre estes Termos de Serviço, entre em contato através de:
              </p>
              <ul className="list-none pl-0 text-muted-foreground space-y-1">
                <li><strong>Website:</strong> https://www.nuevacore.com</li>
                <li><strong>E-mail:</strong> suporte@nuevacore.com</li>
              </ul>
            </section>

            <section className="border-t pt-6">
              <p className="text-sm text-muted-foreground italic">
                Ao utilizar a plataforma EVO, você reconhece que leu, compreendeu e concorda em estar vinculado a estes Termos de Serviço.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
