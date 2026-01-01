"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    logging_js_1.logger.info('Create profile with organization started', {
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { userId, email, fullName, organizationName } = body;
        if (!userId || !email || !organizationName) {
            return (0, response_js_1.error)('userId, email e organizationName são obrigatórios', 400);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Verificar se já existe profile
        const existingProfile = await prisma.profile.findFirst({
            where: { user_id: userId },
        });
        if (existingProfile) {
            logging_js_1.logger.info('Profile already exists', { userId, profileId: existingProfile.id });
            return (0, response_js_1.success)({
                message: 'Profile já existe',
                profileId: existingProfile.id,
                organizationId: existingProfile.organization_id,
            });
        }
        // Buscar ou criar organização
        const slug = organizationName.toLowerCase().replace(/\s+/g, '-');
        let organization = await prisma.organization.findUnique({
            where: { slug },
        });
        if (!organization) {
            logging_js_1.logger.info('Creating new organization', { organizationName, slug });
            organization = await prisma.organization.create({
                data: {
                    name: organizationName,
                    slug,
                },
            });
        }
        // Criar profile vinculado à organização
        const profile = await prisma.profile.create({
            data: {
                user_id: userId,
                organization_id: organization.id,
                full_name: fullName,
                role: 'user',
            },
            include: {
                organization: true,
            },
        });
        logging_js_1.logger.info('Profile created with organization', {
            userId,
            profileId: profile.id,
            organizationId: organization.id,
            organizationName: organization.name,
        });
        return (0, response_js_1.success)({
            message: 'Profile criado com sucesso',
            profileId: profile.id,
            organizationId: organization.id,
            organizationName: organization.name,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Create profile with organization error', err, {
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)('Erro ao criar profile com organização');
    }
}
//# sourceMappingURL=create-with-organization.js.map