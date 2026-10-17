import fs from 'node:fs/promises';

// Account-specific identifiers and the allowed identity stay out of the public repo.
const input = JSON.parse(await fs.readFile('.local/cloudflare.json', 'utf8'));
for (const name of ['accountId', 'teamDomain', 'allowedEmail', 'developmentDatabaseId', 'productionDatabaseId', 'developmentAudience', 'productionAudience']) {
  if (typeof input[name] !== 'string' || !input[name]) throw new Error(`Missing ${name} in .local/cloudflare.json`);
}
const config = JSON.parse(await fs.readFile('wrangler.jsonc', 'utf8'));
config.$schema = '../node_modules/wrangler/config-schema.json';
config.account_id = input.accountId;
config.main = '../worker/index.ts';
config.assets.directory = '../dist';
config.vars = {ACCESS_TEAM_DOMAIN: input.teamDomain, ACCESS_AUDIENCE: input.developmentAudience, ALLOWED_EMAIL: input.allowedEmail};
config.d1_databases[0].database_id = input.developmentDatabaseId;
config.d1_databases[0].migrations_dir = '../migrations';
config.env.production.vars = {...config.vars, ACCESS_AUDIENCE: input.productionAudience};
config.env.production.d1_databases[0].database_id = input.productionDatabaseId;
config.env.production.d1_databases[0].migrations_dir = '../migrations';
await fs.writeFile('.local/wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
console.log('Prepared ignored .local/wrangler.jsonc. No credentials were printed.');
