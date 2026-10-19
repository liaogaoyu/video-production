const { openServices } = require("./context.cjs");
const { createHttpApp } = require("./api.cjs");

async function main() {
  const services = openServices();
  const app = await createHttpApp(services);
  await app.listen({ port: services.paths.port, host: services.paths.host });
  console.log(`Storydock API http://${services.paths.host}:${services.paths.port}`);
  if (services.masterKeyCreated) console.log(`已生成主密钥，请单独备份：${services.paths.masterKey}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main };
